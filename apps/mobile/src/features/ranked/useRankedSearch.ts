/**
 * The state and the calls of a Play ranked search (#532), over the
 * `Matchmaking` port. The screen is `RankedScreen.tsx`.
 *
 * - The seek is live (`watchMySeek`): `waiting` is the search, `matched`
 *   the match found, `none` no search.
 * - A seek that is `matched` when the screen opens belongs to a match
 *   that started before (the server keeps it for ten minutes): the screen
 *   shows the setup, never that match again. So does a later update of
 *   the same match.
 * - Find a player sends `seek`; the server may match at once. Try another
 *   game sends `seek` with the other game: the server replaces the seek.
 *   Cancel sends `cancel`.
 * - A search that turns `none` with no cancel from this phone ended on
 *   the server after five minutes: `expired` says so.
 * - The wait counts on the phone clock from the seek's `since` (clamped,
 *   so a wrong phone clock never shows a negative or endless wait).
 * - A match notes your rating then (`rememberRankedStart`) for the match
 *   end.
 * - One call at a time (`busy`). A failed call sets `problem`; the seek
 *   stays as the server has it.
 *
 * Analytics: `ranked_search_started` and `ranked_search_ended` (the game,
 * how it ended, the wait). Never a rating, a name or an id.
 */
import {
  isMatchmakingErrorData,
  SEEK_TTL_MS,
  type Analytics,
  type LookingCounts,
  type Matchmaking,
  type MySeek,
  type RankedGame,
  type RankedSearchEnd,
  type SeekPlayer,
} from '@tavli/contracts';
import { useCallback, useEffect, useRef, useState } from 'react';

import { sendRankedSearchEnded, sendRankedSearchStarted } from './rankedAnalytics';
import { rememberRankedStart } from './rankedStarts';

export type RankedSearchState =
  /** The first seek has not come yet. */
  | { readonly kind: 'loading' }
  /** No search: the setup. */
  | { readonly kind: 'idle' }
  | {
      readonly kind: 'searching';
      readonly game: RankedGame;
      /** When the search started, on the phone clock. */
      readonly startedAt: number;
      /** Your rating at the start: the middle of the range. */
      readonly rating: number;
    }
  | {
      readonly kind: 'matched';
      readonly game: RankedGame;
      readonly gameId: string;
      readonly me: SeekPlayer;
      readonly opponent: SeekPlayer;
    };

/** Why the last call failed. */
export type RankedProblem = 'notSaved' | 'notSignedIn' | 'network';

export interface RankedSearch {
  readonly state: RankedSearchState;
  /** A call is on its way. */
  readonly busy: boolean;
  readonly problem: RankedProblem | null;
  /** The last search ended on the server with nobody found (five minutes). */
  readonly expired: boolean;
  readonly find: (game: RankedGame) => Promise<void>;
  /** Ends the search; `how` is for analytics (Cancel, Back, the bot). */
  readonly cancel: (how: Extract<RankedSearchEnd, 'cancelled' | 'bot'>) => Promise<void>;
  /** Looks for `game` instead of the game of the search. */
  readonly switchGame: (game: RankedGame) => Promise<void>;
  readonly dismissProblem: () => void;
  /** How many look for each game: for "Try another game". */
  readonly lookingCounts: () => Promise<LookingCounts | null>;
}

export interface RankedSearchDeps {
  readonly matchmaking: Matchmaking;
  readonly analytics: Analytics;
  /** The phone clock. Default: `Date.now`. Keep it the same function across renders. */
  readonly now?: () => number;
}

function problemOf(error: unknown): RankedProblem {
  if (isMatchmakingErrorData(error)) {
    if (error.code === 'NOT_SAVED') return 'notSaved';
    if (error.code === 'NOT_SIGNED_IN') return 'notSignedIn';
  }
  return 'network';
}

export function useRankedSearch({
  matchmaking,
  analytics,
  now = Date.now,
}: RankedSearchDeps): RankedSearch {
  const [state, setState] = useState<RankedSearchState>({ kind: 'loading' });
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<RankedProblem | null>(null);
  const [expired, setExpired] = useState(false);
  // Read in the watch callback, which outlives a render.
  const current = useRef<RankedSearchState>(state);
  /** The match of a seek seen `matched` on the first update: never shown. */
  const oldMatch = useRef<string | null>(null);
  const first = useRef(true);
  /** This phone ended the search: a `none` after it is no expiry. */
  const endedHere = useRef(false);
  /** A seek this phone sent: the server may match it before any `waiting`. */
  const asked = useRef<{ game: RankedGame; at: number } | null>(null);

  const show = useCallback((next: RankedSearchState) => {
    current.current = next;
    setState(next);
  }, []);

  const apply = useCallback(
    (seek: MySeek) => {
      const was = current.current;
      const isFirst = first.current;
      first.current = false;
      const sent = asked.current;
      asked.current = null;
      if (seek.kind === 'none') {
        if (was.kind === 'searching' && !endedHere.current) {
          setExpired(true);
          sendRankedSearchEnded(analytics, was.game, 'expired', now() - was.startedAt);
        }
        show({ kind: 'idle' });
        return;
      }
      if (seek.kind === 'waiting') {
        endedHere.current = false;
        // The same search goes on: keep its start.
        if (was.kind === 'searching' && was.game === seek.game) return;
        const at = now();
        const waited = Math.min(SEEK_TTL_MS, Math.max(0, at - seek.since));
        show({ kind: 'searching', game: seek.game, startedAt: at - waited, rating: seek.rating });
        return;
      }
      // Matched.
      if (isFirst) oldMatch.current = seek.gameId;
      if (seek.gameId === oldMatch.current) {
        show({ kind: 'idle' });
        return;
      }
      if (was.kind === 'matched' && was.gameId === seek.gameId) return;
      if (sent !== null) {
        // Matched at once, before any `waiting` of this seek. After Try
        // another game the old search already ended as `otherGame`.
        sendRankedSearchEnded(analytics, seek.game, 'matched', now() - sent.at);
      } else if (was.kind === 'searching') {
        sendRankedSearchEnded(analytics, was.game, 'matched', now() - was.startedAt);
      }
      rememberRankedStart(seek.gameId, seek.me.rating);
      show({
        kind: 'matched',
        game: seek.game,
        gameId: seek.gameId,
        me: seek.me,
        opponent: seek.opponent,
      });
    },
    [analytics, now, show],
  );

  useEffect(() => {
    const stop = matchmaking.watchMySeek(apply, (error) => {
      setProblem(problemOf(error));
      // With no seek to show, show the setup.
      if (current.current.kind === 'loading') show({ kind: 'idle' });
    });
    return stop;
  }, [matchmaking, apply, show]);

  const run = useCallback(
    async (call: () => Promise<void>): Promise<boolean> => {
      setBusy(true);
      setProblem(null);
      try {
        await call();
        // The watch brings the new seek too; this one shows it at once.
        apply(await matchmaking.mySeek());
        return true;
      } catch (error) {
        setProblem(problemOf(error));
        return false;
      } finally {
        setBusy(false);
      }
    },
    [apply, matchmaking],
  );

  const find = useCallback(
    async (game: RankedGame) => {
      setExpired(false);
      endedHere.current = false;
      sendRankedSearchStarted(analytics, game);
      asked.current = { game, at: now() };
      await run(() => matchmaking.seek({ game }));
    },
    [analytics, matchmaking, now, run],
  );

  const cancel = useCallback(
    async (how: Extract<RankedSearchEnd, 'cancelled' | 'bot'>) => {
      const was = current.current;
      endedHere.current = true;
      const done = await run(() => matchmaking.cancel());
      if (done && was.kind === 'searching') {
        sendRankedSearchEnded(analytics, was.game, how, now() - was.startedAt);
      }
    },
    [analytics, matchmaking, now, run],
  );

  const switchGame = useCallback(
    async (game: RankedGame) => {
      const was = current.current;
      if (was.kind === 'searching') {
        sendRankedSearchEnded(analytics, was.game, 'otherGame', now() - was.startedAt);
      }
      sendRankedSearchStarted(analytics, game);
      asked.current = { game, at: now() };
      await run(() => matchmaking.seek({ game }));
    },
    [analytics, matchmaking, now, run],
  );

  const lookingCounts = useCallback(async () => {
    try {
      return await matchmaking.lookingCounts();
    } catch {
      return null;
    }
  }, [matchmaking]);

  return {
    state,
    busy,
    problem,
    expired,
    find,
    cancel,
    switchGame,
    dismissProblem: () => setProblem(null),
    lookingCounts,
  };
}

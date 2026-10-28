/**
 * "Your online games" (#297): the active online games of the saved
 * session, live from the server (`GameTransport.watchMyGames`).
 *
 * The hook makes no account: with no saved session it shows nothing. The
 * rest is pure: the order (your turn first), the row text and the time
 * left. Never send the user id to analytics.
 */
import type { AuthProvider, AuthUser, GameSummary, GameTransport } from '@tavli/contracts';
import type { TFunction } from 'i18next';
import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { forgetOnlineAccount } from './accountHint';
import { clockText, clockTickMs } from './clock';
import { timeLeft } from './timeLeft';

/** The most rows Home shows. "See all" opens the whole list. */
export const HOME_GAME_ROWS = 3;

export type MyGamesState =
  /** No saved session: no list at all. */
  | { readonly status: 'signedOut' }
  /** Loading the session, then the first list. */
  | { readonly status: 'loading' }
  /**
   * The newest list, "your turn" first (`yourTurnFirst`). `offset` is the
   * server clock minus the phone clock, as far as the list tells
   * (`clockOffset`). `failed`: the watch failed after this list came, so
   * it may be old.
   */
  | {
      readonly status: 'loaded';
      readonly games: readonly GameSummary[];
      readonly offset: number;
      readonly failed: boolean;
    }
  /**
   * The session or the first list did not load. `retry` tries again. A
   * session that `ready()` gives as `null` counts as this too: Better Auth
   * gives `null` when it cannot reach the server, so that is no sign-out.
   */
  | { readonly status: 'failed' };

/** Your turn first; each part keeps the server order (newest change first). */
export function yourTurnFirst(games: readonly GameSummary[]): GameSummary[] {
  return [...games.filter((game) => game.myTurn), ...games.filter((game) => !game.myTurn)];
}

/**
 * The server clock minus the phone clock, as far as a list that arrives
 * at phone time `localNow` tells. The newest change (`updatedAt`) was
 * saved before the list left the server, so the server clock is at least
 * that far. A phone that runs behind is set right; otherwise the phone
 * clock counts (0). The phone may then show a little less time than the
 * server has, never more by more than its clock is wrong. The game screen
 * keeps its own, closer estimate (`timeLeft.ts`).
 */
export function clockOffset(games: readonly GameSummary[], localNow: number): number {
  const newest = Math.max(...games.map((game) => game.updatedAt), localNow);
  return newest - localNow;
}

/**
 * How often the list updates its clocks: as often as the fastest game
 * needs (`clockTickMs`), or `null` when no game has a turn timer.
 */
export function listTickMs(games: readonly GameSummary[]): number | null {
  const ticks = games
    .filter((game) => game.turnDeadline !== null)
    .map((game) => clockTickMs(game.pace));
  return ticks.length === 0 ? null : Math.min(...ticks);
}

export interface GameRowText {
  /** "Portes vs friend". */
  readonly title: string;
  /** "Your turn" or "Waiting for your friend". */
  readonly turn: string;
  /** Your points first: "3–1". */
  readonly score: string;
  /** "23 h left", or `null` when no turn timer runs. */
  readonly time: string | null;
  /** What a screen reader reads for the whole row: "Portes vs friend, your turn, 3 to 1, 23 h left". */
  readonly label: string;
}

/** The text of one row at phone time `localNow`. */
export function gameRowText(
  game: GameSummary,
  t: TFunction,
  localNow: number,
  offset: number,
): GameRowText {
  const title = t('home.online.vsFriend', { game: t(`games.${game.choice}`) });
  const turn = game.myTurn ? t('home.online.yourTurn') : t('home.online.waiting');
  const me = game.score[game.mySide];
  const friend = game.score[game.mySide === 'white' ? 'black' : 'white'];
  const score = t('home.online.score', { me, friend });
  const left = timeLeft(game, localNow, offset);
  const time =
    left === null ? null : t('home.online.timeLeft', { time: clockText(left, game.pace, t) });
  const spoken = [title, turn, t('home.online.scoreSpoken', { me, friend }), time];
  return { title, turn, score, time, label: spoken.filter((part) => part !== null).join(', ') };
}

/**
 * The active online games of the saved session, live. It reads the
 * session (`auth.ready()`) and follows sign-in and sign-out
 * (`auth.onChange`); it never makes an account. A failure after a list
 * came keeps that list (`failed: true`); `retry` starts the watch again.
 *
 * Only `onChange(null)` is a sign-out: it hides the list and forgets the
 * account note (`forgetOnlineAccount`). `ready()` giving `null` may only
 * mean no network (Better Auth's `ready()` never rejects), so it shows
 * `failed` and keeps the note; `retry` loads the session again.
 */
export function useMyOnlineGames(
  auth: AuthProvider,
  games: GameTransport,
  now: () => number = Date.now,
): { readonly state: MyGamesState; readonly retry: () => void } {
  const [state, setState] = useState<MyGamesState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    /** The user the watch is for: `undefined` before the session loads. */
    let current: string | null | undefined;
    let stop: (() => void) | null = null;

    /** Keeps the list on a failure; with no list yet the load failed. */
    const fail = () => {
      if (!live) return;
      setState((last) =>
        last.status === 'loaded' ? { ...last, failed: true } : { status: 'failed' },
      );
    };

    const follow = (user: AuthUser | null) => {
      if (!live) return;
      const id = user?.id ?? null;
      if (id === current) return;
      const switched = current !== undefined;
      current = id;
      stop?.();
      stop = null;
      if (id === null) {
        // Signed out: Home stops loading the session at start.
        forgetOnlineAccount();
        setState({ status: 'signedOut' });
        return;
      }
      // Another user's list is not this user's: load it from scratch. A
      // retry keeps the old list of the same user until the new one comes.
      setState((last) => (switched || last.status !== 'loaded' ? { status: 'loading' } : last));
      stop = games.watchMyGames(
        { status: 'active' },
        (list) => {
          if (!live) return;
          setState({
            status: 'loaded',
            games: yourTurnFirst(list),
            offset: clockOffset(list, now()),
            failed: false,
          });
        },
        fail,
      );
    };

    /** No session from `ready()`: maybe no network, so no sign-out. */
    const loaded = (user: AuthUser | null) => {
      if (user !== null) follow(user);
      else if (current === undefined) fail();
    };

    const unsubscribe = auth.onChange(follow);
    auth.ready().then(loaded, fail);
    return () => {
      live = false;
      unsubscribe();
      stop?.();
    };
  }, [auth, games, now, attempt]);

  const retry = useCallback(() => {
    setState((last) => (last.status === 'failed' ? { status: 'loading' } : last));
    setAttempt((n) => n + 1);
  }, []);

  return { state, retry };
}

/**
 * The phone time, updated every `tickMs` while `running` (a list with a
 * turn timer on a screen in view), and at once when it starts running or
 * the app comes back to the front (timers run late after the background).
 * `null` never updates.
 */
export function usePhoneClock(tickMs: number | null, running: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (tickMs === null || !running) return;
    const tick = () => setNow(Date.now());
    // At once too: the screen may come back into view hours later.
    const first = setTimeout(tick, 0);
    const timer = setInterval(tick, tickMs);
    const front = AppState.addEventListener('change', (next) => {
      if (next === 'active') tick();
    });
    return () => {
      clearTimeout(first);
      clearInterval(timer);
      front.remove();
    };
  }, [tickMs, running]);
  return now;
}

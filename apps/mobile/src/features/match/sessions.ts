/**
 * Local matches (vs bot and pass-and-play). MVP1 keeps one match at a time.
 *
 * A session is the match setup plus its game store. The route
 * `app/game/[id]` finds the session by its id (`local-…`).
 *
 * With a `Storage`, the match is saved (#36, `savedMatch.ts`):
 * - when it starts, and after every finished turn (a confirm, a pass, a
 *   game end, the next game, a rematch): whenever the flow comes to rest;
 * - on `saveNow()` (the app goes to the background, the user exits);
 * - a finished match is removed from the slot.
 * `get(id)` loads the saved match after an app restart.
 *
 * With `createAnalytics`, every match sends game events (#61): a new one
 * sends `game_started`; a resumed one does not (it started before). A new
 * match that replaces an unfinished one sends `game_abandoned` for it.
 *
 * With `history`, every match adds a record to the match history (#142):
 * when it is over (won or resigned), and when a new match (or a saved one
 * that `get(id)` loads) replaces one that had started (`abandoned`). A
 * history error never breaks a move.
 *
 * A save of a match the history already holds is stale (#150): the match
 * ended but the app died before the slot was cleared, or it was left but
 * the remove failed. A match is named by its session id and its
 * `matchNumber` (1, then +1 per rematch), never by a time, so a clock set
 * back cannot make a live save look stale. `peek()` and `get(id)` treat a
 * stale save as no save but do not delete it; `start()` and `end(id)` do.
 */
import type { Storage } from '@tavli/contracts';
import type { MatchFlow, Rng } from '@tavli/engine';

import type { GameAnalytics } from '@/features/analytics/gameAnalytics';
import { createGameStore, type GameStore } from '@/features/game/gameStore';
import { historyRecord, type HistoryRecord, type MatchEnd } from '@/features/history/records';

import {
  SAVED_MATCH_KEY,
  parseSavedMatch,
  serializeSavedMatch,
  type SavedMatch,
  type SavedMatchResult,
} from './savedMatch';
import {
  ALL_GAME_LEVELS,
  enginePlayers,
  gameRuleSet,
  type GameLevels,
  type MatchSetup,
} from './setup';

export interface MatchSession {
  /** `local-<random>`. Online games (MVP2) use the server id. */
  readonly id: string;
  readonly setup: MatchSetup;
  readonly store: GameStore;
}

export interface SessionRegistry {
  /** Starts a new match. It replaces (and unsaves) the match before it. */
  start: (setup: MatchSetup) => MatchSession;
  /** The match with this id (from memory or the save slot), or `null`. */
  get: (id: string) => MatchSession | null;
  /** The match in memory, or `null`. */
  current: () => MatchSession | null;
  /** Forgets the match and clears its save (the user leaves it for a new one). */
  end: (id: string) => void;
  /** Saves the match in memory now, mid-turn too. */
  saveNow: () => void;
  /** The save slot. A broken save is removed here, and reported once. */
  peek: () => SavedMatchResult;
}

export interface SessionDeps {
  /** Dice for a match. */
  readonly createRng: () => Rng;
  /** Where the match is saved. Without it, matches live in memory only. */
  readonly storage?: Storage;
  /** The bot levels this build can play, per game (a saved level it cannot play becomes Easy). */
  readonly levels?: GameLevels;
  readonly now?: () => number;
  /** Game events for a match (#61). Leave it out in tests that do not check them. */
  readonly createAnalytics?: (setup: MatchSetup) => GameAnalytics;
  /** The match history (#142). Leave it out in tests that do not check it. */
  readonly history?: MatchHistory;
}

/** What the registry needs from the match history (#142). */
export interface MatchHistory {
  readonly add: (record: HistoryRecord) => void;
  /** Is match `matchNumber` of session `sessionId` in the history (finished or left)? */
  readonly hasMatch: (sessionId: string, matchNumber: number) => boolean;
}

/** A new local match id. Not a secret; it only has to be unique on this phone. */
export function newMatchId(rng: Rng, now: number = Date.now()): string {
  return `local-${now.toString(36)}-${rng.nextUint32().toString(36)}`;
}

/** Between turns: the flow waits for a roll, an opening roll or the next game. */
export function isRestPoint(flow: MatchFlow): boolean {
  const phase = flow.game.phase;
  return phase === 'awaiting-roll' || phase === 'opening-roll' || phase === 'game-over';
}

/**
 * Has anyone played in this match? A game finished, or someone rolled for a
 * turn (`roll`) or moved. The opening roll (`rollOpening`, `chooseStarter`)
 * does not count. A match left before that gets no history record.
 */
export function hasStarted(flow: MatchFlow): boolean {
  return (
    flow.match.games.length > 0 || flow.log.some((e) => e.type === 'roll' || e.type === 'move')
  );
}

export function createSessionRegistry({
  createRng,
  storage,
  levels = ALL_GAME_LEVELS,
  now = Date.now,
  createAnalytics,
  history,
}: SessionDeps): SessionRegistry {
  let session: MatchSession | null = null;
  let unsubscribe: (() => void) | null = null;
  let sessionAnalytics: GameAnalytics | null = null;
  // The match within the session in memory: 1, then +1 per rematch.
  let matchNumber = 1;

  // It runs inside the store's `set` (a subscriber), after the flow has
  // changed. A storage error must not throw out of `dispatch`: the move is
  // played, only the save failed. The next save tries again.
  const write = (s: MatchSession) => {
    if (!storage) return;
    try {
      const { flow } = s.store.getState();
      if (flow.match.status === 'finished') {
        storage.remove(SAVED_MATCH_KEY);
        return;
      }
      storage.setString(
        SAVED_MATCH_KEY,
        serializeSavedMatch(s.id, s.setup, flow, now(), matchNumber),
      );
    } catch (error) {
      console.warn('could not save the match', error);
    }
  };

  // Reads and removes never throw either. A storage error (full disk, an MMKV
  // failure) must not break Home, New game or the game route: a failed read
  // counts as no save, and a failed remove only logs.
  const readSaved = (): string | undefined => {
    try {
      return storage?.getString(SAVED_MATCH_KEY);
    } catch (error) {
      console.warn('could not read the saved match', error);
      return undefined;
    }
  };

  const removeSaved = () => {
    try {
      storage?.remove(SAVED_MATCH_KEY);
    } catch (error) {
      console.warn('could not remove the saved match', error);
    }
  };

  // Like a save, a history error must not throw out of `dispatch`.
  const record = (
    id: string,
    setup: MatchSetup,
    flow: MatchFlow,
    end: MatchEnd,
    number: number | null,
  ) => {
    if (!history) return;
    if (end === 'abandoned' && (flow.match.status === 'finished' || !hasStarted(flow))) return;
    try {
      history.add(historyRecord(id, setup, flow.match, now(), end, number));
    } catch (error) {
      console.warn('could not add the match to the history', error);
    }
  };

  // A save of a match the history holds is stale (see the top). A save
  // from before #150 has no number: it is never stale.
  const isStale = (saved: SavedMatch): boolean => {
    if (!history || saved.matchNumber === null) return false;
    try {
      return history.hasMatch(saved.id, saved.matchNumber);
    } catch (error) {
      console.warn('could not read the match history', error);
      return false;
    }
  };

  // The slot as it is, stale or not. As before #150, a broken save (or a
  // finished one from an older app) is removed, so Home reports it once.
  const readSlot = (): SavedMatchResult => {
    if (!storage) return { kind: 'none' };
    const result = parseSavedMatch(readSaved(), levels);
    if (result.kind !== 'ok') removeSaved();
    return result;
  };

  // Reads only: a stale save counts as none here; `start` and `end` delete it.
  const peek = (): SavedMatchResult => {
    const result = readSlot();
    return result.kind === 'ok' && isStale(result.saved) ? { kind: 'none' } : result;
  };

  const attach = (next: MatchSession, analytics: GameAnalytics | undefined, number: number) => {
    unsubscribe?.();
    session = next;
    sessionAnalytics = analytics ?? null;
    matchNumber = number;
    unsubscribe = next.store.subscribe((state, prev) => {
      if (state.flow === prev.flow) return;
      // Once per match: a rematch starts a new one in the same session.
      if (state.flow.match.status === 'finished' && prev.flow.match.status !== 'finished') {
        record(next.id, next.setup, state.flow, 'finished', matchNumber);
      }
      if (prev.flow.match.status === 'finished' && state.flow.match.status !== 'finished') {
        matchNumber += 1;
      }
      if (state.flow.match.status === 'finished' || isRestPoint(state.flow)) write(next);
    });
  };

  const forget = () => {
    unsubscribe?.();
    unsubscribe = null;
    session = null;
    sessionAnalytics = null;
  };

  // The player left the match in memory: `game_abandoned`, and an
  // `abandoned` history record. `gameAbandoned` ignores a finished game or
  // match; so does `record`.
  const abandonSession = (s: MatchSession) => {
    const { flow } = s.store.getState();
    sessionAnalytics?.gameAbandoned(flow);
    record(s.id, s.setup, flow, 'abandoned', matchNumber);
  };

  // A new match replaces the one before it. If that one was not over (in
  // memory, or only in the save slot after a restart), the player left it.
  // A stale save is not recorded again: `peek` hides it.
  const abandonPrevious = () => {
    if (!createAnalytics && !history) return;
    if (session) {
      abandonSession(session);
      return;
    }
    const result = peek();
    if (result.kind !== 'ok') return;
    const { id, setup, flow } = result.saved;
    createAnalytics?.(setup).gameAbandoned(flow);
    record(id, setup, flow, 'abandoned', result.saved.matchNumber);
  };

  return {
    start: (setup) => {
      abandonPrevious();
      forget();
      // This also deletes a stale save.
      removeSaved();
      const analytics = createAnalytics?.(setup);
      const store = createGameStore({
        players: enginePlayers(setup),
        targetPoints: setup.targetPoints,
        // The chosen game (#109): one game, or the Tavli rotation.
        rules: gameRuleSet(setup.game),
        rng: createRng(),
        ...(analytics ? { analytics } : {}),
      });
      const next = { id: newMatchId(createRng(), now()), setup, store };
      attach(next, analytics, 1);
      write(next);
      return next;
    },
    get: (id) => {
      if (session?.id === id) return session;
      const result = peek();
      if (result.kind !== 'ok' || result.saved.id !== id) return null;
      // Only here does `get` replace the match in memory with another one
      // (rare: that one's save failed, so the slot still holds this one).
      // That one leaves memory for good, so the player left it. A lookup
      // that finds nothing, or the match in memory, changes nothing.
      if (session) abandonSession(session);
      const { setup, flow, matchNumber: number } = result.saved;
      // A resumed match gets game events too, but no new `game_started`:
      // the game started before the app closed.
      const analytics = createAnalytics?.(setup);
      const store = createGameStore({
        players: enginePlayers(setup),
        rng: createRng(),
        flow,
        ...(analytics ? { analytics } : {}),
      });
      const restored = { id, setup, store };
      // A save from before #150 has no number: count it as the first match.
      attach(restored, analytics, number ?? 1);
      return restored;
    },
    current: () => session,
    end: (id) => {
      if (session?.id === id) forget();
      // Stale or not, the player is done with this match.
      const slot = readSlot();
      if (slot.kind === 'ok' && slot.saved.id === id) removeSaved();
    },
    saveNow: () => {
      if (session) write(session);
    },
    peek,
  };
}

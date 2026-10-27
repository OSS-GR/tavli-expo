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
 */
import type { Difficulty, Storage } from '@tavli/contracts';
import type { MatchFlow, Rng } from '@tavli/engine';

import type { GameAnalytics } from '@/features/analytics/gameAnalytics';
import { createGameStore, type GameStore } from '@/features/game/gameStore';

import {
  SAVED_MATCH_KEY,
  parseSavedMatch,
  serializeSavedMatch,
  type SavedMatchResult,
} from './savedMatch';
import { enginePlayers, type MatchSetup } from './setup';

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
  /** The bot levels this build can play (a saved level it cannot play becomes Easy). */
  readonly levels?: readonly Difficulty[];
  readonly now?: () => number;
  /** Game events for a match (#61). Leave it out in tests that do not check them. */
  readonly createAnalytics?: (setup: MatchSetup) => GameAnalytics;
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

export function createSessionRegistry({
  createRng,
  storage,
  levels = ['easy'],
  now = Date.now,
  createAnalytics,
}: SessionDeps): SessionRegistry {
  let session: MatchSession | null = null;
  let unsubscribe: (() => void) | null = null;
  let sessionAnalytics: GameAnalytics | null = null;

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
      storage.setString(SAVED_MATCH_KEY, serializeSavedMatch(s.id, s.setup, flow, now()));
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

  const savedId = (): string | null => {
    const result = peek();
    return result.kind === 'ok' ? result.saved.id : null;
  };

  const peek = (): SavedMatchResult => {
    if (!storage) return { kind: 'none' };
    const result = parseSavedMatch(readSaved(), levels);
    if (result.kind !== 'ok') removeSaved();
    return result;
  };

  const attach = (next: MatchSession, analytics: GameAnalytics | undefined) => {
    unsubscribe?.();
    session = next;
    sessionAnalytics = analytics ?? null;
    unsubscribe = next.store.subscribe((state, prev) => {
      if (state.flow === prev.flow) return;
      if (state.flow.match.status === 'finished' || isRestPoint(state.flow)) write(next);
    });
  };

  const forget = () => {
    unsubscribe?.();
    unsubscribe = null;
    session = null;
    sessionAnalytics = null;
  };

  // A new match replaces the one before it. If that one was not over (in
  // memory, or only in the save slot after a restart), the player left it:
  // `game_abandoned`. `gameAbandoned` ignores a finished game or match.
  const abandonPrevious = () => {
    if (!createAnalytics) return;
    if (session) {
      sessionAnalytics?.gameAbandoned(session.store.getState().flow);
      return;
    }
    const result = peek();
    if (result.kind === 'ok') createAnalytics(result.saved.setup).gameAbandoned(result.saved.flow);
  };

  return {
    start: (setup) => {
      abandonPrevious();
      forget();
      removeSaved();
      const analytics = createAnalytics?.(setup);
      const store = createGameStore({
        players: enginePlayers(setup),
        targetPoints: setup.targetPoints,
        rng: createRng(),
        ...(analytics ? { analytics } : {}),
      });
      const next = { id: newMatchId(createRng(), now()), setup, store };
      attach(next, analytics);
      write(next);
      return next;
    },
    get: (id) => {
      if (session?.id === id) return session;
      const result = peek();
      if (result.kind !== 'ok' || result.saved.id !== id) return null;
      const { setup, flow } = result.saved;
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
      attach(restored, analytics);
      return restored;
    },
    current: () => session,
    end: (id) => {
      if (session?.id === id) forget();
      if (savedId() === id) removeSaved();
    },
    saveNow: () => {
      if (session) write(session);
    },
    peek,
  };
}

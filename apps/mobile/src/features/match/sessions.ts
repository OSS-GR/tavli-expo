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
 */
import type { Difficulty, Storage } from '@tavli/contracts';
import type { MatchFlow, Rng } from '@tavli/engine';

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
}: SessionDeps): SessionRegistry {
  let session: MatchSession | null = null;
  let unsubscribe: (() => void) | null = null;

  const write = (s: MatchSession) => {
    if (!storage) return;
    const { flow } = s.store.getState();
    if (flow.match.status === 'finished') {
      storage.remove(SAVED_MATCH_KEY);
      return;
    }
    storage.setString(SAVED_MATCH_KEY, serializeSavedMatch(s.id, s.setup, flow, now()));
  };

  const savedId = (): string | null => {
    const result = peek();
    return result.kind === 'ok' ? result.saved.id : null;
  };

  const peek = (): SavedMatchResult => {
    if (!storage) return { kind: 'none' };
    const result = parseSavedMatch(storage.getString(SAVED_MATCH_KEY), levels);
    if (result.kind !== 'ok') storage.remove(SAVED_MATCH_KEY);
    return result;
  };

  const attach = (next: MatchSession) => {
    unsubscribe?.();
    session = next;
    unsubscribe = next.store.subscribe((state, prev) => {
      if (state.flow === prev.flow) return;
      if (state.flow.match.status === 'finished' || isRestPoint(state.flow)) write(next);
    });
  };

  const forget = () => {
    unsubscribe?.();
    unsubscribe = null;
    session = null;
  };

  return {
    start: (setup) => {
      forget();
      storage?.remove(SAVED_MATCH_KEY);
      const store = createGameStore({
        players: enginePlayers(setup),
        targetPoints: setup.targetPoints,
        rng: createRng(),
      });
      const next = { id: newMatchId(createRng(), now()), setup, store };
      attach(next);
      write(next);
      return next;
    },
    get: (id) => {
      if (session?.id === id) return session;
      const result = peek();
      if (result.kind !== 'ok' || result.saved.id !== id) return null;
      const { setup, flow } = result.saved;
      const store = createGameStore({
        players: enginePlayers(setup),
        rng: createRng(),
        flow,
      });
      const restored = { id, setup, store };
      attach(restored);
      return restored;
    },
    current: () => session,
    end: (id) => {
      if (session?.id === id) forget();
      if (savedId() === id) storage?.remove(SAVED_MATCH_KEY);
    },
    saveNow: () => {
      if (session) write(session);
    },
    peek,
  };
}

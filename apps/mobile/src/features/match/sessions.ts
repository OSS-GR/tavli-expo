/**
 * Local matches (vs bot and pass-and-play). MVP1 keeps one match at a time.
 *
 * A session is the match setup plus its game store. The route
 * `app/game/[id]` finds the session by its id (`local-…`).
 */
import type { Rng } from '@tavli/engine';

import { createGameStore, type GameStore } from '@/features/game/gameStore';

import { enginePlayers, type MatchSetup } from './setup';

export interface MatchSession {
  /** `local-<random>`. Online games (MVP2) use the server id. */
  readonly id: string;
  readonly setup: MatchSetup;
  readonly store: GameStore;
}

export interface SessionRegistry {
  /** Starts a new match. It replaces the match before it. */
  start: (setup: MatchSetup) => MatchSession;
  /** The match with this id, or `null`. */
  get: (id: string) => MatchSession | null;
  /** The match in progress, or `null`. */
  current: () => MatchSession | null;
  /** Forgets the match (it is over, or the user started another). */
  end: (id: string) => void;
}

export interface SessionDeps {
  /** Dice for a new match. */
  readonly createRng: () => Rng;
}

/** A new local match id. Not a secret; it only has to be unique on this phone. */
export function newMatchId(rng: Rng, now: number = Date.now()): string {
  return `local-${now.toString(36)}-${rng.nextUint32().toString(36)}`;
}

export function createSessionRegistry({ createRng }: SessionDeps): SessionRegistry {
  let session: MatchSession | null = null;
  return {
    start: (setup) => {
      const rng = createRng();
      const store = createGameStore({
        players: enginePlayers(setup),
        targetPoints: setup.targetPoints,
        rng,
      });
      session = { id: newMatchId(createRng()), setup, store };
      return session;
    },
    get: (id) => (session !== null && session.id === id ? session : null),
    current: () => session,
    end: (id) => {
      if (session?.id === id) session = null;
    },
  };
}

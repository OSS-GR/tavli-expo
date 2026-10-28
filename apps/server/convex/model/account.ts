/**
 * The pure parts of "delete my account" (#302): what happens to each of
 * the caller's games. No Convex types; `account.ts` holds the
 * mutation. See "Delete an account" in
 * `docs/architecture/online-game-service.md`.
 */

import type { PerPlayer } from '@tavli/engine';
import { sideOf } from '@tavli/online';

/** What account deletion does with one game of the caller. */
export type GameOnDelete =
  /** The match still runs: the caller resigns it, and the other player wins. */
  | 'resign'
  /**
   * The match is over: it stays for the other player as it is. The
   * caller's player id stays in it: it is a random id that names nobody
   * once the sign-in user is gone, and our tables hold no name or profile.
   */
  | 'keep'
  /** Not the caller's game: leave it alone. */
  | 'skip';

/** The game fields `gameOnDelete` reads. */
export interface GameToDelete {
  readonly status: 'active' | 'finished';
  readonly players: PerPlayer<string>;
}

/** What deleting the account of `callerId` does with `game`. */
export function gameOnDelete(game: GameToDelete, callerId: string): GameOnDelete {
  if (sideOf(game.players, callerId) === null) return 'skip';
  return game.status === 'active' ? 'resign' : 'keep';
}

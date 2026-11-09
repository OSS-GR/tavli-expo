/**
 * Moving a guest into an account (#403, ADR-0008). A guest saves with a
 * key that another account has already, and the player chooses to move
 * the guest's games there. The guest's player id then becomes the
 * account's id everywhere the server keeps it.
 *
 * A game keeps player ids in three places: the `players` of the game row,
 * `match.players` in the stored flow, and the `start` event of its log.
 * These helpers change the last two; the servers change the row.
 *
 * Pure: no Convex types.
 */
import type { PerPlayer } from '@tavli/engine';

import type { StoredFlow } from './online-game';

/** What happens to one of the guest's games when it moves. */
export type GuestGameMove =
  /** The game becomes the account's. */
  | 'rename'
  /**
   * A game in progress between the guest and the account itself: the
   * guest resigns it, then it stays as it is (`keep`).
   */
  | 'resign'
  /** A finished game between the two: it stays with the guest's id, like a deleted player's. */
  | 'keep';

/**
 * What happens to a game of `source` (the guest) when it moves into
 * `target`. A player cannot play themselves, so a game between the two
 * never becomes the account's.
 */
export function guestGameMove(
  players: PerPlayer<string>,
  active: boolean,
  source: string,
  target: string,
): GuestGameMove {
  const against = players.white === source ? players.black : players.white;
  if (against !== target) return 'rename';
  return active ? 'resign' : 'keep';
}

/** `players` with `from` changed to `to`. */
export function renamePlayers(
  players: PerPlayer<string>,
  from: string,
  to: string,
): PerPlayer<string> {
  return {
    white: players.white === from ? to : players.white,
    black: players.black === from ? to : players.black,
  };
}

/** A stored flow (`storeFlow`) with player `from` changed to `to` in `match.players`. */
export function renamePlayerInFlow(text: string, from: string, to: string): string {
  const stored = JSON.parse(text) as StoredFlow;
  return JSON.stringify({
    ...stored,
    match: { ...stored.match, players: renamePlayers(stored.match.players, from, to) },
  });
}

/**
 * A log event (JSON text) with player `from` changed to `to`. Only the
 * `start` event names the players; any other event comes back as it was.
 */
export function renamePlayerInEvent(text: string, from: string, to: string): string {
  const event = JSON.parse(text) as { type?: unknown; players?: PerPlayer<string> };
  if (event.type !== 'start' || event.players === undefined) return text;
  return JSON.stringify({ ...event, players: renamePlayers(event.players, from, to) });
}

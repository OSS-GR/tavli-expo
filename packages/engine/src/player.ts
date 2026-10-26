/**
 * Players.
 *
 * We use the strings 'white' and 'black', not 0 and 1. The JSON stays easy to
 * read in logs, in the database and in bug reports. There is no risk of a
 * falsy `0`. Per-player data uses `PerPlayer<T>`, so lookups stay simple:
 * `board.off[player]`.
 *
 * White is "player A" in the rules docs. The absolute board view is White's
 * own numbering.
 */

export const PLAYERS = ['white', 'black'] as const;

export type PlayerId = (typeof PLAYERS)[number];

/** One value for each player. */
export type PerPlayer<T> = { readonly [P in PlayerId]: T };

export function opponent(player: PlayerId): PlayerId {
  return player === 'white' ? 'black' : 'white';
}

export function isPlayerId(value: unknown): value is PlayerId {
  return value === 'white' || value === 'black';
}

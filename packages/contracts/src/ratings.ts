/**
 * Ratings and leaderboards (#407, ADR-0008 item 9): saved players get a
 * rating from their online matches, and see a friends board and a global
 * board. Our own boards only, the same on iOS and Android.
 *
 * - **The rating** is the FIBS formula (the backgammon match rating, an
 *   Elo for matches): a longer match moves it more, an upset moves it more,
 *   and a new player's rating moves faster for their first matches. Every
 *   player starts at `START_RATING`. The math is `@tavli/online`
 *   (`ratings.ts`); both servers run it.
 * - **Which matches count:** a finished online match between two saved
 *   accounts, also one that ends by a resign or a time out. A guest's
 *   match, a game against the bot, and a match that ends because a player
 *   deleted their account never count. So does a pair's match past
 *   `RATED_MATCHES_PER_PAIR_PER_DAY` in one day (UTC): two accounts of
 *   one person cannot farm points. Custom house-rule variants (#58) will
 *   never count either.
 * - **The friends board:** you and your friends who have a rated match.
 * - **The global board:** the top `GLOBAL_BOARD_ROWS` by rating, username
 *   and rating only. A player shows there with a username, at least
 *   `MIN_BOARD_MATCHES` rated matches, and "Show me on the global board"
 *   on (`setShown`, on by default). Blocked players never see each other
 *   there.
 *
 * Like the other ports, no call takes the caller's id: the server reads
 * the caller from the sign-in. The Convex adapter is `createConvexRatings`
 * (`@tavli/backend-convex`); the in-memory server (`@tavli/online`) has
 * `ratingsFor(playerId)`. The contract checks are `ratingsContract` in
 * `@tavli/contracts/testing`.
 */
import type { PlayerName } from './player-name';

/** Every player's first rating. */
export const START_RATING = 1500;

/** Rated matches a player needs before the global board shows them. */
export const MIN_BOARD_MATCHES = 5;

/** The most matches of one pair of players that count in one UTC day. */
export const RATED_MATCHES_PER_PAIR_PER_DAY = 3;

/** The rows of the global board. */
export const GLOBAL_BOARD_ROWS = 50;

/** The caller's own rating. */
export interface MyRating {
  /** The rating, rounded to a whole number. */
  readonly rating: number;
  /** Rated matches so far. */
  readonly matches: number;
  /** "Show me on the global board" (on by default). */
  readonly shown: boolean;
  /**
   * The global board can show the caller now: `shown`, a username and at
   * least `MIN_BOARD_MATCHES` rated matches. The board may still not list
   * them (only the top rows show).
   */
  readonly listed: boolean;
}

/** One row of a board. */
export interface BoardRow {
  readonly playerId: string;
  /**
   * The player's name. On the global board always a username. On the
   * friends board a friend with no username shows their guest name.
   */
  readonly name: PlayerName | null;
  /** The rating, rounded to a whole number. */
  readonly rating: number;
  /** Rated matches. */
  readonly matches: number;
  /** The place on this board, from 1. Two equal ratings share a place. */
  readonly rank: number;
  /** This row is the caller. */
  readonly me: boolean;
}

export const RATINGS_ERROR_CODES = [
  /** No valid sign-in, or the caller's account is gone. */
  'NOT_SIGNED_IN',
  /** The caller is a guest: ratings need a saved account (ADR-0008). */
  'NOT_SAVED',
] as const;

export type RatingsErrorCode = (typeof RATINGS_ERROR_CODES)[number];

/** The data of a rejected call. */
export interface RatingsErrorData {
  readonly code: RatingsErrorCode;
  readonly message: string;
}

export function isRatingsErrorData(value: unknown): value is RatingsErrorData {
  if (typeof value !== 'object' || value === null) return false;
  const { code, message } = value as { code?: unknown; message?: unknown };
  return (
    typeof message === 'string' &&
    typeof code === 'string' &&
    (RATINGS_ERROR_CODES as readonly string[]).includes(code)
  );
}

/**
 * The ratings port. Every call rejects with `RatingsErrorData`:
 * `NOT_SIGNED_IN` with nobody signed in, `NOT_SAVED` for a guest.
 */
export interface Ratings {
  /** The caller's rating, also before the first rated match. */
  mine(): Promise<MyRating>;
  /** The caller and their friends with a rated match, best first. The caller is always there. */
  friendsBoard(): Promise<readonly BoardRow[]>;
  /** The top `GLOBAL_BOARD_ROWS` listed players, best first. */
  globalBoard(): Promise<readonly BoardRow[]>;
  /** Turns "Show me on the global board" on or off. */
  setShown(shown: boolean): Promise<void>;
}

/**
 * Gives each row its place: best rating first, equal (rounded) ratings
 * share a place ("1, 2, 2, 4"). `rows` must be sorted best first.
 */
export function withRanks<Row extends { readonly rating: number }>(
  rows: readonly Row[],
): (Row & { readonly rank: number })[] {
  let rank = 0;
  return rows.map((row, index) => {
    if (index === 0 || row.rating !== rows[index - 1]!.rating) rank = index + 1;
    return { ...row, rank };
  });
}

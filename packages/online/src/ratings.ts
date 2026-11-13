/**
 * Ratings (#407): the pure parts both servers run. No Convex types: the
 * time is an argument.
 *
 * **The FIBS formula** (the rating of the First Internet Backgammon
 * Server, an Elo for matches of `n` points). With `d` the rating gap:
 *
 * - The underdog wins with the chance `p = 1 / (10^(d·√n / 2000) + 1)`.
 * - The winner gains `4·√n·(1 − chance of their win)` and the loser
 *   loses the same: a favourite who wins gains `4·√n·p`, an underdog who
 *   wins gains `4·√n·(1 − p)`. Two equal players move `2·√n`.
 * - Experience is the points of the rated matches so far. Below 400, a
 *   player's change is multiplied by `max(1, 5 − experience / 100)`, so a
 *   new rating finds its level fast. Each player has their own factor.
 *
 * A rating is kept as a plain number and shown rounded.
 */
import {
  GLOBAL_BOARD_ROWS,
  MIN_BOARD_MATCHES,
  RATED_MATCHES_PER_PAIR_PER_DAY,
  START_RATING,
  withRanks,
} from '@tavli/contracts';
import type { BoardRow, PlayerName, RatingsErrorCode } from '@tavli/contracts';

/** A rejected ratings call; the servers turn it into `RatingsErrorData`. */
export class RatingsError extends Error {
  constructor(
    readonly code: RatingsErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'RatingsError';
  }
}

/** Ratings need a saved account (ADR-0008). */
export function checkRatingsSaved(saved: boolean): void {
  if (!saved) throw new RatingsError('NOT_SAVED', 'save your account to get a rating');
}

/** A player's rating row as the servers keep it. */
export interface RatingRecord {
  readonly rating: number;
  /** The points of the rated matches so far (the sum of their lengths). */
  readonly experience: number;
  /** Rated matches so far. */
  readonly matches: number;
}

/** The record of a player with no rated match. */
export const NEW_RATING: RatingRecord = { rating: START_RATING, experience: 0, matches: 0 };

/** Experience at which the fast start ends. */
const FAST_START_POINTS = 400;

/** The chance that the player rated `rating` beats one rated `other` in a match of `length` points. */
export function winChance(rating: number, other: number, length: number): number {
  return 1 / (10 ** (((other - rating) * Math.sqrt(length)) / 2000) + 1);
}

/** The factor of a new player's change (FIBS's "ratings boost"). */
export function experienceFactor(experience: number): number {
  return experience >= FAST_START_POINTS ? 1 : Math.max(1, 5 - experience / 100);
}

/**
 * The two records after `winner` beats `loser` in a match of `length`
 * points (`length` ≥ 1).
 */
export function afterRatedMatch(
  winner: RatingRecord,
  loser: RatingRecord,
  length: number,
): { readonly winner: RatingRecord; readonly loser: RatingRecord } {
  const points = Math.max(1, length);
  const base = 4 * Math.sqrt(points) * (1 - winChance(winner.rating, loser.rating, points));
  return {
    winner: {
      rating: winner.rating + base * experienceFactor(winner.experience),
      experience: winner.experience + points,
      matches: winner.matches + 1,
    },
    loser: {
      rating: loser.rating - base * experienceFactor(loser.experience),
      experience: loser.experience + points,
      matches: loser.matches + 1,
    },
  };
}

/** What a rated match is worth to one player: points won on a win, lost on a loss. */
export interface MatchStakes {
  readonly win: number;
  readonly lose: number;
}

/**
 * What a rated match of `length` points against a player rated `other` is
 * worth to `me` (Play ranked, #532: "Win +13 · lose −11"). The same math
 * as `afterRatedMatch` with my own factor, rounded to whole points. The
 * phone knows only the shown ratings, so it is a close guess.
 */
export function matchStakes(
  me: Pick<RatingRecord, 'rating' | 'experience'>,
  other: number,
  length: number,
): MatchStakes {
  const points = Math.max(1, length);
  const factor = experienceFactor(me.experience);
  const step = (winner: number, loser: number) =>
    4 * Math.sqrt(points) * (1 - winChance(winner, loser, points)) * factor;
  return {
    win: Math.round(step(me.rating, other)),
    lose: Math.round(step(other, me.rating)),
  };
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** The UTC day of `ms`: whole days since 1970-01-01. */
export function utcDay(ms: number): number {
  return Math.floor(ms / DAY_MS);
}

/** The pair's ids in a fixed order, so both servers keep one row per pair. */
export function pairOf(a: string, b: string): readonly [string, string] {
  return a < b ? [a, b] : [b, a];
}

/** A pair's rated matches on one UTC day. */
export interface PairCount {
  readonly day: number;
  readonly count: number;
}

/**
 * Whether a finished match counts. `saved`: both players have a saved
 * account now. `pair`: the pair's count as saved (any day), or `null`.
 * Returns the pair's new count when it counts.
 */
export function planRatedMatch(input: {
  readonly saved: boolean;
  readonly pair: PairCount | null;
  readonly now: number;
}): { readonly rated: false } | { readonly rated: true; readonly pair: PairCount } {
  if (!input.saved) return { rated: false };
  const day = utcDay(input.now);
  const today = input.pair !== null && input.pair.day === day ? input.pair.count : 0;
  if (today >= RATED_MATCHES_PER_PAIR_PER_DAY) return { rated: false };
  return { rated: true, pair: { day, count: today + 1 } };
}

/**
 * The global board may list the player: "Show me" on and enough rated
 * matches. The servers keep this in the row (an index), and check the
 * username when they read the board: a row with no username is skipped.
 */
export function isBoardable(row: { readonly shown: boolean; readonly matches: number }): boolean {
  return row.shown && row.matches >= MIN_BOARD_MATCHES;
}

/** A rating as players see it: a whole number. */
export function shownRating(rating: number): number {
  return Math.round(rating);
}

/** A player on a board, before the places: the rating as kept. */
export interface BoardPlayer {
  readonly playerId: string;
  readonly name: PlayerName | null;
  readonly rating: number;
  readonly matches: number;
}

function rowsOf(players: readonly BoardPlayer[], callerId: string) {
  return withRanks(
    players.map((player) => ({
      playerId: player.playerId,
      name: player.name,
      rating: shownRating(player.rating),
      matches: player.matches,
      me: player.playerId === callerId,
    })),
  );
}

/**
 * The friends board: the caller and their friends, best first (equal
 * ratings in the order given). The servers pass the caller always, and
 * each friend with a rated match.
 */
export function friendsBoardRows(players: readonly BoardPlayer[], callerId: string): BoardRow[] {
  const sorted = [...players].sort((a, b) => b.rating - a.rating);
  return rowsOf(sorted, callerId);
}

/**
 * The global board. `top` holds the listed players best first: "Show me"
 * on, `MIN_BOARD_MATCHES` rated matches and a username. The places count
 * every one of them; then the rows the caller must not see (`hidden`:
 * players the caller blocked) go, and the first `GLOBAL_BOARD_ROWS` stay.
 */
export function globalBoardRows(
  top: readonly BoardPlayer[],
  callerId: string,
  hidden: (playerId: string) => boolean,
): BoardRow[] {
  return rowsOf(top, callerId)
    .filter((row) => !hidden(row.playerId))
    .slice(0, GLOBAL_BOARD_ROWS);
}

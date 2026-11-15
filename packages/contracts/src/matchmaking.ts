/**
 * Play ranked matching (#531, ADR-0009): two saved players who do not
 * know each other ask for a game, and the server pairs them.
 *
 * - **Who:** saved accounts only (a guest gets `NOT_SAVED`), like friends
 *   and ratings (ADR-0008). One open seek per player.
 * - **What:** the player picks one of `RANKED_GAMES`. A ranked match is a
 *   match to `RANKED_TARGET_POINTS`, with the fixed turn time
 *   `RANKED_TURN_TIME_MINUTES` (ADR-0009). The game plays the default
 *   preset of its game, like any online game.
 * - **The pair:** the same game, and a rating gap inside both players'
 *   ranges. A range starts at ±`SEEK_RANGE_START` around the rating the
 *   player had when they asked (`START_RATING` with no rated match), and
 *   grows to ±`SEEK_RANGE_MAX` over `SEEK_RANGE_GROW_MS` (`seekRange`).
 *   Never two players where one blocks the other, and never a pair that
 *   played `RATED_MATCHES_PER_PAIR_PER_DAY` rated matches that UTC day.
 *   The closest ratings pair first, then the oldest seek. Never a fake
 *   player: the opponent is always a real person.
 * - **The end:** a seek ends after `SEEK_TTL_MS` with no match; the app
 *   says "Nobody yet" after `NOBODY_YET_MS` and lets the player keep
 *   looking. A matched seek shows its game for `MATCHED_SEEK_KEEP_MS`.
 *
 * Like the other ports, no call takes the caller's id: the server reads
 * the caller from the sign-in. The Convex adapter is
 * `createConvexMatchmaking` (`@tavli/backend-convex`); the in-memory
 * server (`@tavli/online`) has `matchmakingFor(playerId)`. The pure rules
 * are `@tavli/online` (`matchmaking.ts`); both servers run them. The
 * contract checks are `matchmakingContract` in `@tavli/contracts/testing`.
 */
import type { OnlineGameChoice } from './game-transport';
import type { PlayerName } from './player-name';

/** The games a player may pick for Play ranked (owner, 2026-11-13): no Asodio. */
export const RANKED_GAMES = [
  'portes',
  'plakoto',
  'fevga',
  'tavli',
] as const satisfies readonly OnlineGameChoice[];

export type RankedGame = (typeof RANKED_GAMES)[number];

export function isRankedGame(value: unknown): value is RankedGame {
  return typeof value === 'string' && (RANKED_GAMES as readonly string[]).includes(value);
}

/** A ranked match is played to this many points. */
export const RANKED_TARGET_POINTS = 3;

/** The rating range at the start of a seek: ± this many points. */
export const SEEK_RANGE_START = 50;

/** The widest rating range: ± this many points. */
export const SEEK_RANGE_MAX = 400;

/** The range grows from `SEEK_RANGE_START` to `SEEK_RANGE_MAX` over this time. */
export const SEEK_RANGE_GROW_MS = 60 * 1000;

/** The app says "Nobody yet" after this wait (the range is at its widest then). */
export const NOBODY_YET_MS = SEEK_RANGE_GROW_MS;

/** A seek with no match ends after this time. */
export const SEEK_TTL_MS = 5 * 60 * 1000;

/** A matched seek shows its game for this long, then it goes. */
export const MATCHED_SEEK_KEEP_MS = 10 * 60 * 1000;

/**
 * The rating range (± points, a whole number) of a seek made at `since`,
 * at `now`: `SEEK_RANGE_START`, growing in a straight line to
 * `SEEK_RANGE_MAX` at `since + SEEK_RANGE_GROW_MS`. Both times come from
 * one clock: a phone that shows the range counts from when it saw the
 * seek start, not from the server's `since`.
 */
export function seekRange(since: number, now: number): number {
  const part = Math.min(1, Math.max(0, (now - since) / SEEK_RANGE_GROW_MS));
  return Math.round(SEEK_RANGE_START + (SEEK_RANGE_MAX - SEEK_RANGE_START) * part);
}

/** A player of a matched seek: the name and the rating (rounded), as they are now. */
export interface SeekPlayer {
  /** `null` with no name row (a deleted account). */
  readonly name: PlayerName | null;
  readonly rating: number;
}

/** The caller's seek, as `mySeek` and `watchMySeek` give it. */
export type MySeek =
  /** No seek: never asked, cancelled, or the seek ended with no match. */
  | { readonly kind: 'none' }
  /** Waiting for a player. */
  | {
      readonly kind: 'waiting';
      readonly game: RankedGame;
      /** When the seek started, epoch ms (server clock). */
      readonly since: number;
      /** The caller's rating when the seek started, rounded: the middle of the range. */
      readonly rating: number;
    }
  /** Matched: the game is on (`gameId`). */
  | {
      readonly kind: 'matched';
      readonly game: RankedGame;
      readonly gameId: string;
      readonly me: SeekPlayer;
      readonly opponent: SeekPlayer;
    };

/** How many other players wait for each game now. */
export type LookingCounts = { readonly [Game in RankedGame]: number };

export const MATCHMAKING_ERROR_CODES = [
  /** No valid sign-in, or the caller's account is gone. */
  'NOT_SIGNED_IN',
  /** The caller is a guest: Play ranked needs a saved account. */
  'NOT_SAVED',
  /** Not a ranked game. */
  'BAD_REQUEST',
] as const;

export type MatchmakingErrorCode = (typeof MATCHMAKING_ERROR_CODES)[number];

/** The data of a rejected call. */
export interface MatchmakingErrorData {
  readonly code: MatchmakingErrorCode;
  readonly message: string;
}

export function isMatchmakingErrorData(value: unknown): value is MatchmakingErrorData {
  if (typeof value !== 'object' || value === null) return false;
  const { code, message } = value as { code?: unknown; message?: unknown };
  return (
    typeof message === 'string' &&
    typeof code === 'string' &&
    (MATCHMAKING_ERROR_CODES as readonly string[]).includes(code)
  );
}

/** What `seek` takes. */
export interface SeekRequest {
  readonly game: RankedGame;
}

/**
 * The matchmaking port. Every call rejects with `MatchmakingErrorData`:
 * `NOT_SIGNED_IN` with nobody signed in, `NOT_SAVED` for a guest.
 */
export interface Matchmaking {
  /**
   * Asks for a ranked match of `game`. A waiting seek of the same game
   * stays as it is (its `since` too); a seek of another game, or a
   * matched one, is replaced. The server may match at once: read the seek
   * after. `BAD_REQUEST` for a game not in `RANKED_GAMES`.
   */
  seek(request: SeekRequest): Promise<void>;
  /**
   * Ends the caller's waiting seek. A matched seek stays (the game is on),
   * so a cancel that lands just after a match still shows the match
   * (#532). No seek: nothing happens.
   */
  cancel(): Promise<void>;
  /** The caller's seek now. */
  mySeek(): Promise<MySeek>;
  /**
   * The live form of `mySeek`: `onUpdate` gets the seek now and after
   * every change (a match, a cancel, the end), until the returned
   * function is called. It never calls back inside `watchMySeek` or after
   * the stop function. A failure goes to `onError`:
   * `MatchmakingErrorData` from the server, or a network error as it is.
   */
  watchMySeek(onUpdate: (seek: MySeek) => void, onError?: (error: unknown) => void): () => void;
  /** How many other players wait for each ranked game now ("Try another game"). */
  lookingCounts(): Promise<LookingCounts>;
}

/**
 * Play ranked matching (#531, ADR-0009): the pure rules both servers run.
 * The Convex functions (`apps/server/convex/matchmaking.ts`) and the
 * in-memory server add only their storage: the seeks, the blocks, the
 * pair counts, the ratings and the names. Never copy a rule into
 * `convex/`.
 *
 * The order of the checks of a seek: the caller is signed in and exists
 * (`NOT_SIGNED_IN`), has a saved account (`NOT_SAVED`), then the game is
 * a ranked game (`BAD_REQUEST`). Then `planSeek` says what happens to the
 * caller's seek, and the server runs the matching of that game at once.
 *
 * The matching (`pickPairs`): every pair of live seeks of one game whose
 * rating gap is inside both ranges (`inRange`), the closest ratings
 * first, then the pair with the oldest seek. A pair is taken when neither
 * player is in a pair already and the servers allow it (`mayPair`: no
 * block either way, and under the pair's rated matches that UTC day).
 * The older seek plays White (`matchedPlayers`); the opening roll decides
 * who moves first.
 *
 * Everything here is pure: `now` is an argument.
 */

import {
  MATCHED_SEEK_KEEP_MS,
  RANKED_GAMES,
  SEEK_TTL_MS,
  isRankedGame,
  seekRange,
} from '@tavli/contracts';
import type {
  LookingCounts,
  MatchmakingErrorCode,
  MySeek,
  RankedGame,
  SeekPlayer,
} from '@tavli/contracts';
import type { PerPlayer } from '@tavli/engine';

import { planRatedMatch } from './ratings';
import type { PairCount } from './ratings';

/** A rejected matchmaking call; the servers turn it into `MatchmakingErrorData`. */
export class MatchmakingError extends Error {
  constructor(
    readonly code: MatchmakingErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'MatchmakingError';
  }
}

/** Play ranked needs a saved account (ADR-0008, ADR-0009). */
export function checkSeekSaved(saved: boolean): void {
  if (!saved) throw new MatchmakingError('NOT_SAVED', 'save your account to play ranked');
}

/** The game of a seek: one of `RANKED_GAMES`. */
export function checkRankedChoice(game: unknown): RankedGame {
  if (!isRankedGame(game)) throw new MatchmakingError('BAD_REQUEST', 'not a ranked game');
  return game;
}

/** A waiting seek as the servers keep it. */
export interface SeekRecord {
  readonly playerId: string;
  readonly game: RankedGame;
  /** The player's rating when they asked, as kept (not rounded). */
  readonly rating: number;
  /** When they asked, epoch ms (server clock). */
  readonly createdAt: number;
}

/** A waiting seek ended with no match at `createdAt + SEEK_TTL_MS`. */
export function isSeekExpired(seek: { readonly createdAt: number }, now: number): boolean {
  return now >= seek.createdAt + SEEK_TTL_MS;
}

/** The first `createdAt` of a live seek at `now`: older seeks have ended. */
export function liveSince(now: number): number {
  return now - SEEK_TTL_MS;
}

/** A matched seek goes `MATCHED_SEEK_KEEP_MS` after the match. */
export function isMatchedSeekDone(matchedAt: number, now: number): boolean {
  return now >= matchedAt + MATCHED_SEEK_KEEP_MS;
}

/** The caller's seek as the servers keep it, or `null`. */
export interface SeekState {
  readonly game: RankedGame;
  readonly status: 'waiting' | 'matched';
  readonly createdAt: number;
}

/**
 * What a new seek of `game` does to the caller's seek: `keep` a live
 * waiting seek of the same game (its time too), else `replace` the one
 * there (another game, a matched one, or one that ended), or `insert`.
 */
export function planSeek(
  existing: SeekState | null,
  game: RankedGame,
  now: number,
): 'keep' | 'replace' | 'insert' {
  if (existing === null) return 'insert';
  if (existing.status === 'waiting' && existing.game === game && !isSeekExpired(existing, now)) {
    return 'keep';
  }
  return 'replace';
}

/**
 * The two seeks may pair on rating and game at `now`: the same game, two
 * players, both live, and the rating gap inside both ranges.
 */
export function inRange(a: SeekRecord, b: SeekRecord, now: number): boolean {
  if (a.game !== b.game || a.playerId === b.playerId) return false;
  if (isSeekExpired(a, now) || isSeekExpired(b, now)) return false;
  const gap = Math.abs(a.rating - b.rating);
  return gap <= seekRange(a.createdAt, now) && gap <= seekRange(b.createdAt, now);
}

/**
 * The servers allow the pair: no block either way (`blocked`), and the
 * pair played fewer than `RATED_MATCHES_PER_PAIR_PER_DAY` rated matches
 * on the UTC day of `now` (`pair`: their count as saved, or `null`). The
 * same count as `planRatedMatch`, so every ranked match is rated.
 */
export function mayPair(input: {
  readonly blocked: boolean;
  readonly pair: PairCount | null;
  readonly now: number;
}): boolean {
  if (input.blocked) return false;
  return planRatedMatch({ saved: true, pair: input.pair, now: input.now }).rated;
}

/** The pairs that may match on rating and game, best first. */
export function candidatePairs<Seek extends SeekRecord>(
  seeks: readonly Seek[],
  now: number,
): (readonly [Seek, Seek])[] {
  const pairs: (readonly [Seek, Seek])[] = [];
  for (let i = 0; i < seeks.length; i += 1) {
    for (let j = i + 1; j < seeks.length; j += 1) {
      const a = seeks[i]!;
      const b = seeks[j]!;
      if (!inRange(a, b, now)) continue;
      // The older seek first in each pair.
      pairs.push(a.createdAt <= b.createdAt ? [a, b] : [b, a]);
    }
  }
  return pairs.sort(
    ([a1, b1], [a2, b2]) =>
      Math.abs(a1.rating - b1.rating) - Math.abs(a2.rating - b2.rating) ||
      a1.createdAt - a2.createdAt ||
      b1.createdAt - b2.createdAt,
  );
}

/**
 * The pairs to match now, best first (`candidatePairs`): each player in
 * one pair at most, and only pairs `allowed` says yes to (the servers
 * pass `mayPair` on their own blocks and pair counts). `allowed` runs
 * only for pairs that could still be taken, in order.
 */
export async function pickPairs<Seek extends SeekRecord>(
  seeks: readonly Seek[],
  now: number,
  allowed: (a: Seek, b: Seek) => boolean | Promise<boolean>,
): Promise<(readonly [Seek, Seek])[]> {
  const taken = new Set<string>();
  const picked: (readonly [Seek, Seek])[] = [];
  for (const [a, b] of candidatePairs(seeks, now)) {
    if (taken.has(a.playerId) || taken.has(b.playerId)) continue;
    if (!(await allowed(a, b))) continue;
    taken.add(a.playerId);
    taken.add(b.playerId);
    picked.push([a, b]);
  }
  return picked;
}

/** The sides of a matched pair: the older seek (`older`, first in a pair) plays White. */
export function matchedPlayers(older: SeekRecord, newer: SeekRecord): PerPlayer<string> {
  return { white: older.playerId, black: newer.playerId };
}

/** The caller's seek as `mySeek` gives it. */
export function waitingSeek(seek: SeekRecord, shown: (rating: number) => number): MySeek {
  return { kind: 'waiting', game: seek.game, since: seek.createdAt, rating: shown(seek.rating) };
}

/** A matched seek as `mySeek` gives it. */
export function matchedSeek(
  game: RankedGame,
  gameId: string,
  me: SeekPlayer,
  opponent: SeekPlayer,
): MySeek {
  return { kind: 'matched', game, gameId, me, opponent };
}

/**
 * How many players other than `callerId` wait for each game at `now`.
 * `seeks`: the waiting seeks the server read.
 */
export function countLooking(
  seeks: readonly SeekRecord[],
  callerId: string,
  now: number,
): LookingCounts {
  const counts = Object.fromEntries(RANKED_GAMES.map((game) => [game, 0])) as Record<
    RankedGame,
    number
  >;
  for (const seek of seeks) {
    if (seek.playerId !== callerId && !isSeekExpired(seek, now)) counts[seek.game] += 1;
  }
  return counts;
}

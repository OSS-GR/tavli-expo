/**
 * The fast, private position used by the Portes move generator.
 *
 * The search needs to copy and compare many positions, so it does not work
 * on `BoardState`. It uses one small array of numbers, always seen from the
 * player to move (own numbering, see `numbering.ts`):
 *
 * | Index         | Meaning                                                   |
 * | ------------- | --------------------------------------------------------- |
 * | 0             | mover's checkers borne off                                |
 * | 1–24          | mover's checkers on own point `p`                         |
 * | 25            | mover's checkers on the bar                               |
 * | 25 + p        | opponent checkers on the mover's own point `p` (26–49)    |
 * | 50            | opponent checkers on the bar                              |
 * | 50 + p        | `noHitAndRunInHome`: mover checkers on own point `p`      |
 * |               | (1–6) that hit this turn and may not move again (51–56)   |
 *
 * Two more slots hold a hash of the counts, kept up to date by `put`.
 *
 * Nothing here leaves the variant. `toBoard` turns it back into a
 * `BoardState`.
 */

import type { BoardState, PointState } from '../../board';
import { EngineError } from '../../errors';
import type { PlayerId } from '../../player';
import { opponent } from '../../player';
import { createSeededRng } from '../../rng';

export const OFF = 0;
export const BAR = 25;
export const OPP = 25;
export const OPP_BAR = 50;
export const FROZEN = 50;
/** The number of counts in a position. */
export const POSITION_SIZE = 57;
/** Two more slots hold the position's Zobrist hash (see `PositionMap`). */
const HASH1 = POSITION_SIZE;
const HASH2 = POSITION_SIZE + 1;

/**
 * Counts, then two hash slots. Change counts only with `put`, so the hash
 * stays right. A plain array of small integers: V8 copies it much faster
 * than a typed array, so every value (also the hash) stays below 2^30.
 */
export type Position = number[];

/** Own point `p` (1–24) of `player` → index into `board.points`. Contrary movement. */
function boardIndex(p: number, player: PlayerId): number {
  return player === 'white' ? p - 1 : 24 - p;
}

/**
 * Reads a board from the view of `player`. Throws `INVALID_STATE` for things
 * Portes never has: pinned checkers, shared points, checkers outside.
 */
export function fromBoard(board: BoardState, player: PlayerId): Position {
  const other = opponent(player);
  if (board.outside.white !== 0 || board.outside.black !== 0) {
    throw new EngineError('INVALID_STATE', 'Portes has no checkers outside', 'state.board.outside');
  }
  const pos: Position = new Array<number>(POSITION_SIZE + 2).fill(0);
  for (let p = 1; p <= 24; p += 1) {
    const index = boardIndex(p, player);
    const point = board.points[index] as PointState;
    if (point.pinned !== null || (point.white > 0 && point.black > 0)) {
      throw new EngineError(
        'INVALID_STATE',
        'Portes never has two colors on one point',
        `state.board.points[${index}]`,
      );
    }
    pos[p] = point[player];
    pos[OPP + p] = point[other];
  }
  pos[OFF] = board.off[player];
  pos[BAR] = board.bar[player];
  pos[OPP_BAR] = board.bar[other];
  rehash(pos);
  return pos;
}

/** Writes a position back as a `BoardState`. `opponentOff` does not change during a turn. */
export function toBoard(pos: Position, player: PlayerId, opponentOff: number): BoardState {
  const other = opponent(player);
  const points: PointState[] = new Array<PointState>(24);
  for (let p = 1; p <= 24; p += 1) {
    const mine = pos[p] as number;
    const theirs = pos[OPP + p] as number;
    points[boardIndex(p, player)] =
      player === 'white'
        ? { white: mine, black: theirs, pinned: null }
        : { white: theirs, black: mine, pinned: null };
  }
  return {
    points,
    bar: { [player]: pos[BAR] as number, [other]: pos[OPP_BAR] as number } as BoardState['bar'],
    outside: { white: 0, black: 0 },
    off: { [player]: pos[OFF] as number, [other]: opponentOff } as BoardState['off'],
  };
}

// ---------------------------------------------------------------------------
// PositionMap: a fast, exact map keyed by position.

/** Counts are 0–15, so each index has 16 possible values. */
const VALUES = 16;
/** Room for the extra `tag` number the search adds to a key. */
const TAGS = 1024;

// Zobrist tables: one random 30-bit pair per (index, value) and per tag.
// Fixed seed, so the engine stays deterministic.
const zobrist = createSeededRng(0x7a571a);
const random30 = (): number => zobrist.nextUint32() & 0x3fff_ffff;
const Z1 = Array.from({ length: POSITION_SIZE * VALUES }, random30);
const Z2 = Array.from({ length: POSITION_SIZE * VALUES }, random30);
const T1 = Array.from({ length: TAGS }, random30);
const T2 = Array.from({ length: TAGS }, random30);

/** Computes both hash slots from scratch. */
function rehash(pos: Position): void {
  let h1 = 0;
  let h2 = 0;
  for (let i = 0; i < POSITION_SIZE; i += 1) {
    const z = i * VALUES + (pos[i] as number);
    h1 ^= Z1[z] as number;
    h2 ^= Z2[z] as number;
  }
  pos[HASH1] = h1;
  pos[HASH2] = h2;
}

/** Sets count `index` to `value` (0–15) and updates the hash. */
export function put(pos: Position, index: number, value: number): void {
  const old = index * VALUES + (pos[index] as number);
  const now = index * VALUES + value;
  pos[HASH1] = (pos[HASH1] as number) ^ (Z1[old] as number) ^ (Z1[now] as number);
  pos[HASH2] = (pos[HASH2] as number) ^ (Z2[old] as number) ^ (Z2[now] as number);
  pos[index] = value;
}

/** A 53-bit key (30 + 23 bits) for a position and a tag (0 to 1023). */
function key(pos: Position, tag: number): number {
  const h1 = (pos[HASH1] as number) ^ (T1[tag] as number);
  const h2 = (pos[HASH2] as number) ^ (T2[tag] as number);
  return h1 * 0x80_0000 + (h2 >>> 7);
}

function samePosition(a: Position, b: Position): boolean {
  for (let i = 0; i < POSITION_SIZE; i += 1) if (a[i] !== b[i]) return false;
  return true;
}

interface Entry<T> {
  readonly pos: Position;
  readonly tag: number;
  value: T;
}

/**
 * A map from (position, tag) to a value. The search uses it to find
 * positions it has seen. Keys are the Zobrist hashes kept in the
 * position, which are much faster than strings. Two keys with the same hash are told apart by comparing
 * the positions, so the map is exact.
 */
export class PositionMap<T> {
  private readonly buckets = new Map<number, Entry<T>[]>();

  get(pos: Position, tag = 0): T | undefined {
    const bucket = this.buckets.get(key(pos, tag));
    if (bucket === undefined) return undefined;
    for (const entry of bucket) {
      if (entry.tag === tag && samePosition(entry.pos, pos)) return entry.value;
    }
    return undefined;
  }

  set(pos: Position, value: T, tag = 0): void {
    const k = key(pos, tag);
    const bucket = this.buckets.get(k);
    if (bucket === undefined) {
      this.buckets.set(k, [{ pos, tag, value }]);
      return;
    }
    for (const entry of bucket) {
      if (entry.tag === tag && samePosition(entry.pos, pos)) {
        entry.value = value;
        return;
      }
    }
    bucket.push({ pos, tag, value });
  }
}

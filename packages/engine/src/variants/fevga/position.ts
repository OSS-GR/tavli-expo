/**
 * The small, private position the Fevga move search works on.
 *
 * The search copies and compares many positions, so it does not work on
 * `BoardState`. A position is a plain array of numbers, always seen from
 * the player to move (own numbering, see `numbering.ts`):
 *
 * | Index | Meaning                                       |
 * | ----- | --------------------------------------------- |
 * | 0     | mover's checkers borne off                    |
 * | 1–24  | mover's checkers on own point `p`             |
 * | 25–26 | a hash of the counts, kept up to date by `put` |
 *
 * The opponent's checkers do not change during the mover's turn (there is
 * no hitting in Fevga), so they live apart, in an `Opponent`.
 *
 * Nothing here leaves the variant. `toBoard` turns it back into a
 * `BoardState`.
 */

import type { BoardState, PointState } from '../../board';
import { EngineError } from '../../errors';
import { opponent } from '../../player';
import type { PlayerId } from '../../player';
import { createSeededRng } from '../../rng';

/** The number of counts in a position: off + 24 points. */
export const COUNTS = 25;
const HASH1 = COUNTS;
const HASH2 = COUNTS + 1;

/**
 * Mover's checkers (index 0 = borne off, 1–24 = own points), then two hash
 * slots. Change counts only with `put`, so the hash stays right.
 */
export type Position = number[];

/** The opponent, seen from the mover. Fixed for the whole turn. */
export interface Opponent {
  /** Opponent checkers on the mover's own point `p` (index 1–24; index 0 is unused). */
  readonly on: readonly number[];
  /** The same checkers in the opponent's own numbering. Index 0 = borne off. */
  readonly own: readonly number[];
}

/**
 * The same physical point in the other player's numbering, for parallel
 * movement (`fevga.md`, "Board & notation"): `p > 12 ? p - 12 : p + 12`.
 */
export function otherPoint(p: number): number {
  return p > 12 ? p - 12 : p + 12;
}

/** Own point `p` (1–24) of `player` → index into `board.points`. */
function boardIndex(p: number, player: PlayerId): number {
  return (player === 'white' ? p : otherPoint(p)) - 1;
}

/**
 * Reads a board from the view of `player`. Throws `INVALID_STATE` for things
 * Fevga never has: pinned checkers, two colors on one point, checkers on the
 * bar or outside.
 */
export function fromBoard(
  board: BoardState,
  player: PlayerId,
): { readonly pos: Position; readonly opp: Opponent } {
  const other = opponent(player);
  for (const side of [player, other]) {
    if (board.bar[side] !== 0 || board.outside[side] !== 0) {
      throw new EngineError(
        'INVALID_STATE',
        'Fevga has no bar and no checkers outside',
        board.bar[side] !== 0 ? `state.board.bar.${side}` : `state.board.outside.${side}`,
      );
    }
  }
  const pos: Position = new Array<number>(COUNTS + 2).fill(0);
  const on: number[] = new Array<number>(COUNTS).fill(0);
  const own: number[] = new Array<number>(COUNTS).fill(0);
  for (let p = 1; p <= 24; p += 1) {
    const index = boardIndex(p, player);
    const point = board.points[index] as PointState;
    if (point.pinned !== null || (point.white > 0 && point.black > 0)) {
      throw new EngineError(
        'INVALID_STATE',
        'Fevga never has two colors on one point',
        `state.board.points[${index}]`,
      );
    }
    pos[p] = point[player];
    on[p] = point[other];
    own[otherPoint(p)] = point[other];
  }
  pos[0] = board.off[player];
  own[0] = board.off[other];
  rehash(pos);
  return { pos, opp: { on, own } };
}

/** Writes a position back as a `BoardState`. */
export function toBoard(pos: Position, opp: Opponent, player: PlayerId): BoardState {
  const points: PointState[] = new Array<PointState>(24);
  for (let p = 1; p <= 24; p += 1) {
    const mine = pos[p] as number;
    const theirs = opp.on[p] as number;
    points[boardIndex(p, player)] =
      player === 'white'
        ? { white: mine, black: theirs, pinned: null }
        : { white: theirs, black: mine, pinned: null };
  }
  return {
    points,
    bar: { white: 0, black: 0 },
    outside: { white: 0, black: 0 },
    // White first, so the JSON is the same whoever moved.
    off:
      player === 'white'
        ? { white: pos[0] as number, black: opp.own[0] as number }
        : { white: opp.own[0] as number, black: pos[0] as number },
  };
}

// ---------------------------------------------------------------------------
// PositionMap: a fast, exact map keyed by position and a small tag.

/** Counts are 0–15, so each index has 16 possible values. */
const VALUES = 16;
/** Room for the extra `tag` number a key can have. */
const TAGS = 64;

// Zobrist tables: one random 30-bit pair per (index, value) and per tag.
// Fixed seed, so the engine stays deterministic.
const zobrist = createSeededRng(0xfe56a);
const random30 = (): number => zobrist.nextUint32() & 0x3fff_ffff;
const Z1 = Array.from({ length: COUNTS * VALUES }, random30);
const Z2 = Array.from({ length: COUNTS * VALUES }, random30);
const T1 = Array.from({ length: TAGS }, random30);
const T2 = Array.from({ length: TAGS }, random30);

/** Computes both hash slots from scratch. */
function rehash(pos: Position): void {
  let h1 = 0;
  let h2 = 0;
  for (let i = 0; i < COUNTS; i += 1) {
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

/** A 53-bit key (30 + 23 bits) for a position and a tag (0 to 63). */
function key(pos: Position, tag: number): number {
  const h1 = (pos[HASH1] as number) ^ (T1[tag] as number);
  const h2 = (pos[HASH2] as number) ^ (T2[tag] as number);
  return h1 * 0x80_0000 + (h2 >>> 7);
}

function samePosition(a: Position, b: Position): boolean {
  for (let i = 0; i < COUNTS; i += 1) if (a[i] !== b[i]) return false;
  return true;
}

interface Entry<T> {
  readonly pos: Position;
  readonly tag: number;
  readonly value: T;
  /** The next entry with the same hash key. */
  next: Entry<T> | undefined;
}

/**
 * A map from (position, tag) to a value. Keys are the Zobrist hashes kept
 * in the position. Two keys with the same hash are told apart by comparing
 * the positions, so the map is exact.
 */
export class PositionMap<T> {
  private readonly entries = new Map<number, Entry<T>>();

  get(pos: Position, tag = 0): T | undefined {
    for (let entry = this.entries.get(key(pos, tag)); entry !== undefined; entry = entry.next) {
      if (entry.tag === tag && samePosition(entry.pos, pos)) return entry.value;
    }
    return undefined;
  }

  /** Adds the key if it is new. Returns `false` (and changes nothing) when it is already there. */
  add(pos: Position, value: T, tag = 0): boolean {
    const k = key(pos, tag);
    const first = this.entries.get(k);
    for (let entry = first; entry !== undefined; entry = entry.next) {
      if (entry.tag === tag && samePosition(entry.pos, pos)) return false;
    }
    this.entries.set(k, { pos, tag, value, next: first });
    return true;
  }
}

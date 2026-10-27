/**
 * The fast, private position used by the Plakoto move generator.
 *
 * Like the Portes position (`../portes/position.ts`), it is one small array
 * of numbers, always seen from the player to move (own numbering):
 *
 * | Index       | Meaning                                                  |
 * | ----------- | -------------------------------------------------------- |
 * | 0           | mover's checkers borne off                               |
 * | 1–24        | mover's checkers on own point `p`                        |
 * | 24 + p      | opponent checkers on the mover's own point `p` (25–48)   |
 * | 48 + p      | the pin on point `p` (49–72), see `FREE` … `THEIRS_NEW`  |
 *
 * One more slot holds a hash of the counts, kept up to date by `put`.
 * Plakoto has no bar and no checkers outside.
 *
 * Nothing here leaves the variant. `toBoard` turns it back into a
 * `BoardState`.
 */

import type { BoardState, PointState } from '../../board';
import { EngineError } from '../../errors';
import { opponent } from '../../player';
import type { PlayerId } from '../../player';
import { createSeededRng } from '../../rng';

export const OFF = 0;
export const OPP = 24;
export const PIN = 48;
/** The number of counts in a position. */
export const POSITION_SIZE = 73;

/** No pin on the point. */
export const FREE = 0;
/** The mover's lone checker is pinned under opponent checkers. */
export const MINE = 1;
/** The opponent's lone checker is pinned under the mover's checkers. */
export const THEIRS = 2;
/**
 * Like `THEIRS`, but the mover made this pin during this turn. Used only
 * with `intermediatePinBlocks`: the last pinner may not move on this turn.
 */
export const THEIRS_NEW = 3;

const HASH = POSITION_SIZE;

/** Counts, then the hash slot. Change counts only with `put`, so the hash stays right. */
export type Position = number[];

/** Own point `p` (1–24) of `player` → index into `board.points`. Contrary movement. */
function boardIndex(p: number, player: PlayerId): number {
  return player === 'white' ? p - 1 : 24 - p;
}

/** Reads a board from the view of `player`. Throws `INVALID_STATE` for a bar or outside checker. */
export function fromBoard(board: BoardState, player: PlayerId): Position {
  const other = opponent(player);
  for (const where of ['bar', 'outside'] as const) {
    if (board[where].white !== 0 || board[where].black !== 0) {
      throw new EngineError(
        'INVALID_STATE',
        `Plakoto has no checkers on the ${where}`,
        `state.board.${where}`,
      );
    }
  }
  const pos: Position = new Array<number>(POSITION_SIZE + 1).fill(0);
  for (let p = 1; p <= 24; p += 1) {
    const point = board.points[boardIndex(p, player)] as PointState;
    pos[p] = point[player];
    pos[OPP + p] = point[other];
    pos[PIN + p] = point.pinned === null ? FREE : point.pinned === player ? MINE : THEIRS;
  }
  pos[OFF] = board.off[player];
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
    const pin = pos[PIN + p] as number;
    const pinned = pin === FREE ? null : pin === MINE ? player : other;
    points[boardIndex(p, player)] =
      player === 'white'
        ? { white: mine, black: theirs, pinned }
        : { white: theirs, black: mine, pinned };
  }
  return {
    points,
    bar: { white: 0, black: 0 },
    outside: { white: 0, black: 0 },
    off:
      player === 'white'
        ? { white: pos[OFF] as number, black: opponentOff }
        : { white: opponentOff, black: pos[OFF] as number },
  };
}

// ---------------------------------------------------------------------------
// PositionMap: a fast, exact map keyed by position (same idea as Portes).

/** Counts are 0–15, so each index has 16 possible values. */
const VALUES = 16;
/** Room for the extra `tag` number the search adds to a key. */
const TAGS = 1024;

// Zobrist tables. Fixed seed, so the engine stays deterministic.
const zobrist = createSeededRng(0x9a4c07);
const random30 = (): number => zobrist.nextUint32() & 0x3fff_ffff;
const ZOBRIST = Array.from({ length: POSITION_SIZE * VALUES }, random30);
const TAG_KEYS = Array.from({ length: TAGS }, random30);

function rehash(pos: Position): void {
  let h = 0;
  for (let i = 0; i < POSITION_SIZE; i += 1)
    h ^= ZOBRIST[i * VALUES + (pos[i] as number)] as number;
  pos[HASH] = h;
}

/** Sets count `index` to `value` (0–15) and updates the hash. */
export function put(pos: Position, index: number, value: number): void {
  const old = index * VALUES + (pos[index] as number);
  const now = index * VALUES + value;
  pos[HASH] = (pos[HASH] as number) ^ (ZOBRIST[old] as number) ^ (ZOBRIST[now] as number);
  pos[index] = value;
}

/**
 * A 30-bit key: a small integer, which a `Map` handles much faster than a
 * larger number. Two positions with the same key are told apart by
 * comparing them, so the map stays exact.
 */
function key(pos: Position, tag: number): number {
  return (pos[HASH] as number) ^ (TAG_KEYS[tag] as number);
}

function samePosition(a: Position, b: Position): boolean {
  for (let i = 0; i < POSITION_SIZE; i += 1) if (a[i] !== b[i]) return false;
  return true;
}

interface Entry<T> {
  readonly pos: Position;
  readonly tag: number;
  value: T;
  /** The next entry with the same hash key (rare). */
  next: Entry<T> | null;
}

/** A map from (position, tag 0–1023) to a value. Equal hashes are told apart by comparing positions. */
export class PositionMap<T> {
  private readonly entries = new Map<number, Entry<T>>();

  get(pos: Position, tag = 0): T | undefined {
    let e: Entry<T> | null | undefined = this.entries.get(key(pos, tag));
    for (; e !== undefined && e !== null; e = e.next) {
      if (e.tag === tag && samePosition(e.pos, pos)) return e.value;
    }
    return undefined;
  }

  set(pos: Position, value: T, tag = 0): void {
    const k = key(pos, tag);
    const first = this.entries.get(k);
    let e: Entry<T> | null | undefined = first;
    for (; e !== undefined && e !== null; e = e.next) {
      if (e.tag === tag && samePosition(e.pos, pos)) {
        e.value = value;
        return;
      }
    }
    this.entries.set(k, { pos, tag, value, next: first ?? null });
  }
}

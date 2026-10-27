/**
 * Undo for one checker moved with several dice (#180). Pure TypeScript.
 *
 * The engine plays and undoes single moves only. A "2+3" move is two
 * engine moves, so the screen keeps a note of each group: the turn it was
 * played in, the moves played after it, and how many moves it holds. One
 * Undo takes back the whole group when the last moves of the turn are
 * still that group. Otherwise (a single move came after it, or the turn
 * moved on) Undo takes back one move, as before.
 *
 * The note never decides what is legal: undo is the engine's `undo`
 * action, sent once per step.
 */
import { sameMove, type GameFlow, type GameState, type Move } from '@tavli/engine';

export interface MoveGroup {
  /** The turn's start state (`GameFlow.state`): the same object for every move of a turn. */
  readonly state: GameState;
  /** The moves of the turn right after the group was played. */
  readonly played: readonly Move[];
  /** How many of the last moves form the group (two or more). */
  readonly size: number;
}

const samePlayed = (a: readonly Move[], b: readonly Move[]) =>
  a.length === b.length &&
  a.every((move, i) => {
    const other = b[i];
    return other !== undefined && sameMove(move, other);
  });

/** True when `group` belongs to the turn of `game` and its moves are still the last ones. */
const isTop = (group: MoveGroup, game: GameFlow) =>
  group.state === game.state && samePlayed(group.played, game.played);

/** The groups after a group of `size` moves was played: `game` is the flow after it. */
export function addGroup(
  groups: readonly MoveGroup[],
  game: GameFlow,
  size: number,
): readonly MoveGroup[] {
  // Groups of another turn can never match again.
  const kept = groups.filter((g) => g.state === game.state);
  return [...kept, { state: game.state, played: game.played, size }];
}

/**
 * How many engine moves one Undo takes back now: the size of the group on
 * top, or 1. Never more than the moves played, but at least 1: with
 * nothing to take back, the engine refuses the one `undo`, as before.
 */
export function undoSize(groups: readonly MoveGroup[], game: GameFlow): number {
  const top = groups.find((g) => isTop(g, game));
  const size = top?.size ?? 1;
  return Math.max(1, Math.min(size, game.played.length));
}

/** The groups after the group on top (or one move) was taken back. */
export function dropTop(groups: readonly MoveGroup[], game: GameFlow): readonly MoveGroup[] {
  return groups.filter((g) => g.state === game.state && !isTop(g, game));
}

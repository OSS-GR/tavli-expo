/**
 * What the board shows for Asodio (`docs/rules/asodio.md`, owner version):
 * the checkers still to enter, the loading lock, and the checkers the
 * quarter lock freezes. Pure TypeScript: no React, no Skia.
 *
 * The engine decides every move (`legalNextMoves`). These helpers only
 * read the board and the rules, so the screen can explain why a checker
 * does not move. They follow the engine's own rules (engine README,
 * "Asodio"):
 *
 * - Loading lock (`firstEntryGate`): while all 15 checkers are still
 *   outside, only a 1-2 or a double opens the board (or only a double,
 *   with `firstEntryGateRolls: "doubleOnly"`). Other rolls pass.
 * - Quarter lock (`quarterLock`): the rear quarter is the quarter of the
 *   player's last checker (checkers outside or on the bar count as the
 *   starting quarter). A checker in a quarter in front of it is frozen.
 * - A6: when every checker in the rear quarter is pinned, the whole army is
 *   frozen and the player passes until it is free.
 */
import {
  CHECKERS_PER_PLAYER,
  absoluteToOwn,
  type BoardState,
  type Dice,
  type PlayerId,
  type RuleSet,
} from '@tavli/engine';

import { frozenSlotKeys, type BoardMarks, type BoardView } from './boardModel';

/** The quarter of own point `p`: 0 = 19–24 (the starting quarter) … 3 = 1–6 (home). */
export function quarterOf(p: number): number {
  return Math.floor((24 - p) / 6);
}

/** Checkers of `player` that have not entered the board yet. */
export function toEnterCount(board: BoardState, player: PlayerId): number {
  return board.outside[player];
}

/** What opens the board while it is locked. */
export type LoadingGate = 'aceDeuceOrDouble' | 'doubleOnly';

/**
 * The loading lock of `player`: which rolls open the board, or `null` when
 * the board is open (a checker has entered, or the rules have no lock).
 */
export function loadingGate(
  board: BoardState,
  player: PlayerId,
  rules: RuleSet,
): LoadingGate | null {
  if (rules.board.startPosition !== 'offBoard' || !rules.entry.firstEntryGate) return null;
  if (board.outside[player] !== CHECKERS_PER_PLAYER) return null;
  return rules.entry.firstEntryGateRolls;
}

/** True when `dice` open a board locked by `gate`. */
export function opensGate(gate: LoadingGate, dice: Dice): boolean {
  const [a, b] = dice;
  if (a === b) return true;
  return gate === 'aceDeuceOrDouble' && Math.min(a, b) === 1 && Math.max(a, b) === 2;
}

/** A player's checkers on one point, in their own numbering. */
interface OwnPoint {
  /** Own point number, 1–24. */
  readonly point: number;
  /** Free (not pinned) checkers of the player on it. */
  readonly free: number;
  /** True when the player's checker on it is pinned. */
  readonly pinned: boolean;
}

function ownPoints(board: BoardState, player: PlayerId, rules: RuleSet): OwnPoint[] {
  const direction = rules.movement.direction;
  const out: OwnPoint[] = [];
  board.points.forEach((p, i) => {
    const count = p[player];
    if (count === 0) return;
    const pinned = p.pinned === player;
    out.push({
      point: absoluteToOwn(i + 1, player, direction),
      free: count - (pinned ? 1 : 0),
      pinned,
    });
  });
  return out;
}

/** The rear quarter of `player` (0 = starting quarter … 3 = home). */
export function rearQuarter(board: BoardState, player: PlayerId, rules: RuleSet): number {
  if (board.outside[player] > 0 || board.bar[player] > 0) return 0;
  const points = ownPoints(board, player, rules);
  if (points.length === 0) return 3;
  return Math.min(...points.map((p) => quarterOf(p.point)));
}

/**
 * Own points of `player` whose free checkers the quarter lock freezes: in
 * front of the rear quarter. Sorted high to low (the way the army moves).
 * Empty without `quarterLock`. A frozen checker may still move inside its
 * quarter with `moveInsideFrozenQuarter`; it is listed all the same.
 */
export function frozenPoints(board: BoardState, player: PlayerId, rules: RuleSet): number[] {
  if (!rules.quarters.quarterLock) return [];
  const rear = rearQuarter(board, player, rules);
  return ownPoints(board, player, rules)
    .filter((p) => p.free > 0 && quarterOf(p.point) > rear)
    .map((p) => p.point)
    .sort((a, b) => b - a);
}

/**
 * A6: the whole army of `player` is frozen. Every checker in the rear
 * quarter is pinned, and the quarter lock holds the rest. The player passes
 * until a pin is lifted.
 */
export function armyFrozen(board: BoardState, player: PlayerId, rules: RuleSet): boolean {
  if (!rules.quarters.quarterLock || rules.quarters.moveInsideFrozenQuarter) return false;
  if (board.outside[player] > 0 || board.bar[player] > 0) return false;
  const rear = rearQuarter(board, player, rules);
  const inRear = ownPoints(board, player, rules).filter((p) => quarterOf(p.point) === rear);
  return inRear.length > 0 && inRear.every((p) => p.pinned && p.free === 0);
}

/**
 * The marks the board draws for Asodio: the frozen checkers of both
 * players (`frozenPoints`). Empty for a game without the quarter lock.
 */
export function asodioMarks(board: BoardState, rules: RuleSet, view: BoardView): BoardMarks {
  if (!rules.quarters.quarterLock) return {};
  const frozen = frozenSlotKeys(
    { white: frozenPoints(board, 'white', rules), black: frozenPoints(board, 'black', rules) },
    view,
  );
  return frozen.size === 0 ? {} : { frozen };
}

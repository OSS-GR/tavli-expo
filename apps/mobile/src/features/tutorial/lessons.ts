/**
 * The first-run tutorial (#128): seven short lessons in Portes, each on a
 * fixed position with fixed dice. Pure TypeScript.
 *
 * The engine decides what is legal (`legalNextMoves`). A lesson only keeps
 * the legal moves that teach its point (`accepts`), so the board lights up
 * only the checker and the target to touch. No RNG: the dice are part of
 * the lesson.
 *
 * Positions are written in each player's own numbering (24 = start, 1 =
 * the last point of home). White (you) sits at the bottom and moves
 * 24 → 1. Black's own point `p` is White's `25 - p`.
 */
import {
  applyGameAction,
  createBoard,
  createGameFlow,
  getPreset,
  legalNextMoves,
  portes,
  type BoardState,
  type Dice,
  type GameFlow,
  type Move,
  type SourceMoves,
} from '@tavli/engine';

export type LessonId = 'move' | 'bothDice' | 'double' | 'makePoint' | 'hit' | 'enter' | 'bearOff';

export interface Lesson {
  readonly id: LessonId;
  readonly board: BoardState;
  readonly dice: Dice;
  /** May the player make `move` now, after `played`? Only legal moves are asked. */
  readonly accepts: (move: Move, played: readonly Move[]) => boolean;
  /** The lesson is learnt: the moves made so far reach its goal. */
  readonly done: (flow: GameFlow) => boolean;
}

/** Your home and a few checkers already there: 14 checkers on points 6 to 3. */
const WHITE_HOME = { 6: 4, 5: 4, 4: 3, 3: 3 } as const;
/** Black's checkers in its home (White's points 19 to 21). */
const BLACK_HOME = { 6: 5, 5: 5, 4: 5 } as const;

const portesBoard = (white: Parameters<typeof createBoard>[0]['white'], black = {}) =>
  createBoard({ white, black: { points: BLACK_HOME, ...black } }, 'contrary');

/** Moves of one checker: it starts on `start`, then keeps moving. */
const followChecker =
  (start: number) =>
  (move: Move, played: readonly Move[]): boolean => {
    const last = played[played.length - 1];
    return move.from === (last === undefined ? start : last.to);
  };

/** Every die of the roll is used. */
const allDiceUsed = (flow: GameFlow) => flow.phase === 'awaiting-confirm';
const movesMade = (count: number) => (flow: GameFlow) => flow.played.length >= count;

export const LESSONS: readonly Lesson[] = [
  {
    // 1. One checker, one die: 13 → 9 with the 4.
    id: 'move',
    board: portesBoard({ points: { 13: 1, ...WHITE_HOME } }),
    dice: [4, 2],
    accepts: (move) => move.from === 13 && move.die === 4,
    done: movesMade(1),
  },
  {
    // 2. Both dice, the same checker: 13 → 5 with 5 and 3.
    id: 'bothDice',
    board: portesBoard({ points: { 13: 1, ...WHITE_HOME } }),
    dice: [5, 3],
    accepts: followChecker(13),
    done: allDiceUsed,
  },
  {
    // 3. A double moves four times: 13 → 10 → 7 → 4 → 1.
    id: 'double',
    board: portesBoard({ points: { 13: 1, ...WHITE_HOME } }),
    dice: [3, 3],
    accepts: followChecker(13),
    done: allDiceUsed,
  },
  {
    // 4. Two checkers on 7 make a point: 11 → 7 with the 4, 9 → 7 with the 2.
    id: 'makePoint',
    board: portesBoard({ points: { 11: 1, 9: 1, 6: 4, 5: 4, 4: 3, 3: 2 } }),
    dice: [4, 2],
    accepts: (move) => move.to === 7 && (move.from === 11 || move.from === 9),
    done: allDiceUsed,
  },
  {
    // 5. Hit Black's lone checker on 9 (Black's own 16): 13 → 9 with the 4.
    id: 'hit',
    board: portesBoard(
      { points: { 13: 1, ...WHITE_HOME } },
      { points: { 16: 1, 6: 5, 5: 5, 4: 4 } },
    ),
    dice: [4, 1],
    accepts: (move) => move.from === 13 && move.capture === 'hit',
    done: movesMade(1),
  },
  {
    // 6. Enter from the bar. The 5 is blocked (Black holds 20); the 3 enters on 22.
    id: 'enter',
    board: portesBoard({ points: WHITE_HOME, bar: 1 }),
    dice: [5, 3],
    accepts: (move) => move.from === 'bar',
    done: movesMade(1),
  },
  {
    // 7. Bear off the last two checkers: 6 with the 6, 4 with the 4.
    id: 'bearOff',
    board: portesBoard({ points: { 6: 1, 4: 1 }, off: 13 }),
    dice: [6, 4],
    accepts: (move) => move.to === 'off',
    done: allDiceUsed,
  },
];

/** The flow of a lesson: White to move with the lesson's dice, in the Portes preset. */
export function startLesson(lesson: Lesson): GameFlow {
  const start = portes.initialState({ startingPlayer: 'white', rules: getPreset('portes') });
  const flow = createGameFlow({ state: { ...start, board: lesson.board }, starter: 'white' });
  return applyGameAction(flow, { type: 'roll', player: 'white', dice: lesson.dice });
}

/**
 * The moves the board offers now: the engine's legal moves that the lesson
 * accepts. Empty once the lesson is done.
 */
export function lessonMoves(lesson: Lesson, flow: GameFlow): readonly SourceMoves[] {
  if (lesson.done(flow)) return [];
  return legalNextMoves(flow)
    .map((group) => ({
      from: group.from,
      moves: group.moves.filter((move) => lesson.accepts(move, flow.played)),
    }))
    .filter((group) => group.moves.length > 0);
}

/** Plays `move` in the lesson. Returns `null` if the lesson does not offer it. */
export function playLessonMove(lesson: Lesson, flow: GameFlow, move: Move): GameFlow | null {
  const offered = lessonMoves(lesson, flow).some((group) =>
    group.moves.some((m) => m.from === move.from && m.to === move.to && m.die === move.die),
  );
  if (!offered) return null;
  return applyGameAction(flow, { type: 'move', player: 'white', move });
}

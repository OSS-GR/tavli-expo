/**
 * The tutorial: seven short lessons in Portes (#128, the first-run
 * tutorial), and four each for what is new in Plakoto and Fevga (#149)
 * and Asodio (#159). Each lesson has a fixed position with fixed dice.
 * Pure TypeScript.
 *
 * The engine decides what is legal (`legalNextMoves`). A lesson only keeps
 * the legal moves that teach its point (`accepts`), so the board lights up
 * only the checker and the target to touch. No RNG: the dice are part of
 * the lesson.
 *
 * Each lesson plays in its game's default preset (`lessonRules`), so the
 * rules are the ones of a real game: Plakoto with the mother question
 * (`offerConcede`), Fevga with the runner rule and the six-in-a-row bans,
 * Asodio in the owner version (`asodio.kafeneio`: the loading lock, the
 * quarter lock, pins).
 *
 * Positions are written in each player's own numbering (24 = start, 1 =
 * the last point of home). White (you) sits at the bottom and moves
 * 24 → 1. Black's own point `p` is White's `25 - p` in Portes, Plakoto and
 * Asodio (contrary), and `p ± 12` in Fevga (parallel).
 */
import type { TutorialGame } from '@tavli/contracts';
import {
  ASODIO_START,
  DEFAULT_PRESET_BY_GAME,
  applyGameAction,
  asodio,
  createBoard,
  createGameFlow,
  currentBoard,
  fevga,
  getPreset,
  legalNextMoves,
  plakoto,
  portes,
  type BoardState,
  type Dice,
  type Direction,
  type GameFlow,
  type Move,
  type RuleSet,
  type SideLayout,
  type SourceMoves,
  type Variant,
} from '@tavli/engine';

export type { TutorialGame };

export type PortesLessonId =
  'move' | 'bothDice' | 'double' | 'makePoint' | 'hit' | 'enter' | 'bearOff';
export type PlakotoLessonId = 'pin' | 'pinned' | 'mother' | 'plakotoBearOff';
export type FevgaLessonId = 'sameWay' | 'holdPoint' | 'runner' | 'sixInARow';
export type AsodioLessonId = 'aceDeuce' | 'enterAll' | 'quarterLock' | 'pinLast';
/** Lesson ids are unique over all games: they name the strings and the analytics. */
export type LessonId = PortesLessonId | PlakotoLessonId | FevgaLessonId | AsodioLessonId;

export interface Lesson {
  readonly id: LessonId;
  /** The game, and so the variant and preset, the lesson plays in. */
  readonly game: TutorialGame;
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

const portesBoard = (white: SideLayout, black = {}) =>
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

/** The Portes lessons: the first-run tutorial (#128). */
export const PORTES_LESSONS: readonly Lesson[] = [
  {
    // 1. One checker, one die: 13 → 9 with the 4.
    id: 'move',
    game: 'portes',
    board: portesBoard({ points: { 13: 1, ...WHITE_HOME } }),
    dice: [4, 2],
    accepts: (move) => move.from === 13 && move.die === 4,
    done: movesMade(1),
  },
  {
    // 2. Both dice, the same checker: 13 → 5 with 5 and 3.
    id: 'bothDice',
    game: 'portes',
    board: portesBoard({ points: { 13: 1, ...WHITE_HOME } }),
    dice: [5, 3],
    accepts: followChecker(13),
    done: allDiceUsed,
  },
  {
    // 3. A double moves four times: 13 → 10 → 7 → 4 → 1.
    id: 'double',
    game: 'portes',
    board: portesBoard({ points: { 13: 1, ...WHITE_HOME } }),
    dice: [3, 3],
    accepts: followChecker(13),
    done: allDiceUsed,
  },
  {
    // 4. Two checkers on 7 make a point: 11 → 7 with the 4, 9 → 7 with the 2.
    id: 'makePoint',
    game: 'portes',
    board: portesBoard({ points: { 11: 1, 9: 1, 6: 4, 5: 4, 4: 3, 3: 2 } }),
    dice: [4, 2],
    accepts: (move) => move.to === 7 && (move.from === 11 || move.from === 9),
    done: allDiceUsed,
  },
  {
    // 5. Hit Black's lone checker on 9 (Black's own 16): 13 → 9 with the 4.
    id: 'hit',
    game: 'portes',
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
    game: 'portes',
    board: portesBoard({ points: WHITE_HOME, bar: 1 }),
    dice: [5, 3],
    accepts: (move) => move.from === 'bar',
    done: movesMade(1),
  },
  {
    // 7. Bear off the last two checkers: 6 with the 6, 4 with the 4.
    id: 'bearOff',
    game: 'portes',
    board: portesBoard({ points: { 6: 1, 4: 1 }, off: 13 }),
    dice: [6, 4],
    accepts: (move) => move.to === 'off',
    done: allDiceUsed,
  },
];

const plakotoBoard = (white: SideLayout, black: SideLayout) =>
  createBoard({ white, black }, 'contrary');

/** True when `player`'s lone checker on White's point `point` is pinned. */
const pinnedOn = (point: number, player: 'white' | 'black') => (flow: GameFlow) =>
  currentBoard(flow).points[point - 1]?.pinned === player;

/** The Plakoto lessons (#149): what is new after Portes. */
export const PLAKOTO_LESSONS: readonly Lesson[] = [
  {
    // 1. Pin Black's lone checker on 9 (Black's own 16): 13 → 9 with the 4.
    id: 'pin',
    game: 'plakoto',
    board: plakotoBoard(
      { points: { 13: 1, ...WHITE_HOME } },
      { points: { 16: 1, 6: 5, 5: 5, 4: 4 } },
    ),
    dice: [4, 2],
    accepts: (move) => move.from === 13 && move.capture === 'pin',
    done: pinnedOn(9, 'black'),
  },
  {
    // 2. Your checker on 16 is pinned (Black's 9 on top): it cannot move.
    //    Move the free checker instead: 13 → 6 with 5 and 2.
    id: 'pinned',
    game: 'plakoto',
    board: plakotoBoard(
      { points: { 16: 1, 13: 1, 6: 4, 5: 4, 4: 3, 3: 2 }, pinned: [16] },
      { points: { 9: 1, 6: 5, 5: 5, 4: 4 } },
    ),
    dice: [5, 2],
    accepts: followChecker(13),
    done: allDiceUsed,
  },
  {
    // 3. The mother: Black's last checker sits alone on its start (White's 1).
    //    Pin it: 5 → 1 with the 4. The app then asks Black "resign or play on".
    id: 'mother',
    game: 'plakoto',
    board: plakotoBoard(
      { points: { 8: 5, 7: 4, 6: 5, 5: 1 } },
      { points: { 24: 1, 13: 4, 12: 5, 6: 5 } },
    ),
    dice: [4, 3],
    accepts: (move) => move.to === 1 && move.capture === 'pin',
    done: pinnedOn(1, 'black'),
  },
  {
    // 4. Bear off the last two checkers, none pinned: 5 with the 5, 3 with the 3.
    id: 'plakotoBearOff',
    game: 'plakoto',
    board: plakotoBoard({ points: { 5: 1, 3: 1 }, off: 13 }, { points: BLACK_HOME }),
    dice: [5, 3],
    accepts: (move) => move.to === 'off',
    done: allDiceUsed,
  },
];

const fevgaBoard = (white: SideLayout, black: SideLayout) =>
  createBoard({ white, black }, 'parallel');

/** The Fevga lessons (#149): what is new after Portes. */
export const FEVGA_LESSONS: readonly Lesson[] = [
  {
    // 1. The start: your 15 on 24, Black's 15 on your 12 (the opposite
    //    corner). Run your first checker with both dice: 24 → 16 with 5 and 3.
    id: 'sameWay',
    game: 'fevga',
    board: fevgaBoard({ points: { 24: 15 } }, { points: { 24: 15 } }),
    dice: [5, 3],
    accepts: followChecker(24),
    done: allDiceUsed,
  },
  {
    // 2. One checker holds a point: Black's lone checker on 6 (Black's own
    //    18) blocks the 4. Play the 3 first: 10 → 7 → 3.
    id: 'holdPoint',
    game: 'fevga',
    board: fevgaBoard(
      { points: { 10: 1, 5: 4, 4: 4, 3: 3, 2: 3 } },
      { points: { 18: 1, 6: 5, 5: 5, 4: 4 } },
    ),
    dice: [4, 3],
    accepts: followChecker(10),
    done: allDiceUsed,
  },
  {
    // 3. The runner rule: your runner on 13 must pass Black's start (your
    //    12) before the checkers on 24 may move. 13 → 11 with the 2, then
    //    24 → 23 with the 1 (13 → 12 is blocked: Black holds 12).
    id: 'runner',
    game: 'fevga',
    board: fevgaBoard({ points: { 24: 14, 13: 1 } }, { points: { 24: 15 } }),
    dice: [2, 1],
    accepts: (move, played) => move.from === (played.length === 0 ? 13 : 24),
    done: allDiceUsed,
  },
  {
    // 4. Six in a row (P1): you hold 24 to 20, and 24 → 19 with the 5 would
    //    fill your starting quarter. Black's home (your 13 to 18) blocks
    //    every other way to play both dice, so the engine allows only one
    //    die: the higher, 8 → 2 with the 6. The 5 is lost.
    id: 'sixInARow',
    game: 'fevga',
    board: fevgaBoard(
      { points: { 24: 10, 23: 1, 22: 1, 21: 1, 20: 1, 8: 1 } },
      { points: { 6: 3, 5: 3, 4: 3, 3: 2, 2: 2, 1: 2 } },
    ),
    dice: [6, 5],
    accepts: () => true,
    done: allDiceUsed,
  },
];

const asodioBoard = (white: SideLayout, black: SideLayout) =>
  createBoard({ white, black }, 'contrary');

/**
 * The Asodio lessons (#159), in the owner version (`asodio.md`, preset
 * `kafeneio`): the loading lock, the quarter lock, and pins instead of hits.
 */
export const ASODIO_LESSONS: readonly Lesson[] = [
  {
    // 1. The loading lock (phase 1.2–1.3): all 15 wait off the board, and
    //    only a 1-2 or a double opens it. You rolled 1-2: the 1 enters on
    //    24 (spot 1), the 2 on 23 (spot 2).
    id: 'aceDeuce',
    game: 'asodio',
    board: asodioBoard(ASODIO_START, ASODIO_START),
    dice: [1, 2],
    accepts: (move) => move.from === 'outside',
    done: allDiceUsed,
  },
  {
    // 2. Load all 15 (phase 1.4–1.7, A1): 4 still wait. The double 3-3
    //    enters all four on 22 (spot 3). The 11 on the board may not move
    //    while a checker waits, so every die enters.
    id: 'enterAll',
    game: 'asodio',
    board: asodioBoard(
      { points: { 24: 3, 23: 3, 21: 3, 20: 2 }, outside: 4 },
      { points: { 24: 1, 23: 1 }, outside: 13 },
    ),
    dice: [3, 3],
    accepts: (move) => move.from === 'outside',
    done: allDiceUsed,
  },
  {
    // 3. The quarter lock (phase 2): 14 checkers reached 13 to 18 and are
    //    frozen there, because the last one still sits on 20. Bring it up
    //    with one die (20 → 16 or 20 → 17); then the army is free, and the
    //    other die moves any checker.
    id: 'quarterLock',
    game: 'asodio',
    board: asodioBoard(
      { points: { 20: 1, 18: 3, 17: 3, 16: 3, 15: 3, 14: 2 } },
      { points: { 24: 3, 23: 3, 22: 3, 21: 3, 20: 3 } },
    ),
    dice: [4, 3],
    accepts: (move, played) => played.length > 0 || move.from === 20,
    done: allDiceUsed,
  },
  {
    // 4. Pin, do not hit (phase 3, A6): Black's last checker sits alone on
    //    your 10 (Black's own 15); the rest of its army waits, frozen, on
    //    your 13 and 14. Pin it: 16 → 10 with the 6. Now Black's whole army
    //    is frozen until you leave.
    id: 'pinLast',
    game: 'asodio',
    board: asodioBoard(
      { points: { 18: 4, 17: 4, 16: 4, 15: 3 } },
      { points: { 15: 1, 12: 7, 11: 7 } },
    ),
    dice: [6, 2],
    accepts: (move) => move.to === 10 && move.capture === 'pin',
    done: pinnedOn(10, 'black'),
  },
];

/** The lesson set of each game. */
export const LESSON_SETS: { readonly [G in TutorialGame]: readonly Lesson[] } = {
  portes: PORTES_LESSONS,
  plakoto: PLAKOTO_LESSONS,
  fevga: FEVGA_LESSONS,
  asodio: ASODIO_LESSONS,
};

/** The Portes lessons, the default set. */
export const LESSONS = PORTES_LESSONS;

const VARIANTS: { readonly [G in TutorialGame]: Variant } = { portes, plakoto, fevga, asodio };

/** The rules of `game`'s lessons: its default preset (Asodio: `asodio.kafeneio`). */
export function lessonRules(game: TutorialGame): RuleSet {
  return getPreset(DEFAULT_PRESET_BY_GAME[game]);
}

/** How the players move in `game`: contrary, or parallel in Fevga. */
export function lessonDirection(game: TutorialGame): Direction {
  return lessonRules(game).movement.direction;
}

/** The flow of a lesson: White to move with the lesson's dice, in the game's default preset. */
export function startLesson(lesson: Lesson): GameFlow {
  const rules = lessonRules(lesson.game);
  const start = VARIANTS[lesson.game].initialState({ startingPlayer: 'white', rules });
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

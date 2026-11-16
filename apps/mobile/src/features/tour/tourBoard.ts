/**
 * The positions of the tour's try-it pages (#573). Pure: no React.
 *
 * The move page is a Portes game at the start, White to move with 4 and 2,
 * in the default preset (as the first lesson). The engine decides what is
 * legal; the page only asks for one move by tap and one by drag.
 */
import {
  portes,
  applyGameAction,
  createGameFlow,
  type BoardState,
  type DieValue,
  type GameFlow,
} from '@tavli/engine';

import type { BoardView } from '@/features/board/boardModel';
import { lessonDirection, lessonRules } from '@/features/tutorial/lessons';

/** You play White, at the bottom. The board never turns. */
export const TOUR_VIEW: BoardView = { viewer: 'white', direction: lessonDirection('portes') };

/** The dice of the move page. */
export const TOUR_MOVE_DICE: readonly [DieValue, DieValue] = [4, 2];

/** The rolls of the roll page, in turn. Fixed: the tour shows, it does not play. */
export const TOUR_ROLLS: readonly (readonly [DieValue, DieValue])[] = [
  [5, 2],
  [6, 3],
  [4, 1],
  [3, 3],
];

/** The board of both pages: a Portes game at the start. */
export function tourBoard(): BoardState {
  return portes.initialState({ startingPlayer: 'white', rules: lessonRules('portes') }).board;
}

/** The flow of the move page: White to move with 4 and 2. */
export function startTourMove(): GameFlow {
  const rules = lessonRules('portes');
  const start = portes.initialState({ startingPlayer: 'white', rules });
  const flow = createGameFlow({ state: start, starter: 'white' });
  return applyGameAction(flow, { type: 'roll', player: 'white', dice: TOUR_MOVE_DICE });
}

/** How a move was made on the move page. The move list counts as either. */
export type MoveWay = 'tap' | 'drag' | 'list';

/** The move page's steps: a move by tap, a move by drag, then Confirm. */
export interface MoveSteps {
  readonly tapped: boolean;
  readonly dragged: boolean;
  readonly confirmed: boolean;
}

/**
 * The steps done, from the ways of the moves played so far (in order).
 * The move list counts for the step still open, so a screen reader can
 * finish the page.
 */
export function moveSteps(ways: readonly MoveWay[], confirmed: boolean): MoveSteps {
  let tapped = false;
  let dragged = false;
  for (const way of ways) {
    if (way === 'tap') tapped = true;
    else if (way === 'drag') dragged = true;
    else if (!tapped) tapped = true;
    else dragged = true;
  }
  return { tapped, dragged, confirmed };
}

/**
 * Whether the page takes a move made this way now: the second move must
 * be made the other way, so the player tries both. `null`: it takes it.
 * Otherwise the way the page asks for.
 */
export function wayWanted(ways: readonly MoveWay[], way: MoveWay): 'tap' | 'drag' | null {
  if (way === 'list' || ways.length === 0) return null;
  const steps = moveSteps(ways, false);
  if (way === 'tap' && steps.tapped && !steps.dragged) return 'drag';
  if (way === 'drag' && steps.dragged && !steps.tapped) return 'tap';
  return null;
}

/**
 * The board marks of a hint (#209): the same rings as a selected checker
 * and its targets. Each checker of the hint gets the select ring, and its
 * target gets the target ring with the ghost checker; a checker that moves
 * with several dice gets the combined target (dots, #180). Pure TypeScript.
 */
import { applyMoveToBoard, type BoardState, type Move, type PlayerId } from '@tavli/engine';

import { hintGroups } from '@/features/hint/hint';

import { countIn, pinnedIn, slotOfDestination, slotOfOrigin, type BoardView } from './boardModel';
import { checkerRadius, slotRect, type BoardGeometry } from './geometry';
import { landingOn, slotTop } from './interaction';
import type { BoardHighlights, Mark } from './skia/BoardScene';

/**
 * The marks for `moves` (the rest of the turn, in order) of `mover` on
 * `board` (the board now). Each target is placed on the board as it will be
 * when its checker lands, so two checkers to one point stack their ghosts.
 */
export function hintHighlights(
  geo: BoardGeometry,
  board: BoardState,
  view: BoardView,
  mover: PlayerId,
  moves: readonly Move[],
): BoardHighlights {
  const R = checkerRadius(geo);
  const cues: Mark[] = [];
  const targets: Mark[] = [];
  let now = board;
  hintGroups(moves).forEach((steps, i) => {
    const first = steps[0];
    const last = steps[steps.length - 1];
    if (first === undefined || last === undefined) return;
    const from = slotOfOrigin(first.from, mover, view);
    const top = slotTop(geo, from, countIn(now, from, view), pinnedIn(now, from, view));
    if (top !== null) cues.push({ key: `hint:${i}`, ...top });
    for (const step of steps.slice(0, -1)) now = applyMoveToBoard(now, mover, step, view.direction);
    const to = slotOfDestination(last.to, mover, view);
    const landing = landingOn(
      geo,
      to,
      countIn(now, to, view),
      pinnedIn(now, to, view),
      last.capture,
    );
    const r = to.kind === 'tray' ? Math.min(R, slotRect(geo, to).height / 2) : R;
    targets.push({
      key: `hint:${i}`,
      x: landing.x,
      y: landing.y,
      r,
      ...(steps.length > 1 ? { steps: steps.length } : {}),
    });
    now = applyMoveToBoard(now, mover, last, view.direction);
  });
  return { select: null, targets, cues };
}

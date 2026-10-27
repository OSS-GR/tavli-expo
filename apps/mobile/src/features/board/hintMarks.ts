/**
 * The board marks of a hint (#209): the same rings as a selected checker
 * and its targets. Each checker of the hint gets the select ring, and its
 * target gets the target ring with the ghost checker; a checker that moves
 * with several dice gets the combined target (dots, #180). Pure TypeScript.
 *
 * The rings go on the board as it is on screen: a ring never sits on a
 * checker that only the hint puts there.
 */
import type { BoardState, Move, PlayerId } from '@tavli/engine';

import { countIn, pinnedIn, slotOfDestination, slotOfOrigin, type BoardView } from './boardModel';
import { checkerRadius, slotKey, slotRect, type BoardGeometry } from './geometry';
import { landingOn, slotTop } from './interaction';
import type { BoardHighlights, Mark } from './skia/BoardScene';

/**
 * The moves of a hint, one run per checker: a move from where an earlier
 * run ends goes on with that checker (the latest such run). So 13/10,
 * 13/10, 10/7, 10/7 with 3-3 is two checkers 13/10/7, not a checker that
 * starts on 10. Each run keeps the order of its moves.
 */
export function checkerRuns(moves: readonly Move[]): Move[][] {
  const runs: Move[][] = [];
  for (const move of moves) {
    let run: Move[] | undefined;
    for (let i = runs.length - 1; i >= 0 && run === undefined; i--) {
      const end = runs[i]?.[runs[i]!.length - 1];
      if (end !== undefined && end.to !== 'off' && end.to === move.from) run = runs[i];
    }
    if (run !== undefined) run.push(move);
    else runs.push([move]);
  }
  return runs;
}

const plusOne = (counts: Map<string, number>, key: string) =>
  counts.set(key, (counts.get(key) ?? 0) + 1);

/**
 * The marks for `moves` (the rest of the turn, in order) of `mover` on
 * `board` (the board now, as on screen).
 *
 * - Each run's checker is a real checker on `board`: the top one of its
 *   point, or the next one down when an earlier run left from there.
 * - Each target stacks on what is there now, minus the checkers that leave
 *   it, plus the ghosts of earlier runs that land there.
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
  // Per slot: checkers that leave it, and ghosts that land on it.
  const leaving = new Map<string, number>();
  const landing = new Map<string, number>();
  checkerRuns(moves).forEach((steps, i) => {
    const first = steps[0];
    const last = steps[steps.length - 1];
    if (first === undefined || last === undefined) return;
    const from = slotOfOrigin(first.from, mover, view);
    const fromKey = slotKey(from);
    const left = countIn(board, from, view) - (leaving.get(fromKey) ?? 0);
    const top = left > 0 ? slotTop(geo, from, left, pinnedIn(board, from, view)) : null;
    if (top !== null) cues.push({ key: `hint:${i}`, ...top });
    plusOne(leaving, fromKey);

    const to = slotOfDestination(last.to, mover, view);
    const toKey = slotKey(to);
    const stack = Math.max(
      0,
      countIn(board, to, view) - (leaving.get(toKey) ?? 0) + (landing.get(toKey) ?? 0),
    );
    const at = landingOn(geo, to, stack, pinnedIn(board, to, view), last.capture);
    plusOne(landing, toKey);
    const r = to.kind === 'tray' ? Math.min(R, slotRect(geo, to).height / 2) : R;
    targets.push({
      key: `hint:${i}`,
      x: at.x,
      y: at.y,
      r,
      ...(steps.length > 1 ? { steps: steps.length } : {}),
    });
  });
  return { select: null, targets, cues };
}

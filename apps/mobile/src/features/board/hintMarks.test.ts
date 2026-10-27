/**
 * #209: the board marks of a hint. Each checker run gets the select ring on
 * its checker and the target ring where it lands; a run of several dice
 * gets the combined target (#180), and two checkers to one point stack
 * their ghosts.
 */
import { createBoard, portes, type Move } from '@tavli/engine';
import { getTheme } from '@tavli/themes';

import { portraitLayout } from './BoardCanvas';
import { slotOfDestination, slotOfOrigin, type BoardView } from './boardModel';
import { fitBoardWithShadow, stackPosition } from './geometry';
import { hintHighlights } from './hintMarks';

const theme = getTheme('walnut-kafeneio');
const geo = fitBoardWithShadow(portraitLayout(theme, 'right'), { width: 375, height: 500 });
const view: BoardView = { viewer: 'white', direction: portes.direction };
const board = createBoard(
  { white: { points: { 13: 2, 6: 13 } }, black: { points: { 24: 15 } } },
  portes.direction,
);
const m = (from: Move['from'], to: Move['to'], die: Move['die']): Move => ({
  from,
  to,
  die,
  capture: 'none',
});
const at = (p: { x: number; y: number }) => ({ x: p.x, y: p.y });
const pointIndex = (own: number) => {
  const slot = slotOfDestination(own, 'white', view);
  if (slot.kind !== 'point') throw new Error('not a point');
  return slot;
};

describe('hintHighlights', () => {
  it('rings each checker and its target', () => {
    const marks = hintHighlights(geo, board, view, 'white', [m(13, 8, 5), m(6, 3, 3)]);
    expect(marks.select).toBeNull();
    expect(marks.cues).toHaveLength(2);
    expect(marks.targets).toHaveLength(2);
    // The top checker of 13 (two there), then the empty point 8.
    expect(at(marks.cues![0]!)).toEqual(
      at(stackPosition(geo, slotOfOrigin(13, 'white', view), 2, 1)),
    );
    expect(at(marks.targets[0]!)).toEqual(at(stackPosition(geo, pointIndex(8), 1, 0)));
    expect(marks.targets.every((t) => t.steps === undefined)).toBe(true);
  });

  it('marks a run of one checker as one combined target', () => {
    const marks = hintHighlights(geo, board, view, 'white', [m(13, 8, 5), m(8, 5, 3)]);
    expect(marks.cues).toHaveLength(1);
    expect(marks.targets).toEqual([expect.objectContaining({ steps: 2 })]);
    expect(at(marks.targets[0]!)).toEqual(at(stackPosition(geo, pointIndex(5), 1, 0)));
  });

  it('stacks two checkers that go to one point', () => {
    const marks = hintHighlights(geo, board, view, 'white', [m(13, 8, 5), m(13, 8, 5)]);
    expect(marks.targets).toHaveLength(2);
    expect(at(marks.targets[0]!)).toEqual(at(stackPosition(geo, pointIndex(8), 1, 0)));
    expect(at(marks.targets[1]!)).toEqual(at(stackPosition(geo, pointIndex(8), 2, 1)));
    // The second checker is the one left on 13.
    expect(at(marks.cues![1]!)).toEqual(
      at(stackPosition(geo, slotOfOrigin(13, 'white', view), 1, 0)),
    );
  });
});

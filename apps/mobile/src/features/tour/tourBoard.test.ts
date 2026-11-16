import { legalNextMoves, remainingDice } from '@tavli/engine';

import { moveSteps, startTourMove, wayWanted } from './tourBoard';

describe('the tour move page (#573)', () => {
  it('starts a Portes game with 4 and 2 to play', () => {
    const flow = startTourMove();
    expect(flow.phase).toBe('moving');
    expect([...remainingDice(flow)].sort()).toEqual([2, 4]);
    expect(legalNextMoves(flow).length).toBeGreaterThan(0);
  });

  it('counts a tap and a drag in any order', () => {
    expect(moveSteps([], false)).toEqual({ tapped: false, dragged: false, confirmed: false });
    expect(moveSteps(['drag', 'tap'], true)).toEqual({
      tapped: true,
      dragged: true,
      confirmed: true,
    });
  });

  it('counts a move from the move list for the step still open', () => {
    expect(moveSteps(['list'], false)).toMatchObject({ tapped: true, dragged: false });
    expect(moveSteps(['list', 'list'], false)).toMatchObject({ tapped: true, dragged: true });
    expect(moveSteps(['drag', 'list'], false)).toMatchObject({ tapped: true, dragged: true });
  });

  it('asks for the other way when the second move is made the same way', () => {
    expect(wayWanted([], 'tap')).toBeNull();
    expect(wayWanted([], 'drag')).toBeNull();
    expect(wayWanted(['tap'], 'tap')).toBe('drag');
    expect(wayWanted(['drag'], 'drag')).toBe('tap');
    expect(wayWanted(['tap'], 'drag')).toBeNull();
    expect(wayWanted(['tap'], 'list')).toBeNull();
  });
});

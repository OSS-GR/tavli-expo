import {
  applyGameAction,
  createBoard,
  createGameFlow,
  portes,
  type GameFlow,
  type Move,
} from '@tavli/engine';

import { addGroup, dropTop, undoSize, type MoveGroup } from './moveGroups';

const board = createBoard(
  { white: { points: { 13: 2, 6: 13 } }, black: { points: { 1: 15 } } },
  'contrary',
);

function rolled(dice: [2 | 3 | 5, 2 | 3 | 5]): GameFlow {
  const state = { ...portes.initialState({ startingPlayer: 'white' }), board };
  const flow = createGameFlow({ state, starter: 'white' });
  return applyGameAction(flow, { type: 'roll', player: 'white', dice });
}
const play = (flow: GameFlow, move: Move) =>
  applyGameAction(flow, { type: 'move', player: 'white', move });
const undo = (flow: GameFlow) => applyGameAction(flow, { type: 'undo', player: 'white' });
const m = (from: Move['from'], to: Move['to'], die: Move['die']): Move => ({
  from,
  to,
  die,
  capture: 'none',
});

describe('move groups (#180)', () => {
  it('takes back a combined move whole, then single moves one by one', () => {
    const start = rolled([2, 2]);
    // 13/11/9 as one group, then 6/4 alone.
    let flow = play(play(start, m(13, 11, 2)), m(11, 9, 2));
    let groups: readonly MoveGroup[] = addGroup([], flow, 2);
    flow = play(flow, m(6, 4, 2));
    // The single move is on top: one step.
    expect(undoSize(groups, flow)).toBe(1);
    groups = dropTop(groups, flow);
    flow = undo(flow);
    // Now the group is on top again: both steps.
    expect(undoSize(groups, flow)).toBe(2);
    groups = dropTop(groups, flow);
    flow = undo(undo(flow));
    expect(flow.played).toEqual([]);
    expect(groups).toEqual([]);
    // Nothing left: one undo, which the engine refuses.
    expect(undoSize(groups, flow)).toBe(1);
  });

  it('stacks two groups of a double', () => {
    let flow = play(play(rolled([2, 2]), m(13, 11, 2)), m(11, 9, 2));
    let groups = addGroup([], flow, 2);
    flow = play(play(flow, m(13, 11, 2)), m(11, 9, 2));
    groups = addGroup(groups, flow, 2);
    expect(undoSize(groups, flow)).toBe(2);
    groups = dropTop(groups, flow);
    flow = undo(undo(flow));
    expect(undoSize(groups, flow)).toBe(2);
  });

  it('forgets groups of another turn', () => {
    const flow = play(play(rolled([5, 3]), m(13, 10, 3)), m(10, 5, 5));
    const groups = addGroup([], flow, 2);
    // The same moves in a new turn (a new start state) are not the group.
    const again = play(play(rolled([5, 3]), m(13, 10, 3)), m(10, 5, 5));
    expect(undoSize(groups, again)).toBe(1);
    expect(addGroup(groups, again, 2)).toHaveLength(1);
  });

  it('never takes back more than was played', () => {
    const flow = play(rolled([5, 3]), m(13, 10, 3));
    const groups: MoveGroup[] = [{ state: flow.state, played: flow.played, size: 2 }];
    expect(undoSize(groups, flow)).toBe(1);
  });
});

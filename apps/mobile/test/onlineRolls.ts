// Online games with a set roll for White (#347), to save on an in-memory
// server with `setFlowForTest` before anyone watches the game.
import { applyMatchAction, createBoard, type Dice, type MatchFlow } from '@tavli/engine';

/**
 * The Portes match `flow` with White to move with `dice` on the start
 * position. The game had no opening roll (a set starter), so the dice are
 * White's own roll: the phone holds them back.
 */
export function whiteRolled(flow: MatchFlow, dice: Dice): MatchFlow {
  const { game } = flow;
  return {
    ...flow,
    game: {
      ...game,
      phase: 'moving',
      opening: null,
      starter: 'white',
      state: { ...game.state, toMove: 'white', dice, turnNumber: 1 },
      played: [],
      lastTurn: null,
      result: null,
    },
  };
}

/**
 * The Portes match `flow` after White rolled 6-6 with no legal move: the
 * engine passed White's turn, and Black moves with 2-1. White's checkers
 * all sit on its 7 point, and Black holds White's 1 point.
 */
export function whitePassed(flow: MatchFlow): MatchFlow {
  const board = createBoard(
    { white: { points: { 7: 15 } }, black: { points: { 24: 15 } } },
    'contrary',
  );
  const start: MatchFlow = {
    ...flow,
    game: {
      ...flow.game,
      phase: 'awaiting-roll',
      opening: null,
      starter: 'white',
      state: { ...flow.game.state, board, toMove: 'white', dice: null, turnNumber: 9 },
      played: [],
      lastTurn: null,
      result: null,
    },
  };
  const passed = applyMatchAction(start, { type: 'roll', player: 'white', dice: [6, 6] });
  const next = applyMatchAction(passed, { type: 'roll', player: 'black', dice: [2, 1] });
  return { ...next, log: flow.log };
}

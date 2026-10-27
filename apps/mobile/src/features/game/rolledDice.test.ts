import { createSeededRng, legalNextMoves, resolveRules } from '@tavli/engine';

import { createGameStore, type GameStore } from './gameStore';
import { diceWereRolled } from './rolledDice';

/** An Acey-Deucey game (a 1-2 chooses a double), White to roll its first turn. */
function aceyDeucey(): GameStore {
  const store = createGameStore({
    players: { white: 'Ann', black: 'Bob' },
    targetPoints: 1,
    rules: resolveRules('asodio.aceyDeuceyGreek'),
    rng: createSeededRng(5),
  });
  const { dispatch } = store.getState();
  dispatch({ type: 'rollOpening', player: 'white', die: 6 });
  dispatch({ type: 'rollOpening', player: 'black', die: 1 });
  return store;
}

/** Plays the first legal moves until the turn can be confirmed, then confirms. */
function playTurn(store: GameStore, player: 'white' | 'black') {
  const { dispatch } = store.getState();
  for (let next = legalNextMoves(store.getState().flow.game)[0]; next;) {
    dispatch({ type: 'move', player, move: next.moves[0]! });
    next = legalNextMoves(store.getState().flow.game)[0];
  }
  dispatch({ type: 'confirm', player });
}

describe('diceWereRolled (#177)', () => {
  it('is true for dice from a roll, also a double', () => {
    const store = aceyDeucey();
    // The opening dice came from the opening roll, not a roll.
    expect(diceWereRolled(store.getState().flow)).toBe(false);
    playTurn(store, 'white');
    expect(diceWereRolled(store.getState().flow)).toBe(false); // no dice yet
    store.getState().dispatch({ type: 'roll', player: 'black', dice: [5, 5] });
    expect(diceWereRolled(store.getState().flow)).toBe(true);
    // Moves do not change it.
    const move = legalNextMoves(store.getState().flow.game)[0]!.moves[0]!;
    store.getState().dispatch({ type: 'move', player: 'black', move });
    expect(diceWereRolled(store.getState().flow)).toBe(true);
  });

  it('is false for a double chosen after a 1-2', () => {
    const store = aceyDeucey();
    playTurn(store, 'white');
    const { dispatch } = store.getState();
    dispatch({ type: 'roll', player: 'black', dice: [1, 2] });
    expect(diceWereRolled(store.getState().flow)).toBe(true);
    playTurn(store, 'black');
    expect(store.getState().flow.game.phase).toBe('awaiting-answer');
    dispatch({ type: 'answer', player: 'black', choice: '4' });
    expect(store.getState().flow.game.state.dice).toEqual([4, 4]);
    expect(diceWereRolled(store.getState().flow)).toBe(false);
  });
});

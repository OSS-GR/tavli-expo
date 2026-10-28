import { createSeededRng, rollDie, type GameFlow } from '@tavli/engine';

import { createGameStore, diceView, turnView } from './gameStore';
import { nextOpeningRoller, openingDice, openingStatus } from './opening';

const players = { white: 'Ann', black: 'Bob' };

function newStore(seed = 1) {
  return createGameStore({ players, targetPoints: 3, rng: createSeededRng(seed) });
}

/** Rolls opening dice until someone starts. */
function finishOpening(store: ReturnType<typeof newStore>) {
  for (let i = 0; i < 20 && store.getState().flow.game.phase === 'opening-roll'; i++) {
    const roller = nextOpeningRoller(store.getState().flow.game);
    if (roller === null) throw new Error('no roller');
    expect(store.getState().dispatch({ type: 'rollOpening', player: roller })).toBe(true);
  }
}

describe('createGameStore', () => {
  it('starts a Portes match to 3 with an opening roll', () => {
    const { flow } = newStore().getState();
    expect(flow.match.targetPoints).toBe(3);
    expect(flow.match.players).toEqual(players);
    expect(flow.game.phase).toBe('opening-roll');
    expect(flow.game.state.variant).toBe('portes');
  });

  it('rolls with the injected Rng, never in the UI', () => {
    const store = newStore(42);
    store.getState().dispatch({ type: 'rollOpening', player: 'white' });
    const expected = rollDie(createSeededRng(42));
    expect(store.getState().flow.game.opening?.white).toBe(expected);
  });

  it('starts the higher die and plays both opening dice', () => {
    const store = newStore(3);
    finishOpening(store);
    const { game } = store.getState().flow;
    expect(game.phase).toBe('moving');
    const { white, black } = game.opening!;
    expect(white).not.toBe(black);
    expect(game.starter).toBe(white! > black! ? 'white' : 'black');
    expect([...game.state.dice!].sort()).toEqual([white, black].sort());
  });

  it('names each match with a key of its own: per store and per rematch (#216)', () => {
    const store = newStore();
    const first = store.getState().matchKey;
    // Moves keep the key: it names the match, not the position.
    finishOpening(store);
    expect(store.getState().matchKey).toBe(first);
    // Another store (a new match, or a saved one loaded again) gets a new key.
    const other = newStore().getState().matchKey;
    expect(other).not.toBe(first);
    store.getState().dispatch({ type: 'resignMatch', player: 'black' });
    expect(store.getState().matchKey).toBe(first);
    store.getState().rematch();
    const rematch = store.getState().matchKey;
    expect([first, other]).not.toContain(rematch);
  });

  it('keeps the flow and reports an action the engine refuses', () => {
    const store = newStore();
    const before = store.getState().flow;
    expect(store.getState().dispatch({ type: 'roll', player: 'white' })).toBe(false);
    expect(store.getState().flow).toBe(before);
    expect(store.getState().lastError).toMatch(/phase/);
  });

  it('keeps a played move, a new match and a rematch when analytics throws', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const boom = () => {
      throw new Error('analytics down');
    };
    const store = createGameStore({
      players,
      targetPoints: 1,
      rng: createSeededRng(3),
      analytics: { gameStarted: boom, actionApplied: boom, gameAbandoned: boom },
    });

    const before = store.getState().flow;
    expect(store.getState().dispatch({ type: 'rollOpening', player: 'white' })).toBe(true);
    expect(store.getState().flow).not.toBe(before);
    expect(store.getState().lastError).toBeNull();

    // A refused action still reports the engine's error, not analytics'.
    expect(store.getState().dispatch({ type: 'roll', player: 'white' })).toBe(false);
    expect(store.getState().lastError).toMatch(/phase/);

    store.getState().dispatch({ type: 'resignMatch', player: 'black' });
    expect(store.getState().flow.match.status).toBe('finished');
    const finished = store.getState().flow;
    expect(() => store.getState().rematch()).not.toThrow();
    expect(store.getState().flow).not.toBe(finished);
    expect(store.getState().flow.match.status).not.toBe('finished');

    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe('turnView', () => {
  it('shows no dice before a roll', () => {
    const view = turnView(newStore().getState().flow);
    expect(view.dice).toEqual([]);
    expect(view.legal).toEqual([]);
  });

  it('shows the dice of the turn and the legal moves', () => {
    const store = newStore(3);
    finishOpening(store);
    const view = turnView(store.getState().flow);
    expect(view.dice).toHaveLength(2);
    expect(view.dice.every((d) => !d.used)).toBe(true);
    expect(view.legal.length).toBeGreaterThan(0);
    expect(view.canConfirm).toBe(false);
    expect(view.canUndo).toBe(false);
  });

  it('fades the die a move used', () => {
    const store = newStore(3);
    finishOpening(store);
    const { game } = store.getState().flow;
    const move = turnView(store.getState().flow).legal[0]!.moves[0]!;
    store.getState().dispatch({ type: 'move', player: game.state.toMove, move });
    const view = turnView(store.getState().flow);
    expect(view.dice.filter((d) => d.used).map((d) => d.value)).toEqual([move.die]);
    expect(view.canUndo).toBe(true);
  });
});

describe('diceView', () => {
  it('marks used dice of a double one by one', () => {
    expect(diceView([4, 4], [4, 4]).map((d) => d.used)).toEqual([true, true, false, false]);
  });

  it('marks the played die of a plain roll', () => {
    expect(diceView([6, 3], [3])).toEqual([
      { value: 6, used: true },
      { value: 3, used: false },
    ]);
  });
});

describe('opening status', () => {
  it('shows the dice as players roll, then the result', () => {
    const store = newStore(3);
    const game = (): GameFlow => store.getState().flow.game;
    expect(openingStatus(game())).toEqual({ kind: 'rolling', white: null, black: null, round: 0 });
    expect(nextOpeningRoller(game())).toBe('white');
    store.getState().dispatch({ type: 'rollOpening', player: 'white' });
    expect(nextOpeningRoller(game())).toBe('black');
    finishOpening(store);
    const status = openingStatus(game());
    expect(status?.kind).toBe('decided');
    expect(nextOpeningRoller(game())).toBeNull();
  });

  it('keeps a tie on the card until the next roll, then starts a new round (#176)', () => {
    const store = newStore();
    const game = (): GameFlow => store.getState().flow.game;
    store.getState().dispatch({ type: 'rollOpening', player: 'white', die: 4 });
    expect(openingStatus(game())).toEqual({ kind: 'rolling', white: 4, black: null, round: 0 });
    store.getState().dispatch({ type: 'rollOpening', player: 'black', die: 4 });
    const tie = openingStatus(game());
    expect(tie).toEqual({ kind: 'tie', value: 4, round: 0 });
    // Both dice still show the tie.
    expect(openingDice(tie!)).toEqual({ white: 4, black: 4 });
    expect(nextOpeningRoller(game())).toBe('white');

    // The next roll starts round 1: the other die is blank again.
    store.getState().dispatch({ type: 'rollOpening', player: 'white', die: 2 });
    const next = openingStatus(game());
    expect(next).toEqual({ kind: 'rolling', white: 2, black: null, round: 1 });
    expect(openingDice(next!)).toEqual({ white: 2, black: null });

    // A second tie is round 1.
    store.getState().dispatch({ type: 'rollOpening', player: 'black', die: 2 });
    expect(openingStatus(game())).toEqual({ kind: 'tie', value: 2, round: 1 });
    store.getState().dispatch({ type: 'rollOpening', player: 'white', die: 6 });
    store.getState().dispatch({ type: 'rollOpening', player: 'black', die: 3 });
    expect(openingStatus(game())).toEqual({
      kind: 'decided',
      white: 6,
      black: 3,
      starter: 'white',
      round: 2,
    });
  });

  it('is gone once the first turn is played, and for a game with a set starter', () => {
    const store = createGameStore({
      players,
      rng: createSeededRng(1),
    });
    store.getState().dispatch({ type: 'rollOpening', player: 'white', die: 6 });
    store.getState().dispatch({ type: 'rollOpening', player: 'black', die: 1 });
    // White plays 6-1: 13/7 8/7.
    store.getState().dispatch({ type: 'move', player: 'white', move: { from: 13, to: 7, die: 6 } });
    store.getState().dispatch({ type: 'move', player: 'white', move: { from: 8, to: 7, die: 1 } });
    store.getState().dispatch({ type: 'confirm', player: 'white' });
    expect(openingStatus(store.getState().flow.game)).toBeNull();
  });
});

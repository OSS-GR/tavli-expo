import { createSeededRng, type MatchFlow } from '@tavli/engine';

import { flowEvents, isHumanWin, moveEvent, storeEvents } from './gameFeedback';
import { createGameStore } from './gameStore';

function newStore() {
  return createGameStore({
    players: { white: 'Ann', black: 'Bob' },
    targetPoints: 1,
    rng: createSeededRng(5),
  });
}

/** Runs `actions` on the store and returns the events between the flows. */
function eventsOf(store: ReturnType<typeof newStore>, act: () => void) {
  const before = store.getState().flow;
  act();
  return flowEvents(before, store.getState().flow);
}

/** White starts with 6-1. */
function opened() {
  const store = newStore();
  const { dispatch } = store.getState();
  dispatch({ type: 'rollOpening', player: 'white', die: 6 });
  dispatch({ type: 'rollOpening', player: 'black', die: 1 });
  return store;
}

/** The flow with one more move in its log (to test hit and bear-off without a long game). */
function withMove(flow: MatchFlow, move: Record<string, unknown>): MatchFlow {
  return { ...flow, log: [...flow.log, { type: 'move', player: 'white', move } as never] };
}

describe('flowEvents', () => {
  it('plays a dice roll for each opening die and each roll', () => {
    const store = newStore();
    const { dispatch } = store.getState();
    expect(
      eventsOf(store, () => dispatch({ type: 'rollOpening', player: 'white', die: 6 })),
    ).toEqual(['diceRoll']);
    expect(
      eventsOf(store, () => dispatch({ type: 'rollOpening', player: 'black', die: 1 })),
    ).toEqual(['diceRoll']);
  });

  it('plays a checker place for each plain move, and turn start for the next player', () => {
    const store = opened();
    const { dispatch } = store.getState();
    expect(
      eventsOf(store, () =>
        dispatch({ type: 'move', player: 'white', move: { from: 13, to: 7, die: 6 } }),
      ),
    ).toEqual(['checkerPlace']);
    expect(
      eventsOf(store, () => {
        dispatch({ type: 'move', player: 'white', move: { from: 8, to: 7, die: 1 } });
        dispatch({ type: 'confirm', player: 'white' });
      }),
    ).toEqual(['checkerPlace', 'turnStart']);
    expect(eventsOf(store, () => dispatch({ type: 'roll', player: 'black' }))).toContain(
      'diceRoll',
    );
  });

  it('plays a hit for a hit or a pin, and bear-off for a checker borne off', () => {
    const flow = opened().getState().flow;
    expect(flowEvents(flow, withMove(flow, { from: 6, to: 2, die: 4, capture: 'hit' }))).toEqual([
      'checkerHit',
    ]);
    expect(flowEvents(flow, withMove(flow, { from: 6, to: 2, die: 4, capture: 'pin' }))).toEqual([
      'checkerHit',
    ]);
    expect(
      flowEvents(flow, withMove(flow, { from: 3, to: 'off', die: 3, capture: 'none' })),
    ).toEqual(['bearOff']);
  });

  it('plays a match win when the match ends, else a game win', () => {
    const store = createGameStore({
      players: { white: 'Ann', black: 'Bob' },
      targetPoints: 5,
      rng: createSeededRng(5),
    });
    const { dispatch } = store.getState();
    dispatch({ type: 'rollOpening', player: 'white', die: 6 });
    dispatch({ type: 'rollOpening', player: 'black', die: 1 });
    expect(eventsOf(store, () => dispatch({ type: 'resign', player: 'white' }))).toEqual([
      'gameWin',
    ]);
    // The winner starts the next game: their turn begins.
    expect(eventsOf(store, () => dispatch({ type: 'nextGame' }))).toEqual(['turnStart']);
    expect(eventsOf(store, () => dispatch({ type: 'resignMatch', player: 'black' }))).toEqual([
      'matchWin',
    ]);
  });

  it('plays no win jingle when the bot wins', () => {
    const store = createGameStore({
      players: { white: 'Ann', black: 'Bot' },
      targetPoints: 5,
      rng: createSeededRng(5),
    });
    const { dispatch } = store.getState();
    dispatch({ type: 'rollOpening', player: 'white', die: 6 });
    dispatch({ type: 'rollOpening', player: 'black', die: 1 });
    const humans = ['white'] as const;
    // White (the person) resigns: black (the bot) wins the game.
    let before = store.getState().flow;
    dispatch({ type: 'resign', player: 'white' });
    expect(flowEvents(before, store.getState().flow, humans)).toEqual([]);
    dispatch({ type: 'nextGame' });
    // Black (the bot) resigns the match: the person wins it.
    before = store.getState().flow;
    dispatch({ type: 'resignMatch', player: 'black' });
    expect(flowEvents(before, store.getState().flow, humans)).toEqual(['matchWin']);
  });

  it('plays nothing for the same flow, an undo, or a new match', () => {
    const store = opened();
    const { dispatch, rematch } = store.getState();
    const flow = store.getState().flow;
    expect(flowEvents(flow, flow)).toEqual([]);
    dispatch({ type: 'move', player: 'white', move: { from: 13, to: 7, die: 6 } });
    expect(eventsOf(store, () => dispatch({ type: 'undo', player: 'white' }))).toEqual([]);
    dispatch({ type: 'resign', player: 'white' });
    expect(eventsOf(store, () => rematch())).toEqual([]);
  });

  it('plays the first move on a flow with an empty log (an online view, #271)', () => {
    const view: MatchFlow = { ...opened().getState().flow, log: [] };
    expect(flowEvents(view, withMove(view, { from: 13, to: 7, die: 6 }))).toEqual(['checkerPlace']);
  });
});

describe('moveEvent', () => {
  it('names the sound of one move', () => {
    expect(moveEvent({ capture: 'none', to: 7 })).toBe('checkerPlace');
    expect(moveEvent({ capture: 'hit', to: 7 })).toBe('checkerHit');
    expect(moveEvent({ capture: 'pin', to: 7 })).toBe('checkerHit');
    expect(moveEvent({ capture: 'none', to: 'off' })).toBe('bearOff');
  });
});

describe('isHumanWin', () => {
  it('is true only when a person wins (the jingle and the celebration)', () => {
    expect(isHumanWin('black')).toBe(true);
    expect(isHumanWin('white', ['white'])).toBe(true);
    expect(isHumanWin('black', ['white'])).toBe(false);
    expect(isHumanWin(null)).toBe(false);
    expect(isHumanWin(undefined)).toBe(false);
  });
});

describe('storeEvents', () => {
  it('plays an invalid move when the engine refuses an action', () => {
    const store = opened();
    const before = store.getState();
    expect(
      store
        .getState()
        .dispatch({ type: 'move', player: 'white', move: { from: 13, to: 1, die: 6 } }),
    ).toBe(false);
    expect(storeEvents(before, store.getState())).toEqual(['invalidMove']);
  });

  it('plays the flow events of a good action', () => {
    const store = opened();
    const before = store.getState();
    store.getState().dispatch({ type: 'move', player: 'white', move: { from: 13, to: 7, die: 6 } });
    expect(storeEvents(before, store.getState())).toEqual(['checkerPlace']);
  });
});

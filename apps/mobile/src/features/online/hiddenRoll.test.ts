// Your own online roll, held back until you roll (#347). The store runs
// over the in-memory server (`@tavli/online`), one store per player; the
// server answers on later microtasks and runs no timers.
import type { GameTransport, OnlineGameView } from '@tavli/contracts';
import { createSeededRng, type MatchFlow } from '@tavli/engine';
import { createMemoryGameServer } from '@tavli/online';
import { pickTurn } from '@tavli/online/testing';

import { newRoll, revealRoll, wasRevealed } from './hiddenRoll';
import { createOnlineStore, viewFlow, type OnlineStore } from './onlineStore';

import { whitePassed, whiteRolled } from '../../../test/onlineRolls';

const ALICE = 'alice';
const BOB = 'bob';
const PLAYERS = { white: ALICE, black: BOB };

const open: OnlineStore[] = [];
afterEach(() => {
  for (const store of open.splice(0)) store.getState().dispose();
});

/** Lets the pending microtasks run (the server answers on later microtasks). */
async function flush(): Promise<void> {
  for (let i = 0; i < 20; i++) await Promise.resolve();
}

/**
 * A Portes game on a new in-memory server. `prepare` changes the game
 * before anyone watches it. `calls` lists the calls of every store.
 */
function setup(prepare?: (flow: MatchFlow) => MatchFlow) {
  const server = createMemoryGameServer({ rng: createSeededRng(5), now: () => 0 });
  const gameId = server.createGame(ALICE, PLAYERS, 'portes', 3, null);
  if (prepare) server.setFlowForTest(gameId, prepare(viewFlow(server.getGame(gameId)!)));
  const calls: string[] = [];
  const storeFor = (me: string, hideRolls = true) => {
    const inner = server.transportFor(me);
    const transport: GameTransport = {
      ...inner,
      sendTurn: (request) => {
        calls.push('sendTurn');
        return inner.sendTurn(request);
      },
      sendAnswer: (request) => {
        calls.push('sendAnswer');
        return inner.sendAnswer(request);
      },
      resign: (id) => {
        calls.push('resign');
        return inner.resign(id);
      },
    };
    const store = createOnlineStore({ transport, gameId, me, hideRolls });
    open.push(store);
    return store;
  };
  return { server, gameId, calls, storeFor };
}

function viewOf(store: OnlineStore): OnlineGameView {
  const { view } = store.getState();
  if (view === null) throw new Error('no view yet');
  return view;
}

/** Plays and sends a whole turn of the store's side (its roll must show). */
async function playTurn(store: OnlineStore, seed = 1): Promise<void> {
  const { side, flow, dispatch } = store.getState();
  if (side === null || flow === null) throw new Error('not loaded');
  for (const move of pickTurn(flow.game, createSeededRng(seed))) {
    expect(dispatch({ type: 'move', player: side, move })).toBe(true);
  }
  expect(store.getState().dispatch({ type: 'confirm', player: side })).toBe(true);
  await flush();
}

describe('the online store holds back your roll (#347)', () => {
  it('waits for Roll, then shows the server’s dice without a call', async () => {
    const { storeFor, calls } = setup((flow) => whiteRolled(flow, [5, 3]));
    const alice = storeFor(ALICE);
    await flush();
    const view = viewOf(alice);
    // The server rolled 5-3 for you; the board waits for your roll.
    expect(view.game.state.dice).toEqual([5, 3]);
    expect(alice.getState().rollWaits).toBe(true);
    const hidden = alice.getState().flow!;
    expect(hidden.game.phase).toBe('awaiting-roll');
    expect(hidden.game.state.toMove).toBe('white');
    expect(hidden.game.state.dice).toBeNull();
    expect(hidden.game.state.board).toEqual(view.game.state.board);

    // Nothing moves or goes to the server before the roll. The phone
    // never picks the dice.
    const { dispatch } = alice.getState();
    expect(dispatch({ type: 'move', player: 'white', move: { from: 13, to: 8, die: 5 } })).toBe(
      false,
    );
    expect(dispatch({ type: 'confirm', player: 'white' })).toBe(false);
    expect(dispatch({ type: 'roll', player: 'white', dice: [6, 6] })).toBe(false);
    expect(dispatch({ type: 'roll', player: 'black' })).toBe(false);
    expect(alice.getState().rollWaits).toBe(true);

    // Roll shows the server's dice, with the roll in the log (a local roll).
    expect(dispatch({ type: 'roll', player: 'white' })).toBe(true);
    const shown = alice.getState().flow!;
    expect(alice.getState().rollWaits).toBe(false);
    expect(shown.game).toEqual(view.game);
    expect(shown.log).toEqual([{ type: 'roll', player: 'white', dice: [5, 3] }]);
    expect(calls).toEqual([]);
    // A second roll is the server's again.
    expect(alice.getState().dispatch({ type: 'roll', player: 'white' })).toBe(false);

    // The turn plays and goes as before.
    await playTurn(alice);
    expect(calls).toEqual(['sendTurn']);
    expect(viewOf(alice).game.lastTurn?.player).toBe('white');
    expect(viewOf(alice).waitingFor).toBe('black');
  });

  it('never holds back the other player’s roll or the opening dice', async () => {
    const { storeFor } = setup();
    const alice = storeFor(ALICE);
    const bob = storeFor(BOB);
    await flush();
    const view = viewOf(alice);
    // The starter plays the opening dice at once: no roll is held back.
    expect(view.game.lastTurn).toBeNull();
    expect(view.game.opening).not.toBeNull();
    expect(alice.getState().rollWaits).toBe(false);
    expect(bob.getState().rollWaits).toBe(false);
    expect(alice.getState().flow!.game).toEqual(view.game);
    expect(bob.getState().flow!.game).toEqual(view.game);

    // After the starter's turn, the other player's roll waits on their
    // phone, and shows at once on the starter's phone.
    const [starter, other] = view.waitingFor === 'white' ? [alice, bob] : [bob, alice];
    await playTurn(starter);
    expect(other.getState().rollWaits).toBe(true);
    expect(other.getState().flow!.game.state.dice).toBeNull();
    expect(starter.getState().rollWaits).toBe(false);
    expect(starter.getState().flow!.game.state.dice).toEqual(viewOf(starter).game.state.dice);
  });

  it('keeps a shown roll shown when the game opens again', async () => {
    const { storeFor } = setup((flow) => whiteRolled(flow, [4, 2]));
    const first = storeFor(ALICE);
    await flush();
    expect(first.getState().dispatch({ type: 'roll', player: 'white' })).toBe(true);
    first.getState().dispose();

    const again = storeFor(ALICE);
    await flush();
    expect(again.getState().rollWaits).toBe(false);
    expect(again.getState().flow!.game.state.dice).toEqual([4, 2]);
    expect(again.getState().flow!.log).toEqual([{ type: 'roll', player: 'white', dice: [4, 2] }]);
  });

  it('does not hold back a roll with no legal move: the pass shows as before', async () => {
    const { storeFor } = setup(whitePassed);
    const alice = storeFor(ALICE);
    await flush();
    const view = viewOf(alice);
    // The server passed your 6-6 and waits for the other player.
    expect(view.waitingFor).toBe('black');
    expect(view.game.lastTurn).toEqual({ player: 'white', dice: [6, 6], moves: [] });
    expect(alice.getState().rollWaits).toBe(false);
    expect(alice.getState().flow!.game).toEqual(view.game);
    expect(alice.getState().dispatch({ type: 'roll', player: 'white' })).toBe(false);
  });

  it('ignores a move or confirm before the roll, with no refusal', async () => {
    const { storeFor } = setup((flow) => whiteRolled(flow, [5, 3]));
    const alice = storeFor(ALICE);
    await flush();
    const { dispatch } = alice.getState();
    const refusals = alice.getState().refusals;
    expect(dispatch({ type: 'move', player: 'white', move: { from: 13, to: 8, die: 5 } })).toBe(
      false,
    );
    expect(dispatch({ type: 'undo', player: 'white' })).toBe(false);
    expect(dispatch({ type: 'confirm', player: 'white' })).toBe(false);
    // No "invalid move" feedback: the board reads `refusals`.
    expect(alice.getState().refusals).toBe(refusals);
    expect(alice.getState().rollWaits).toBe(true);
  });

  it('shows the roll of the newest view', async () => {
    const { server, gameId } = setup((flow) => whiteRolled(flow, [5, 3]));
    const first = server.getGame(gameId)!;
    // A transport that hands the views over by hand.
    let send: (view: OnlineGameView) => void = () => undefined;
    const transport: GameTransport = {
      ...server.transportFor(ALICE),
      subscribe: (_id, onView) => {
        send = onView;
        return () => undefined;
      },
    };
    const alice = createOnlineStore({ transport, gameId, me: ALICE, hideRolls: true });
    open.push(alice);
    send(first);
    expect(alice.getState().rollWaits).toBe(true);
    // A newer view with another roll replaces the waiting one.
    const next = whiteRolled(viewFlow(first), [6, 1]);
    send({ ...first, version: first.version + 1, game: next.game });
    expect(alice.getState().rollWaits).toBe(true);
    expect(alice.getState().dispatch({ type: 'roll', player: 'white' })).toBe(true);
    expect(alice.getState().flow!.log).toEqual([{ type: 'roll', player: 'white', dice: [6, 1] }]);
    expect(alice.getState().flow!.game.state.dice).toEqual([6, 1]);
  });

  it('plays at once without `hideRolls` (the online bot)', async () => {
    const { storeFor } = setup((flow) => whiteRolled(flow, [5, 3]));
    const alice = storeFor(ALICE, false);
    await flush();
    expect(alice.getState().rollWaits).toBe(false);
    expect(alice.getState().flow!.game.state.dice).toEqual([5, 3]);
    expect(alice.getState().dispatch({ type: 'roll', player: 'white' })).toBe(false);
  });
});

describe('newRoll', () => {
  const server = createMemoryGameServer({ rng: createSeededRng(5), now: () => 0 });
  const gameId = server.createGame(ALICE, PLAYERS, 'portes', 3, null);
  const base = server.getGame(gameId)!;
  const flow = whiteRolled(viewFlow(base), [5, 3]);
  const yours: OnlineGameView = { ...base, game: flow.game, waitingFor: 'white' };

  it('names your roll by the view that brought it', () => {
    expect(newRoll(yours, 'white')).toEqual({
      player: 'white',
      dice: [5, 3],
      version: yours.version,
    });
    expect(newRoll(yours, 'black')).toBeNull();
  });

  it('is null for a question, a finished match and a chosen double', () => {
    expect(
      newRoll({ ...yours, prompt: { player: 'white', kind: 'x', choices: [] } }, 'white'),
    ).toBeNull();
    expect(newRoll({ ...yours, status: 'finished' }, 'white')).toBeNull();
    const chosen = {
      ...yours.game,
      state: { ...yours.game.state, variantData: { chosenDouble: 4 } },
    };
    expect(newRoll({ ...yours, game: chosen }, 'white')).toBeNull();
  });

  it('is null for a pass and for the opening dice', () => {
    const passed = whitePassed(viewFlow(base));
    expect(newRoll({ ...base, game: passed.game, waitingFor: 'black' }, 'white')).toBeNull();
    // The starter plays the opening dice: nobody rolled them this turn.
    const opening = base.game;
    expect(opening.lastTurn).toBeNull();
    expect(opening.opening).not.toBeNull();
    const starter = opening.state.toMove;
    expect(newRoll({ ...base, waitingFor: starter }, starter)).toBeNull();
  });

  it('remembers every roll shown per game', () => {
    const roll = newRoll(yours, 'white')!;
    expect(wasRevealed('other-game', roll)).toBe(false);
    revealRoll('other-game', roll);
    revealRoll('other-game', { ...roll, version: roll.version + 2 });
    expect(wasRevealed('other-game', roll)).toBe(true);
    expect(wasRevealed('other-game', { ...roll, version: roll.version + 2 })).toBe(true);
    expect(wasRevealed('other-game', { ...roll, version: roll.version + 1 })).toBe(false);
  });
});

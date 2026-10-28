// The online match store over the in-memory server (`@tavli/online`): two
// stores, one per player, run the real server model. The server answers
// on later microtasks and runs no timers; time moves only with `wait`.
import {
  ONLINE_GAME_CHOICES,
  TURN_TIME_MS,
  type GameTransport,
  type OnlineGameChoice,
  type OnlineGameView,
} from '@tavli/contracts';
import { createSeededRng, type MatchAction, type MoveInput, type Rng } from '@tavli/engine';
import { createMemoryGameServer } from '@tavli/online';
import { motherPin, pickChoice, pickTurn } from '@tavli/online/testing';

import { createOnlineStore, viewFlow, type OnlineStore } from './onlineStore';
import { timeLeft } from './timeLeft';

const ALICE = 'alice';
const BOB = 'bob';
const PLAYERS = { white: ALICE, black: BOB };
const START = Date.UTC(2026, 9, 28, 12, 0, 0);
const LIVE = TURN_TIME_MS.live;

const open: OnlineStore[] = [];
afterEach(() => {
  for (const store of open.splice(0)) store.getState().dispose();
});

/** A server on a clock that the test moves by hand, with one game. */
function setup(choice: OnlineGameChoice = 'portes', seed = 1, targetPoints = 3) {
  let clock = START;
  const server = createMemoryGameServer({ rng: createSeededRng(seed), now: () => clock });
  const gameId = server.createGame(ALICE, PLAYERS, choice, targetPoints, 'live');
  return {
    server,
    gameId,
    /** Moves the server clock. */
    wait: (ms: number) => {
      clock += ms;
    },
    /** A store for `me`, over `transport` (default: the server's transport for `me`). */
    storeFor: (me: string, transport: GameTransport = server.transportFor(me)) => {
      const store = createOnlineStore({ transport, gameId, me, now: () => clock });
      open.push(store);
      return store;
    },
  };
}

/** Lets the pending microtasks run (the server answers on later microtasks). */
async function flush(): Promise<void> {
  for (let i = 0; i < 20; i++) await Promise.resolve();
}

function viewOf(store: OnlineStore): OnlineGameView {
  const { view } = store.getState();
  if (view === null) throw new Error('no view yet');
  return view;
}

/** The store whose turn it is, and the other one. */
function turnOrder(a: OnlineStore, b: OnlineStore): [OnlineStore, OnlineStore] {
  return a.getState().side === viewOf(a).waitingFor ? [a, b] : [b, a];
}

/** Plays `moves` on the phone, one `move` action each. */
function play(store: OnlineStore, moves: readonly MoveInput[]): void {
  const { side } = store.getState();
  if (side === null) throw new Error('not a player');
  for (const move of moves) {
    expect(store.getState().dispatch({ type: 'move', player: side, move })).toBe(true);
  }
}

function confirm(store: OnlineStore): boolean {
  const { side } = store.getState();
  if (side === null) throw new Error('not a player');
  return store.getState().dispatch({ type: 'confirm', player: side });
}

/** A transport that records its calls and can fail the next call like a network. */
function spy(inner: GameTransport) {
  const calls: string[] = [];
  let offline = false;
  const send = <T>(name: string, run: () => Promise<T>): Promise<T> => {
    calls.push(name);
    return offline ? Promise.reject(new Error('network request failed')) : run();
  };
  const transport: GameTransport = {
    subscribe(gameId, onView, onError) {
      calls.push('subscribe');
      const stop = inner.subscribe(gameId, onView, onError);
      return () => {
        calls.push('unsubscribe');
        stop();
      };
    },
    sendTurn: (request) => send('sendTurn', () => inner.sendTurn(request)),
    sendAnswer: (request) => send('sendAnswer', () => inner.sendAnswer(request)),
    resign: (gameId) => send('resign', () => inner.resign(gameId)),
    listMyGames: (request) => send('listMyGames', () => inner.listMyGames(request)),
    watchMyGames: (request, onList, onError) => inner.watchMyGames(request, onList, onError),
  };
  return {
    transport,
    calls,
    setOffline: (value: boolean) => {
      offline = value;
    },
  };
}

describe('createOnlineStore', () => {
  it('loads the game and finds your side', async () => {
    const { storeFor } = setup();
    const alice = storeFor(ALICE);
    expect(alice.getState().flow).toBeNull();
    expect(alice.getState().dispatch({ type: 'confirm', player: 'white' })).toBe(false);
    await flush();
    const view = viewOf(alice);
    expect(view.version).toBe(1);
    expect(alice.getState().side).toBe('white');
    expect(alice.getState().flow).toEqual(viewFlow(view));
    expect(alice.getState().flow?.log).toEqual([]);
    expect(alice.getState().matchKey).toMatch(/^o\d+$/);
    expect(alice.getState().clockOffset).toBe(0);
  });

  it('sends a full Portes turn, and the other store gets it', async () => {
    const { server, gameId, storeFor } = setup();
    const a = storeFor(ALICE);
    const b = storeFor(BOB);
    await flush();
    const [mover, other] = turnOrder(a, b);
    const moves = pickTurn(viewOf(mover).game, createSeededRng(7));

    play(mover, moves);
    expect(mover.getState().flow?.game.phase).toBe('awaiting-confirm');
    // Moves stay on the phone until Confirm.
    expect(server.getGame(gameId)?.version).toBe(1);

    expect(confirm(mover)).toBe(true);
    expect(mover.getState().sending).toBe(true);
    await flush();

    expect(mover.getState().sending).toBe(false);
    for (const store of [mover, other]) {
      expect(viewOf(store).version).toBe(2);
      expect(store.getState().flow?.game.lastTurn?.moves).toEqual(moves);
    }
    // The server rolled for the next player.
    expect(viewOf(other).waitingFor).toBe(other.getState().side);
    expect(other.getState().flow?.game.phase).toBe('moving');
  });

  it('undoes on the phone before Confirm', async () => {
    const { server, gameId, storeFor } = setup();
    const spied = spy(server.transportFor(ALICE));
    const a = storeFor(ALICE, spied.transport);
    const b = storeFor(BOB);
    await flush();
    const [mover] = turnOrder(a, b);
    const moves = pickTurn(viewOf(mover).game, createSeededRng(3));
    const side = mover.getState().side ?? 'white';

    play(mover, moves.slice(0, 1));
    expect(mover.getState().dispatch({ type: 'undo', player: side })).toBe(true);
    expect(mover.getState().flow?.game.played).toEqual([]);
    expect(mover.getState().flow?.game).toEqual(viewOf(mover).game);
    // Nothing to undo now: the engine refuses.
    expect(mover.getState().dispatch({ type: 'undo', player: side })).toBe(false);
    expect(spied.calls).toEqual(['subscribe']);

    play(mover, moves);
    expect(confirm(mover)).toBe(true);
    await flush();
    expect(server.getGame(gameId)?.game.lastTurn?.moves).toEqual(moves);
  });

  it('lets only the engine judge a move', async () => {
    const { storeFor } = setup();
    const a = storeFor(ALICE);
    const b = storeFor(BOB);
    await flush();
    const [mover] = turnOrder(a, b);
    const side = mover.getState().side ?? 'white';
    const before = mover.getState().flow;
    const bad = mover.getState().dispatch({
      type: 'move',
      player: side,
      move: { from: 1, to: 'off', die: 6 },
    });
    expect(bad).toBe(false);
    expect(mover.getState().lastError).toMatch(/not a legal move/);
    expect(mover.getState().flow).toBe(before);
    // A turn that is not complete cannot be confirmed.
    play(mover, pickTurn(viewOf(mover).game, createSeededRng(1)).slice(0, 1));
    expect(confirm(mover)).toBe(false);
    expect(mover.getState().sending).toBe(false);
  });

  it('refuses moves on the other player turn, and for the other side', async () => {
    const { storeFor } = setup();
    const a = storeFor(ALICE);
    const b = storeFor(BOB);
    await flush();
    const [mover, waiter] = turnOrder(a, b);
    const moves = pickTurn(viewOf(mover).game, createSeededRng(2));
    const first = moves[0] as MoveInput;
    // The waiting phone cannot play the mover's checkers.
    const moverSide = mover.getState().side ?? 'white';
    expect(waiter.getState().dispatch({ type: 'move', player: moverSide, move: first })).toBe(
      false,
    );
    const waiterSide = waiter.getState().side ?? 'black';
    expect(waiter.getState().dispatch({ type: 'move', player: waiterSide, move: first })).toBe(
      false,
    );
    expect(waiter.getState().lastError).toMatch(/not your turn/);
    expect(waiter.getState().flow?.game.played).toEqual([]);
  });

  it('refuses the steps the server does by itself, with no call', async () => {
    const { server, storeFor } = setup();
    const spied = spy(server.transportFor(ALICE));
    const alice = storeFor(ALICE, spied.transport);
    await flush();
    const actions: MatchAction[] = [
      { type: 'roll', player: 'white' },
      { type: 'rollOpening', player: 'white' },
      { type: 'nextGame' },
      { type: 'chooseStarter', player: 'white' },
      { type: 'timeout', player: 'white' },
    ];
    for (const action of actions) {
      expect(alice.getState().dispatch(action)).toBe(false);
      expect(alice.getState().lastError).toMatch(/by itself/);
    }
    expect(spied.calls).toEqual(['subscribe']);
  });

  it('refuses every action while a call is on its way', async () => {
    const { storeFor } = setup();
    const a = storeFor(ALICE);
    const b = storeFor(BOB);
    await flush();
    const [mover] = turnOrder(a, b);
    const side = mover.getState().side ?? 'white';
    play(mover, pickTurn(viewOf(mover).game, createSeededRng(4)));
    expect(confirm(mover)).toBe(true);
    expect(mover.getState().dispatch({ type: 'undo', player: side })).toBe(false);
    expect(mover.getState().dispatch({ type: 'resignMatch', player: side })).toBe(false);
    expect(confirm(mover)).toBe(false);
    await flush();
    expect(mover.getState().sending).toBe(false);
  });

  it('stays sending until the new view arrives, also when the call resolves first', async () => {
    const { server, storeFor } = setup();
    // Holds the views back until the test lets them through.
    const held: (() => void)[] = [];
    const base = server.transportFor(ALICE);
    const slowViews: GameTransport = {
      ...base,
      subscribe: (gameId, onView, onError) =>
        base.subscribe(gameId, (view) => held.push(() => onView(view)), onError),
    };
    const alice = storeFor(ALICE, slowViews);
    const bob = storeFor(BOB);
    await flush();
    held.splice(0).forEach((deliver) => deliver());
    const [mover] = turnOrder(alice, bob);
    if (mover !== alice) {
      // Let Bob play first, so the test is Alice's turn.
      play(bob, pickTurn(viewOf(bob).game, createSeededRng(5)));
      expect(confirm(bob)).toBe(true);
      await flush();
      held.splice(0).forEach((deliver) => deliver());
    }
    expect(alice.getState().side).toBe(viewOf(alice).waitingFor);
    play(alice, pickTurn(viewOf(alice).game, createSeededRng(6)));
    expect(confirm(alice)).toBe(true);
    await flush();
    // The server has the turn, but this phone has not seen the new view.
    expect(alice.getState().sending).toBe(true);
    held.splice(0).forEach((deliver) => deliver());
    expect(alice.getState().sending).toBe(false);
  });

  it('auto confirm sends the turn when it is complete', async () => {
    const { server, gameId, storeFor } = setup();
    const a = storeFor(ALICE);
    const b = storeFor(BOB);
    await flush();
    const [mover] = turnOrder(a, b);
    const side = mover.getState().side ?? 'white';
    const moves = pickTurn(viewOf(mover).game, createSeededRng(8));
    for (const move of moves) {
      expect(
        mover.getState().dispatch({ type: 'move', player: side, move, autoConfirm: true }),
      ).toBe(true);
    }
    expect(mover.getState().sending).toBe(true);
    await flush();
    expect(server.getGame(gameId)?.version).toBe(2);
    expect(server.getGame(gameId)?.game.lastTurn?.moves).toEqual(moves);
  });

  it('drops the local moves on a stale version (the other phone sent first)', async () => {
    const { server, gameId, storeFor } = setup();
    const start = server.getGame(gameId) as OnlineGameView;
    const starter = start.game.state.toMove;
    const who = PLAYERS[starter];
    // Two phones of the same player.
    const phone1 = storeFor(who);
    const phone2 = storeFor(who);
    await flush();
    play(phone1, pickTurn(viewOf(phone1).game, createSeededRng(9)));
    play(phone2, pickTurn(viewOf(phone2).game, createSeededRng(10)));
    expect(confirm(phone2)).toBe(true);
    expect(confirm(phone1)).toBe(true);
    await flush();

    expect(server.getGame(gameId)?.version).toBe(2);
    const state = phone1.getState();
    expect(state.notice).toBe('stale');
    expect(state.lastError).toMatch(/STALE_VERSION/);
    expect(state.sending).toBe(false);
    expect(viewOf(phone1).version).toBe(2);
    expect(state.flow).toEqual(viewFlow(viewOf(phone1)));
    state.clearNotice();
    expect(phone1.getState().notice).toBeNull();
  });

  it('gets TIMED_OUT for a late turn and drops the moves', async () => {
    const { server, gameId, storeFor, wait } = setup();
    const a = storeFor(ALICE);
    const b = storeFor(BOB);
    await flush();
    const [mover] = turnOrder(a, b);
    const side = mover.getState().side;
    play(mover, pickTurn(viewOf(mover).game, createSeededRng(11)));
    wait(LIVE);
    expect(confirm(mover)).toBe(true);
    await flush();

    expect(mover.getState().notice).toBe('timedOut');
    expect(mover.getState().sending).toBe(false);
    // The call saved the time out, so no check is due any more.
    expect(server.runDueTimeouts()).toBe(0);
    const view = viewOf(mover);
    expect(view.version).toBe(2);
    expect(view.match.games[0]?.reason).toBe('timeout');
    expect(view.match.games[0]?.winner).not.toBe(side);
    expect(mover.getState().flow).toEqual(viewFlow(view));
    expect(server.getGame(gameId)?.version).toBe(2);
  });

  it('replaces the local moves when the server times the turn out', async () => {
    const { server, storeFor, wait } = setup();
    const a = storeFor(ALICE);
    const b = storeFor(BOB);
    await flush();
    const [mover] = turnOrder(a, b);
    play(mover, pickTurn(viewOf(mover).game, createSeededRng(12)).slice(0, 1));
    wait(LIVE);
    expect(server.runDueTimeouts()).toBe(1);
    await flush();
    expect(viewOf(mover).version).toBe(2);
    expect(viewOf(mover).match.games[0]?.reason).toBe('timeout');
    expect(mover.getState().flow?.game.played).toEqual([]);
  });

  it('keeps the moves after a network error, so the player can send again', async () => {
    const { server, gameId, storeFor } = setup();
    const view = server.getGame(gameId) as OnlineGameView;
    const who = PLAYERS[view.waitingFor ?? 'white'];
    const spied = spy(server.transportFor(who));
    const store = storeFor(who, spied.transport);
    await flush();
    const moves = pickTurn(viewOf(store).game, createSeededRng(13));
    play(store, moves);
    const played = store.getState().flow?.game.played;

    spied.setOffline(true);
    expect(confirm(store)).toBe(true);
    await flush();
    expect(store.getState().notice).toBe('sendFailed');
    expect(store.getState().lastError).toBe('network request failed');
    expect(store.getState().sending).toBe(false);
    expect(store.getState().flow?.game.played).toEqual(played);
    expect(server.getGame(gameId)?.version).toBe(1);

    spied.setOffline(false);
    expect(confirm(store)).toBe(true);
    expect(store.getState().notice).toBeNull();
    await flush();
    expect(server.getGame(gameId)?.game.lastTurn?.moves).toEqual(moves);
    expect(viewOf(store).version).toBe(2);
  });

  it('never stays sending when the transport throws at once', async () => {
    const { server, gameId, storeFor } = setup();
    const view = server.getGame(gameId) as OnlineGameView;
    const who = PLAYERS[view.waitingFor ?? 'white'];
    const base = server.transportFor(who);
    const broken: GameTransport = {
      ...base,
      sendTurn: () => {
        throw new Error('not connected');
      },
    };
    const store = storeFor(who, broken);
    await flush();
    play(store, pickTurn(viewOf(store).game, createSeededRng(14)));
    expect(confirm(store)).toBe(true);
    await flush();
    expect(store.getState().sending).toBe(false);
    expect(store.getState().notice).toBe('sendFailed');
    expect(store.getState().flow?.game.phase).toBe('awaiting-confirm');
  });

  it('asks the pinned player the mother question and sends the answer', async () => {
    const { server, gameId, storeFor } = setup('plakoto');
    const { flow, pin } = motherPin(viewFlow(server.getGame(gameId) as OnlineGameView));
    server.setFlowForTest(gameId, flow);
    const alice = storeFor(ALICE);
    const bob = storeFor(BOB);
    await flush();

    // Black (Bob) pins White's mother.
    play(bob, pin);
    expect(confirm(bob)).toBe(true);
    await flush();
    const asked = viewOf(alice);
    expect(asked.prompt).toEqual(
      expect.objectContaining({ player: 'white', choices: ['resign', 'playOn'] }),
    );
    expect(alice.getState().flow?.game.phase).toBe('awaiting-answer');

    // Only the pinned player answers, and only with one of the choices.
    expect(bob.getState().dispatch({ type: 'answer', player: 'black', choice: 'playOn' })).toBe(
      false,
    );
    expect(alice.getState().dispatch({ type: 'answer', player: 'white', choice: 'maybe' })).toBe(
      false,
    );
    expect(alice.getState().dispatch({ type: 'answer', player: 'white', choice: 'playOn' })).toBe(
      true,
    );
    expect(alice.getState().sending).toBe(true);
    await flush();
    expect(alice.getState().sending).toBe(false);
    const after = viewOf(bob);
    expect(after.version).toBe(asked.version + 1);
    expect(after.prompt).toBeNull();
    expect(after.match.games).toEqual([]);
  });

  it('resigns the whole match through the transport', async () => {
    const { server, storeFor } = setup();
    const spied = spy(server.transportFor(ALICE));
    const alice = storeFor(ALICE, spied.transport);
    const bob = storeFor(BOB);
    await flush();
    // Online there is no game resign: only the match.
    expect(alice.getState().dispatch({ type: 'resign', player: 'white' })).toBe(false);
    expect(alice.getState().dispatch({ type: 'resignMatch', player: 'black' })).toBe(false);
    // Allowed on either turn.
    expect(alice.getState().dispatch({ type: 'resignMatch', player: 'white' })).toBe(true);
    await flush();
    expect(spied.calls).toEqual(['subscribe', 'resign']);
    for (const store of [alice, bob]) {
      const view = viewOf(store);
      expect(view.status).toBe('finished');
      expect(view.match.winner).toBe('black');
      expect(view.turnDeadline).toBeNull();
    }
    expect(bob.getState().dispatch({ type: 'resignMatch', player: 'black' })).toBe(false);
    expect(bob.getState().lastError).toMatch(/over/);
  });

  it('refuses everything when this phone is not a player', async () => {
    const { server, storeFor } = setup();
    const spied = spy(server.transportFor('eve'));
    const eve = storeFor('eve', spied.transport);
    await flush();
    expect(eve.getState().side).toBeNull();
    expect(eve.getState().dispatch({ type: 'resignMatch', player: 'white' })).toBe(false);
    expect(spied.calls).toEqual(['subscribe']);
  });

  it('sets loadError for a missing game', async () => {
    const { server } = setup();
    const store = createOnlineStore({
      transport: server.transportFor(ALICE),
      gameId: 'game-404',
      me: ALICE,
    });
    open.push(store);
    await flush();
    expect(store.getState().loadError).toBe('NOT_FOUND');
    expect(store.getState().flow).toBeNull();
  });

  it('estimates the clock offset from each new version, not the first view', async () => {
    let phone = START + 5_000; // The phone clock is 5 s ahead of the server.
    let server = START;
    const memory = createMemoryGameServer({ rng: createSeededRng(1), now: () => server });
    const gameId = memory.createGame(ALICE, PLAYERS, 'portes', 3, 'live');
    const stores = [ALICE, BOB].map((me) =>
      createOnlineStore({ transport: memory.transportFor(me), gameId, me, now: () => phone }),
    );
    open.push(...stores);
    const [a, b] = stores as [OnlineStore, OnlineStore];
    server += 10_000;
    phone += 10_000;
    await flush();
    // The first view may be old (opened later): offset 0.
    expect(a.getState().clockOffset).toBe(0);
    const [mover, other] = turnOrder(a, b);
    play(mover, pickTurn(viewOf(mover).game, createSeededRng(15)));
    expect(confirm(mover)).toBe(true);
    await flush();
    expect(other.getState().clockOffset).toBe(-5_000);
    const view = viewOf(other);
    expect(timeLeft(view, phone, other.getState().clockOffset)).toBe(LIVE);
    phone += 20_000;
    expect(timeLeft(view, phone, other.getState().clockOffset)).toBe(LIVE - 20_000);

    // A view that arrives late (an hour after its save) keeps the best estimate.
    play(other, pickTurn(viewOf(other).game, createSeededRng(16)));
    expect(confirm(other)).toBe(true);
    phone += 60 * 60 * 1000;
    await flush();
    expect(viewOf(mover).version).toBeGreaterThan(view.version);
    expect(mover.getState().clockOffset).toBe(-5_000);
    expect(other.getState().clockOffset).toBe(-5_000);
  });

  it('unsubscribes on dispose and ignores later views', async () => {
    const { server, storeFor } = setup();
    const spied = spy(server.transportFor(ALICE));
    const alice = storeFor(ALICE, spied.transport);
    const bob = storeFor(BOB);
    await flush();
    alice.getState().dispose();
    expect(spied.calls).toEqual(['subscribe', 'unsubscribe']);
    alice.getState().dispose();
    expect(spied.calls).toEqual(['subscribe', 'unsubscribe']);
    expect(bob.getState().dispatch({ type: 'resignMatch', player: 'black' })).toBe(true);
    await flush();
    expect(viewOf(bob).status).toBe('finished');
    expect(viewOf(alice).status).toBe('active');
    expect(alice.getState().dispatch({ type: 'resignMatch', player: 'white' })).toBe(false);
  });

  it('plays whole matches of each game choice through two stores', async () => {
    for (const choice of ONLINE_GAME_CHOICES) {
      const { server, gameId, storeFor } = setup(choice, 21, 1);
      const a = storeFor(ALICE);
      const b = storeFor(BOB);
      const picker: Rng = createSeededRng(22);
      let steps = 0;
      await flush();
      while (viewOf(a).status === 'active') {
        steps += 1;
        if (steps > 2000) throw new Error(`${choice}: the match did not end`);
        const view = viewOf(a);
        expect(viewOf(b).version).toBe(view.version);
        // Follow the server: the same player can act again (Asodio).
        const [mover] = turnOrder(a, b);
        const side = mover.getState().side ?? 'white';
        if (view.prompt !== null) {
          const choiceOf = pickChoice(view.prompt.choices, picker);
          expect(
            mover.getState().dispatch({ type: 'answer', player: side, choice: choiceOf }),
          ).toBe(true);
        } else {
          play(mover, pickTurn(view.game, picker));
          expect(confirm(mover)).toBe(true);
        }
        await flush();
        expect(mover.getState().notice).toBeNull();
      }
      expect(viewOf(b).status).toBe('finished');
      expect(server.getGame(gameId)?.match.winner).not.toBeNull();
    }
  });
});

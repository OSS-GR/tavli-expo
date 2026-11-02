// The online match store over the in-memory server (`@tavli/online`): two
// stores, one per player, run the real server model. The server answers
// on later microtasks and runs no timers; time moves only with `wait`.
import {
  ONLINE_GAME_CHOICES,
  type GameTransport,
  type OnlineGameChoice,
  type OnlineGameView,
  type SetDraftRequest,
} from '@tavli/contracts';
import { createSeededRng, type MatchAction, type MoveInput, type Rng } from '@tavli/engine';
import { createMemoryGameServer } from '@tavli/online';
import { motherPin, openMemoryGame, pickChoice, pickTurn } from '@tavli/online/testing';

import { createOnlineStore, draftFlow, viewFlow, type OnlineStore } from './onlineStore';
import { timeLeft } from './timeLeft';

const ALICE = 'alice';
const BOB = 'bob';
const PLAYERS = { white: ALICE, black: BOB };
const START = Date.UTC(2026, 9, 28, 12, 0, 0);
const LIVE = 60_000;

const open: OnlineStore[] = [];
afterEach(() => {
  for (const store of open.splice(0)) store.getState().dispose();
});

/**
 * A server on a clock that the test moves by hand, with one game. Both
 * players roll their opening dice first (#379), unless `opened` is false.
 */
async function setup(
  choice: OnlineGameChoice = 'portes',
  seed = 1,
  targetPoints = 3,
  opened = true,
) {
  let clock = START;
  const server = createMemoryGameServer({ rng: createSeededRng(seed), now: () => clock });
  const gameId = server.createGame(ALICE, PLAYERS, choice, targetPoints, 1);
  /** The version after the opening: the first player's turn waits at this version. */
  const v0 = opened ? (await openMemoryGame(server, gameId)).version : 1;
  return {
    server,
    gameId,
    v0,
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

/** Asks the server for the roll of `store`'s side (#355). */
function roll(store: OnlineStore): boolean {
  const { side } = store.getState();
  if (side === null) throw new Error('not a player');
  return store.getState().dispatch({ type: 'roll', player: side });
}

/** Two stores; the first player's turn is sent, so the other one waits to roll. */
async function waitingToRoll(seed = 7) {
  const game = await setup();
  const spies = {
    [ALICE]: spy(game.server.transportFor(ALICE)),
    [BOB]: spy(game.server.transportFor(BOB)),
  };
  const a = game.storeFor(ALICE, spies[ALICE].transport);
  const b = game.storeFor(BOB, spies[BOB].transport);
  await flush();
  const [mover, roller] = turnOrder(a, b);
  play(mover, pickTurn(viewOf(mover).game, createSeededRng(seed)));
  expect(confirm(mover)).toBe(true);
  await flush();
  expect(roller.getState().flow?.game.phase).toBe('awaiting-roll');
  return { ...game, mover, roller, rollerSpy: spies[roller === a ? ALICE : BOB] };
}

/** A transport that records its calls and can fail the next call like a network. */
function spy(inner: GameTransport) {
  const calls: string[] = [];
  /** The drafts sent (#374), apart from `calls`: they go after every move and undo. */
  const drafts: SetDraftRequest[] = [];
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
    rollDice: (request) => send('rollDice', () => inner.rollDice(request)),
    sendTurn: (request) => send('sendTurn', () => inner.sendTurn(request)),
    setDraft: (request) => {
      drafts.push(request);
      return offline
        ? Promise.reject(new Error('network request failed'))
        : inner.setDraft(request);
    },
    sendAnswer: (request) => send('sendAnswer', () => inner.sendAnswer(request)),
    resign: (gameId) => send('resign', () => inner.resign(gameId)),
    listMyGames: (request) => send('listMyGames', () => inner.listMyGames(request)),
    watchMyGames: (request, onList, onError) => inner.watchMyGames(request, onList, onError),
  };
  return {
    transport,
    calls,
    drafts,
    setOffline: (value: boolean) => {
      offline = value;
    },
  };
}

describe('createOnlineStore', () => {
  it('loads the game and finds your side', async () => {
    const { v0, storeFor } = await setup();
    const alice = storeFor(ALICE);
    expect(alice.getState().flow).toBeNull();
    expect(alice.getState().dispatch({ type: 'confirm', player: 'white' })).toBe(false);
    await flush();
    const view = viewOf(alice);
    expect(view.version).toBe(v0);
    expect(alice.getState().side).toBe('white');
    expect(alice.getState().flow).toEqual(viewFlow(view));
    expect(alice.getState().flow?.log).toEqual([]);
    expect(alice.getState().matchKey).toMatch(/^o\d+$/);
    expect(alice.getState().clockOffset).toBe(0);
  });

  it('sends a full Portes turn, and the other store gets it', async () => {
    const { v0, server, gameId, storeFor } = await setup();
    const a = storeFor(ALICE);
    const b = storeFor(BOB);
    await flush();
    const [mover, other] = turnOrder(a, b);
    const moves = pickTurn(viewOf(mover).game, createSeededRng(7));

    play(mover, moves);
    expect(mover.getState().flow?.game.phase).toBe('awaiting-confirm');
    // Moves stay on the phone until Confirm.
    expect(server.getGame(gameId)?.version).toBe(v0);

    expect(confirm(mover)).toBe(true);
    expect(mover.getState().sending).toBe(true);
    await flush();

    expect(mover.getState().sending).toBe(false);
    for (const store of [mover, other]) {
      expect(viewOf(store).version).toBe(v0 + 1);
      expect(store.getState().flow?.game.lastTurn?.moves).toEqual(moves);
    }
    // The next player's turn waits for their roll (#355).
    expect(viewOf(other).waitingFor).toBe(other.getState().side);
    expect(other.getState().flow?.game.phase).toBe('awaiting-roll');
  });

  it('asks the server for your roll; the view of it starts its log with the roll (#355)', async () => {
    const { server, gameId, mover, roller, rollerSpy } = await waitingToRoll();
    const side = roller.getState().side!;
    const version = viewOf(roller).version;

    expect(roll(roller)).toBe(true);
    expect(roller.getState().sending).toBe(true);
    expect(roller.getState().rolling).toBe(true);
    // One roll at a time.
    expect(roll(roller)).toBe(false);
    await flush();

    expect(roller.getState().sending).toBe(false);
    expect(roller.getState().rolling).toBe(false);
    expect(rollerSpy.calls).toEqual(['subscribe', 'rollDice']);
    const view = server.getGame(gameId)!;
    expect(view.version).toBe(version + 1);
    expect(view.game.phase).toBe('moving');
    const dice = view.game.state.dice!;
    // Your phone throws the dice and reads them as a local roll.
    expect(roller.getState().flow?.game).toEqual(view.game);
    expect(roller.getState().flow?.log).toEqual([{ type: 'roll', player: side, dice }]);
    // The other phone gets the same view, with an empty log.
    expect(mover.getState().flow?.game.state.dice).toEqual(dice);
    expect(mover.getState().flow?.log).toEqual([]);
    // The roll stays in the log while you move.
    play(roller, pickTurn(view.game, createSeededRng(8)).slice(0, 1));
    expect(roller.getState().flow?.log[0]).toEqual({ type: 'roll', player: side, dice });
  });

  it('refuses a roll that is not yours, and ignores a move before your roll (#355)', async () => {
    const { mover, roller, rollerSpy } = await waitingToRoll();
    const moverSide = mover.getState().side!;
    const side = roller.getState().side!;
    // Not the mover's roll.
    expect(roll(mover)).toBe(false);
    expect(mover.getState().lastError).toMatch(/no roll to make/);
    // The phone never picks a die.
    expect(roller.getState().dispatch({ type: 'roll', player: side, dice: [6, 6] })).toBe(false);
    expect(roller.getState().lastError).toMatch(/server rolls the dice/);
    expect(roller.getState().dispatch({ type: 'roll', player: moverSide })).toBe(false);

    // A move, undo or confirm before the roll does nothing, with no refusal.
    const refusals = roller.getState().refusals;
    const move = { from: 1, to: 2, die: 1 } as MoveInput;
    expect(roller.getState().dispatch({ type: 'move', player: side, move })).toBe(false);
    expect(roller.getState().dispatch({ type: 'undo', player: side })).toBe(false);
    expect(confirm(roller)).toBe(false);
    expect(roller.getState().refusals).toBe(refusals);
    expect(roller.getState().lastError).toBe('roll first');
    expect(rollerSpy.calls).toEqual(['subscribe']);
  });

  it('says when a roll does not reach the server, and lets you roll again (#355)', async () => {
    const { server, gameId, roller, rollerSpy } = await waitingToRoll();
    const version = viewOf(roller).version;
    rollerSpy.setOffline(true);
    expect(roll(roller)).toBe(true);
    await flush();
    expect(roller.getState().notice).toBe('rollFailed');
    expect(roller.getState().lastError).toMatch(/network/);
    expect(roller.getState().sending).toBe(false);
    expect(roller.getState().rolling).toBe(false);
    expect(roller.getState().flow?.game.phase).toBe('awaiting-roll');
    expect(server.getGame(gameId)?.version).toBe(version);

    rollerSpy.setOffline(false);
    roller.getState().clearNotice();
    expect(roll(roller)).toBe(true);
    await flush();
    expect(roller.getState().notice).toBeNull();
    expect(server.getGame(gameId)?.version).toBe(version + 1);
    expect(roller.getState().flow?.log).toHaveLength(1);
  });

  it('plays a roll whose answer was lost when its view comes later (#355)', async () => {
    const { server, gameId, roller, rollerSpy } = await waitingToRoll();
    const side = roller.getState().side!;
    const version = viewOf(roller).version;
    // The call fails on the phone...
    rollerSpy.setOffline(true);
    expect(roll(roller)).toBe(true);
    await flush();
    expect(roller.getState().notice).toBe('rollFailed');
    // ...but the roll reached the server, and its view comes later.
    await server
      .transportFor(side === 'white' ? ALICE : BOB)
      .rollDice({ gameId, expectedVersion: version });
    await flush();
    const view = server.getGame(gameId)!;
    expect(view.version).toBe(version + 1);
    expect(viewOf(roller).version).toBe(version + 1);
    // It plays as your roll, and the wrong notice closes.
    const dice = view.game.phase === 'moving' ? view.game.state.dice! : view.game.lastTurn!.dice;
    expect(roller.getState().flow?.log).toEqual([{ type: 'roll', player: side, dice }]);
    expect(roller.getState().notice).toBeNull();
  });

  it('undoes on the phone before Confirm', async () => {
    const { server, gameId, storeFor } = await setup();
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
    const { storeFor } = await setup();
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
    const { storeFor } = await setup();
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
    const { server, storeFor } = await setup();
    const spied = spy(server.transportFor(ALICE));
    const alice = storeFor(ALICE, spied.transport);
    await flush();
    const actions: MatchAction[] = [
      { type: 'nextGame' },
      { type: 'chooseStarter', player: 'white' },
      { type: 'timeout', player: 'white' },
    ];
    for (const action of actions) {
      expect(alice.getState().dispatch(action)).toBe(false);
      expect(alice.getState().lastError).toMatch(/by itself/);
    }
    // The server rolls the dice when you ask (#355): the phone never picks them.
    expect(alice.getState().dispatch({ type: 'roll', player: 'white', dice: [6, 5] })).toBe(false);
    expect(alice.getState().lastError).toMatch(/server rolls the dice/);
    expect(alice.getState().dispatch({ type: 'rollOpening', player: 'white', die: 6 })).toBe(false);
    expect(alice.getState().lastError).toMatch(/server rolls the dice/);
    // The opening is over: there is no die left to roll.
    expect(alice.getState().dispatch({ type: 'rollOpening', player: 'white' })).toBe(false);
    expect(alice.getState().lastError).toMatch(/no opening die/);
    expect(spied.calls).toEqual(['subscribe']);
  });

  it('refuses every action while a call is on its way', async () => {
    const { storeFor } = await setup();
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
    const { server, storeFor } = await setup();
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
    const { v0, server, gameId, storeFor } = await setup();
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
    expect(server.getGame(gameId)?.version).toBe(v0 + 1);
    expect(server.getGame(gameId)?.game.lastTurn?.moves).toEqual(moves);
  });

  it('drops the local moves on a stale version (the other phone sent first)', async () => {
    const { v0, server, gameId, storeFor } = await setup();
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

    expect(server.getGame(gameId)?.version).toBe(v0 + 1);
    const state = phone1.getState();
    expect(state.notice).toBe('stale');
    expect(state.lastError).toMatch(/STALE_VERSION/);
    expect(state.sending).toBe(false);
    expect(viewOf(phone1).version).toBe(v0 + 1);
    expect(state.flow).toEqual(viewFlow(viewOf(phone1)));
    state.clearNotice();
    expect(phone1.getState().notice).toBeNull();
  });

  it('gets TIMED_OUT for a late turn and drops the moves', async () => {
    const { v0, server, gameId, storeFor, wait } = await setup();
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
    expect(view.version).toBe(v0 + 1);
    expect(view.match.games[0]?.reason).toBe('timeout');
    expect(view.match.games[0]?.winner).not.toBe(side);
    expect(mover.getState().flow).toEqual(viewFlow(view));
    expect(server.getGame(gameId)?.version).toBe(v0 + 1);
  });

  it('replaces the local moves when the server times the turn out', async () => {
    const { v0, server, storeFor, wait } = await setup();
    const a = storeFor(ALICE);
    const b = storeFor(BOB);
    await flush();
    const [mover] = turnOrder(a, b);
    play(mover, pickTurn(viewOf(mover).game, createSeededRng(12)).slice(0, 1));
    wait(LIVE);
    expect(server.runDueTimeouts()).toBe(1);
    await flush();
    expect(viewOf(mover).version).toBe(v0 + 1);
    expect(viewOf(mover).match.games[0]?.reason).toBe('timeout');
    expect(mover.getState().flow?.game.played).toEqual([]);
  });

  it('keeps the moves after a network error, so the player can send again', async () => {
    const { v0, server, gameId, storeFor } = await setup();
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
    expect(server.getGame(gameId)?.version).toBe(v0);

    spied.setOffline(false);
    expect(confirm(store)).toBe(true);
    expect(store.getState().notice).toBeNull();
    await flush();
    expect(server.getGame(gameId)?.game.lastTurn?.moves).toEqual(moves);
    expect(viewOf(store).version).toBe(v0 + 1);
  });

  it('never stays sending when the transport throws at once', async () => {
    const { server, gameId, storeFor } = await setup();
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
    const { server, gameId, storeFor } = await setup('plakoto');
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
    const { server, storeFor } = await setup();
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
    const { server, storeFor } = await setup();
    const spied = spy(server.transportFor('eve'));
    const eve = storeFor('eve', spied.transport);
    await flush();
    expect(eve.getState().side).toBeNull();
    expect(eve.getState().dispatch({ type: 'resignMatch', player: 'white' })).toBe(false);
    expect(spied.calls).toEqual(['subscribe']);
  });

  it('sets loadError for a missing game', async () => {
    const { server } = await setup();
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
    const gameId = memory.createGame(ALICE, PLAYERS, 'portes', 3, 1);
    await openMemoryGame(memory, gameId);
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
    expect(roll(other)).toBe(true);
    await flush();
    play(other, pickTurn(viewOf(other).game, createSeededRng(16)));
    expect(confirm(other)).toBe(true);
    phone += 60 * 60 * 1000;
    await flush();
    expect(viewOf(mover).version).toBeGreaterThan(view.version);
    expect(mover.getState().clockOffset).toBe(-5_000);
    expect(other.getState().clockOffset).toBe(-5_000);
  });

  it('unsubscribes on dispose and ignores later views', async () => {
    const { server, storeFor } = await setup();
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
      const { server, gameId, storeFor } = await setup(choice, 21, 1);
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
        } else if (view.game.phase === 'awaiting-roll') {
          // Each turn waits for its roll (#355).
          expect(roll(mover)).toBe(true);
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

/** Only the fields a move is named by: an engine `Move` may carry more. */
const plain = (moves: readonly MoveInput[]) =>
  moves.map(({ from, to, die }) => ({ from, to, die }));

/** A transport whose drafts wait until the test lets them go, one by one. */
function heldDrafts(inner: GameTransport) {
  const sent: SetDraftRequest[] = [];
  const waiting: (() => void)[] = [];
  const transport: GameTransport = {
    ...inner,
    setDraft: (request) => {
      sent.push(request);
      return new Promise<void>((resolve, reject) => {
        waiting.push(() => {
          inner.setDraft(request).then(resolve, reject);
        });
      });
    },
  };
  return {
    transport,
    sent,
    /** Lets the oldest held draft go to the server. */
    release: () => waiting.shift()?.(),
  };
}

describe('the opening roll (#379)', () => {
  /** A new match before the opening, with a spied store per player. */
  async function opening(seed: number) {
    const game = await setup('portes', seed, 3, false);
    const spies = {
      [ALICE]: spy(game.server.transportFor(ALICE)),
      [BOB]: spy(game.server.transportFor(BOB)),
    };
    const alice = game.storeFor(ALICE, spies[ALICE].transport);
    const bob = game.storeFor(BOB, spies[BOB].transport);
    await flush();
    return { ...game, spies, alice, bob };
  }

  const rollOpening = (store: OnlineStore) =>
    store.getState().dispatch({ type: 'rollOpening', player: store.getState().side! });

  it('each player taps to roll their own die, in any order', async () => {
    for (let seed = 1; seed < 40; seed++) {
      const { server, gameId, spies, alice, bob } = await opening(seed);
      expect(viewOf(alice).game.phase).toBe('opening-roll');
      expect(viewOf(alice).waitingFor).toBe('white');

      // Black rolls first, while the view waits for White.
      expect(rollOpening(bob)).toBe(true);
      expect(bob.getState().sending).toBe(true);
      expect(bob.getState().rolling).toBe(true);
      // One roll at a time.
      expect(rollOpening(bob)).toBe(false);
      await flush();
      expect(bob.getState().rolling).toBe(false);
      expect(spies[BOB].calls).toEqual(['subscribe', 'rollDice']);
      const black = server.getGame(gameId)!.game.opening!.black!;
      // Your phone plays your die as a local opening roll; the other one
      // gets it only from the view, with an empty log.
      expect(bob.getState().flow?.log).toEqual([
        { type: 'rollOpening', player: 'black', die: black },
      ]);
      expect(alice.getState().flow?.game.opening?.black).toBe(black);
      expect(alice.getState().flow?.log).toEqual([]);
      // Your die is in: there is nothing left to roll.
      expect(rollOpening(bob)).toBe(false);
      expect(bob.getState().lastError).toMatch(/no opening die/);

      expect(rollOpening(alice)).toBe(true);
      await flush();
      const view = server.getGame(gameId)!;
      if (view.game.phase === 'opening-roll') continue; // A tie: try another seed.
      const white = view.game.opening!.white!;
      expect(white).not.toBe(black);
      expect(alice.getState().flow?.log).toEqual([
        { type: 'rollOpening', player: 'white', die: white },
      ]);
      expect(bob.getState().flow?.log).toEqual([]);
      expect(rollOpening(alice)).toBe(false);
      return;
    }
    throw new Error('every seed tied');
  });

  it('after a tie, both players roll again', async () => {
    for (let seed = 1; seed < 80; seed++) {
      const { server, gameId, alice, bob } = await opening(seed);
      expect(rollOpening(alice)).toBe(true);
      await flush();
      expect(rollOpening(bob)).toBe(true);
      await flush();
      const view = server.getGame(gameId)!;
      if (view.game.phase !== 'opening-roll') continue; // No tie: try another seed.
      const tie = view.game.opening!.ties[0]!;
      // The tie is your roll too: it plays as your die.
      expect(bob.getState().flow?.log).toEqual([
        { type: 'rollOpening', player: 'black', die: tie },
      ]);
      expect(view.game.opening).toMatchObject({ white: null, black: null });
      expect(rollOpening(bob)).toBe(true);
      await flush();
      expect(rollOpening(alice)).toBe(true);
      await flush();
      expect(server.getGame(gameId)!.version).toBeGreaterThan(view.version + 1);
      return;
    }
    throw new Error('no seed tied');
  });

  it('says when your die does not reach the server, and lets you roll again', async () => {
    const { server, gameId, spies, alice } = await opening(1);
    spies[ALICE].setOffline(true);
    expect(rollOpening(alice)).toBe(true);
    await flush();
    expect(alice.getState().notice).toBe('rollFailed');
    expect(alice.getState().rolling).toBe(false);
    expect(server.getGame(gameId)!.version).toBe(1);
    expect(alice.getState().flow?.game.opening?.white).toBeNull();

    spies[ALICE].setOffline(false);
    expect(rollOpening(alice)).toBe(true);
    await flush();
    expect(alice.getState().notice).toBeNull();
    expect(server.getGame(gameId)!.game.opening!.white).not.toBeNull();
  });
});

describe('live moves (#374)', () => {
  it('sends your turn so far after each move and undo: one call at a time, then the newest', async () => {
    const { server, gameId, storeFor } = await setup();
    const first = server.getGame(gameId)!;
    const moverId = first.waitingFor === 'white' ? ALICE : BOB;
    const held = heldDrafts(server.transportFor(moverId));
    const mover = storeFor(moverId, held.transport);
    await flush();
    const side = mover.getState().side!;
    const moves = pickTurn(first.game, createSeededRng(3));
    expect(moves.length).toBeGreaterThan(1);

    play(mover, moves.slice(0, 1));
    expect(held.sent).toEqual([
      { gameId, expectedVersion: first.version, moves: moves.slice(0, 1) },
    ]);
    // While that one is on its way, only the newest draft waits.
    play(mover, moves.slice(1, 2));
    expect(mover.getState().dispatch({ type: 'undo', player: side })).toBe(true);
    expect(held.sent).toHaveLength(1);
    held.release();
    await flush();
    expect(held.sent.map((draft) => draft.moves)).toEqual([moves.slice(0, 1), moves.slice(0, 1)]);
    held.release();
    await flush();
    expect(server.getGame(gameId)?.draft).toEqual({ seq: 2, moves: moves.slice(0, 1) });
    // Drafts never touch the local flow, the version or `sending`.
    expect(mover.getState().flow?.game.played).toHaveLength(1);
    expect(mover.getState().sending).toBe(false);
    expect(server.getGame(gameId)?.version).toBe(first.version);
  });

  it('shows the other player their moves as they happen, on the same version', async () => {
    const { storeFor } = await setup();
    const a = storeFor(ALICE);
    const b = storeFor(BOB);
    await flush();
    const [mover, other] = turnOrder(a, b);
    const side = mover.getState().side!;
    const start = viewOf(other);
    const moves = pickTurn(start.game, createSeededRng(3));

    play(mover, moves.slice(0, 1));
    await flush();
    expect(viewOf(other).version).toBe(start.version);
    expect(viewOf(other).draft?.seq).toBe(1);
    expect(plain(other.getState().flow!.game.played)).toEqual(plain(moves.slice(0, 1)));
    // A view: the log stays empty.
    expect(other.getState().flow?.log).toEqual([]);
    // Your own draft comes back to you too: your moves on the phone stay.
    expect(mover.getState().flow?.log).toHaveLength(1);

    expect(mover.getState().dispatch({ type: 'undo', player: side })).toBe(true);
    await flush();
    expect(other.getState().flow?.game.played).toEqual([]);
    expect(other.getState().flow?.game).toEqual(start.game);

    play(mover, moves);
    await flush();
    expect(plain(other.getState().flow!.game.played)).toEqual(plain(moves));
    expect(other.getState().flow?.game.phase).toBe('awaiting-confirm');
    // The other player still cannot act on it.
    expect(other.getState().dispatch({ type: 'undo', player: other.getState().side! })).toBe(false);

    expect(confirm(mover)).toBe(true);
    await flush();
    expect(viewOf(other).version).toBe(start.version + 1);
    expect(viewOf(other).draft).toBeNull();
    expect(other.getState().flow?.game.lastTurn?.moves).toEqual(moves);
  });

  it('takes only a newer draft of the same view, on the other player turn', async () => {
    const { server, gameId } = await setup();
    const view = server.getGame(gameId)!;
    const mover = view.waitingFor!;
    const [move] = pickTurn(view.game, createSeededRng(3));
    const drafted = { ...view, draft: { seq: 1, moves: [move!] } };
    const other = mover === 'white' ? 'black' : 'white';
    expect(plain(draftFlow(drafted, other).game.played)).toEqual(plain([move!]));
    // Your own draft: your moves are on the phone already.
    expect(draftFlow(drafted, mover)).toEqual(viewFlow(view));
    // A draft the engine refuses stops there; the view stays as it is.
    const bad = { ...view, draft: { seq: 1, moves: [{ from: 24, to: 17, die: 6 as const }] } };
    expect(draftFlow(bad, other)).toEqual(viewFlow(view));
  });

  it('a draft that fails never holds back a move, an undo or Confirm', async () => {
    const { server, gameId, storeFor } = await setup();
    const first = server.getGame(gameId)!;
    const moverId = first.waitingFor === 'white' ? ALICE : BOB;
    const inner = server.transportFor(moverId);
    let tries = 0;
    // A server from before #374: no `setDraft`. Then one that throws at once.
    const mover = storeFor(moverId, {
      ...inner,
      setDraft: () => {
        tries += 1;
        if (tries > 1) throw new Error('no setDraft');
        return Promise.reject(new Error("Could not find public function for 'games:setDraft'"));
      },
    });
    await flush();
    const side = mover.getState().side!;
    const moves = pickTurn(first.game, createSeededRng(3));
    play(mover, moves.slice(0, 1));
    await flush();
    expect(mover.getState().dispatch({ type: 'undo', player: side })).toBe(true);
    await flush();
    play(mover, moves);
    await flush();
    expect(tries).toBeGreaterThan(1);
    expect(mover.getState().notice).toBeNull();
    expect(mover.getState().lastError).toBeNull();
    expect(confirm(mover)).toBe(true);
    await flush();
    expect(server.getGame(gameId)?.game.lastTurn?.moves).toEqual(moves);
  });

  it('sends no draft with `sendDrafts: false` (the online bot)', async () => {
    const { server, gameId } = await setup();
    const first = server.getGame(gameId)!;
    const moverId = first.waitingFor === 'white' ? ALICE : BOB;
    const spied = spy(server.transportFor(moverId));
    const mover = createOnlineStore({
      transport: spied.transport,
      gameId,
      me: moverId,
      sendDrafts: false,
    });
    open.push(mover);
    await flush();
    const side = mover.getState().side!;
    const moves = pickTurn(first.game, createSeededRng(3));
    play(mover, moves.slice(0, 1));
    expect(mover.getState().dispatch({ type: 'undo', player: side })).toBe(true);
    play(mover, moves);
    await flush();
    expect(spied.drafts).toEqual([]);
    expect(server.getGame(gameId)?.draft ?? null).toBeNull();
    expect(confirm(mover)).toBe(true);
    await flush();
    expect(server.getGame(gameId)?.game.lastTurn?.moves).toEqual(moves);
  });

  it('sends no draft once the turn goes (auto confirm), and drops the one waiting', async () => {
    const { server, gameId, storeFor } = await setup();
    const first = server.getGame(gameId)!;
    const moverId = first.waitingFor === 'white' ? ALICE : BOB;
    const spied = spy(server.transportFor(moverId));
    const mover = storeFor(moverId, spied.transport);
    await flush();
    const side = mover.getState().side!;
    const moves = pickTurn(first.game, createSeededRng(8));
    for (const move of moves) {
      mover.getState().dispatch({ type: 'move', player: side, move, autoConfirm: true });
    }
    await flush();
    expect(server.getGame(gameId)?.version).toBe(first.version + 1);
    // The first draft went; the next ones waited, and the turn made them old.
    expect(spied.drafts.map((draft) => draft.moves.length)).toEqual([1]);
    expect(server.getGame(gameId)?.draft).toBeNull();
  });
});

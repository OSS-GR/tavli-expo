// Online feedback (#271): the events of the server's views match the
// events of the same steps in a local game. The in-memory server runs the
// real model; it runs no timers, and its clock moves only by hand.
import {
  createRecordingFeedback,
  createRecordingSoundPlayer,
  type GameTransport,
  type OnlineGameView,
} from '@tavli/contracts';
import {
  createSeededRng,
  type MatchAction,
  type MatchFlow,
  type MoveInput,
  type PlayerId,
} from '@tavli/engine';
import { createMemoryGameServer } from '@tavli/online';
import { closedOut, pickTurn } from '@tavli/online/testing';
import { getTheme } from '@tavli/themes';

import { turnMoveDelay } from '@/features/board/flights';
import { createGameFeedback, type FeedbackEvent } from '@/features/feedback/feedback';
import { storeEvents, type TimedEvent } from '@/features/game/gameFeedback';
import { createGameStore, type BoardStore } from '@/features/game/gameStore';

import { onlineBoardStore } from './boardStore';
import { onlineStoreEvents, viewEvents } from './onlineFeedback';
import { createOnlineStore, viewFlow, type OnlineStore } from './onlineStore';

const ALICE = 'alice';
const BOB = 'bob';
const PLAYERS = { white: ALICE, black: BOB };
const START = Date.UTC(2026, 9, 28, 12, 0, 0);
const THEME = getTheme('walnut-kafeneio');

const open: OnlineStore[] = [];
afterEach(() => {
  for (const store of open.splice(0)) store.getState().dispose();
});

/** Lets the pending microtasks run (the server answers on later microtasks). */
async function flush(): Promise<void> {
  for (let i = 0; i < 20; i++) await Promise.resolve();
}

/** A Portes game, Alice (White) on this phone. */
async function setup(seed: number, targetPoints = 7) {
  let clock = START;
  const server = createMemoryGameServer({ rng: createSeededRng(seed), now: () => clock });
  const gameId = server.createGame(ALICE, PLAYERS, 'portes', targetPoints, 1);
  const view = (): OnlineGameView => server.getGame(gameId)!;
  /** Rolls for the side the server waits for, with no phone (#355). */
  const roll = async () => {
    const v = view();
    const transport = server.transportFor(PLAYERS[v.waitingFor!]);
    await transport.rollDice({ gameId, expectedVersion: v.version });
    await flush();
  };
  /** Plays a full turn of the side the server waits for, with no phone. */
  const playTurn = async (moves?: readonly MoveInput[]) => {
    const v = view();
    const side = v.waitingFor!;
    const transport = server.transportFor(PLAYERS[side]);
    const turn = moves ?? pickTurn(v.game, createSeededRng(seed));
    await transport.sendTurn({ gameId, expectedVersion: v.version, moves: turn });
    await flush();
    return turn;
  };
  const storeFor = async (transport: GameTransport = server.transportFor(ALICE)) => {
    const store = createOnlineStore({ transport, gameId, me: ALICE, now: () => clock });
    open.push(store);
    await flush();
    return store;
  };
  return {
    server,
    gameId,
    view,
    roll,
    playTurn,
    storeFor,
    wait: (ms: number) => {
      clock += ms;
    },
  };
}

/** Records the events of each update of the store, as `useGameFeedback` reads them. */
function record(board: BoardStore, me: PlayerId) {
  const eventsOf = onlineStoreEvents(me);
  const updates: (FeedbackEvent | TimedEvent)[][] = [];
  const stop = board.subscribe((next, prev) => {
    updates.push([...eventsOf(prev, next, [me])]);
  });
  return { updates, stop };
}

/** The local game: `actions` one by one on a game store, the events of each. */
function localUpdates(flow: MatchFlow, actions: readonly MatchAction[]): FeedbackEvent[][] {
  const store = createGameStore({ players: PLAYERS, rng: createSeededRng(1), flow });
  const updates: FeedbackEvent[][] = [];
  const stop = store.subscribe((next, prev) => updates.push(storeEvents(prev, next, ['white'])));
  for (const action of actions) expect(store.getState().dispatch(action)).toBe(true);
  stop();
  return updates;
}

const eventOf = (item: FeedbackEvent | TimedEvent) =>
  typeof item === 'string' ? item : item.event;
const atOf = (item: FeedbackEvent | TimedEvent) => (typeof item === 'string' ? 0 : item.at);

/**
 * The sounds and haptics of a list of store updates, through the real
 * feedback (with its throttle). Updates are a second apart; a timed event
 * plays `at` ms into its update.
 */
function calls(updates: readonly (readonly (FeedbackEvent | TimedEvent)[])[]) {
  let t = 1_000_000;
  const sound = createRecordingSoundPlayer();
  const haptics = createRecordingFeedback();
  const feedback = createGameFeedback({ theme: THEME, sound, haptics, now: () => t });
  for (const update of updates) {
    const start = t;
    const timed = update
      .map((item, i) => ({ item, i }))
      .sort((a, b) => atOf(a.item) - atOf(b.item) || a.i - b.i);
    for (const { item } of timed) {
      t = start + atOf(item);
      feedback.event(eventOf(item));
    }
    t = start + 1000;
  }
  return { sounds: [...sound.played].sort(), haptics: [...haptics.calls].sort() };
}

/** A seed where Black moves first and White can play the roll after Black's turn. */
async function blackToMove() {
  for (let seed = 1; seed < 60; seed++) {
    const game = await setup(seed);
    const v = game.view();
    if (v.waitingFor !== 'black') continue;
    const moves = pickTurn(v.game, createSeededRng(seed));
    if (moves.length < 2) continue;
    return { game, seed };
  }
  throw new Error('no seed where Black starts');
}

describe('online feedback (#271)', () => {
  it('plays the other player’s turn like the same steps in a local game', async () => {
    const { game } = await blackToMove();
    const alice = await game.storeFor();
    const board = onlineBoardStore(alice, game.gameId)!;
    const before = alice.getState().flow!;
    const { updates, stop } = record(board, 'white');

    const moves = await game.playTurn();
    stop();
    const after = game.view();
    expect(after.game.lastTurn?.player).toBe('black');
    expect(after.waitingFor).toBe('white');
    // Your turn waits for your roll (#355).
    expect(after.game.phase).toBe('awaiting-roll');

    // Local: Black plays the same moves and confirms.
    const local = localUpdates(before, [
      ...moves.map((move): MatchAction => ({ type: 'move', player: 'black', move })),
      { type: 'confirm', player: 'black' },
    ]);
    expect(updates.flat().map(eventOf)).toEqual(local.flat());
    expect(updates.flat().map(eventOf)).toContain('turnStart');
    expect(updates.flat().map(eventOf)).not.toContain('diceRoll');
    expect(calls(updates)).toEqual(calls(local));

    // Each move plays when its checker starts to fly.
    const timed = updates.flat().filter((e) => typeof e !== 'string' && e.event !== 'turnStart');
    expect(timed.map(atOf)).toEqual(moves.map((_, i) => turnMoveDelay(i)));
  });

  it('plays your roll when the server’s dice arrive, like a local roll (#355)', async () => {
    const { game } = await blackToMove();
    const alice = await game.storeFor();
    const board = onlineBoardStore(alice, game.gameId)!;
    const before = alice.getState().flow!;
    const { updates, stop } = record(board, 'white');

    const moves = await game.playTurn();
    updates.length = 0;
    const waiting = alice.getState().flow!;
    expect(alice.getState().dispatch({ type: 'roll', player: 'white' })).toBe(true);
    // Nothing plays before the server answers.
    expect(updates.flat()).toEqual([]);
    await flush();
    stop();
    expect(updates.map((u) => u.map(eventOf))).toEqual([['diceRoll']]);
    const dice = game.view().game.state.dice!;
    expect(alice.getState().flow!.log).toEqual([{ type: 'roll', player: 'white', dice }]);
    // The same step as a local roll.
    expect(localUpdates(waiting, [{ type: 'roll', player: 'white', dice }])).toEqual([
      ['diceRoll'],
    ]);
    // In all, the same steps as a local game.
    const local = localUpdates(before, [
      ...moves.map((move): MatchAction => ({ type: 'move', player: 'black', move })),
      { type: 'confirm', player: 'black' },
      { type: 'roll', player: 'white', dice },
    ]);
    expect(local.at(-1)).toEqual(['diceRoll']);
  });

  it('plays the other player’s pass: their dice, then your turn (#355)', async () => {
    const game = await setup(3);
    game.server.setFlowForTest(game.gameId, closedOut(viewFlow(game.view()), 'black'));
    const alice = await game.storeFor();
    const board = onlineBoardStore(alice, game.gameId)!;
    const { updates, stop } = record(board, 'white');

    await game.roll();
    stop();
    const after = game.view();
    expect(after.waitingFor).toBe('white');
    expect(after.game.phase).toBe('awaiting-roll');
    expect(after.game.lastTurn).toMatchObject({ player: 'black', moves: [] });
    expect(updates.map((u) => u.map(eventOf))).toEqual([['diceRoll', 'turnStart']]);
  });

  it('plays your pass as a local roll, then only the other player’s dice (#355)', async () => {
    const game = await setup(3);
    const start = closedOut(viewFlow(game.view()), 'white');
    game.server.setFlowForTest(game.gameId, start);
    const alice = await game.storeFor();
    const board = onlineBoardStore(alice, game.gameId)!;
    const { updates, stop } = record(board, 'white');
    // The other phone (Bob, Black) hears the same pass.
    const bob = createOnlineStore({
      transport: game.server.transportFor(BOB),
      gameId: game.gameId,
      me: BOB,
    });
    open.push(bob);
    await flush();
    const theirs = record(onlineBoardStore(bob, game.gameId)!, 'black');

    // Your roll has no legal move: it plays as the same roll in a local game.
    expect(alice.getState().dispatch({ type: 'roll', player: 'white' })).toBe(true);
    await flush();
    const passed = game.view();
    expect(passed.waitingFor).toBe('black');
    const dice = passed.game.lastTurn!.dice;
    expect(alice.getState().flow!.log).toEqual([{ type: 'roll', player: 'white', dice }]);
    expect(updates.flat().map(eventOf)).toEqual(
      localUpdates(start, [{ type: 'roll', player: 'white', dice }]).flat(),
    );
    // Your dice, then the other player's turn: on both phones.
    expect(updates.flat().map(eventOf)).toEqual(['diceRoll', 'turnStart']);
    expect(theirs.updates.flat().map(eventOf)).toEqual(['diceRoll', 'turnStart']);
    theirs.stop();

    // Black rolls: only their dice play.
    updates.length = 0;
    await game.roll();
    stop();
    expect(game.view().game.phase).toBe('moving');
    expect(updates.map((u) => u.map(eventOf))).toEqual([['diceRoll']]);
  });

  it('plays your own turn once: its moves on the phone, then only the other player’s roll', async () => {
    let found: Awaited<ReturnType<typeof setup>> | null = null;
    for (let seed = 1; seed < 60 && found === null; seed++) {
      const game = await setup(seed);
      if (game.view().waitingFor === 'white') found = game;
    }
    const game = found!;
    const alice = await game.storeFor();
    const board = onlineBoardStore(alice, game.gameId)!;
    const before = alice.getState().flow!;
    const { updates, stop } = record(board, 'white');

    const moves = pickTurn(before.game, createSeededRng(4));
    for (const move of moves) {
      expect(alice.getState().dispatch({ type: 'move', player: 'white', move })).toBe(true);
    }
    expect(alice.getState().dispatch({ type: 'confirm', player: 'white' })).toBe(true);
    await flush();
    // The view of your turn adds no move: Black's turn starts.
    expect(updates.at(-1)?.map(eventOf)).toEqual(['turnStart']);
    // Black rolls (#355): their dice tumble.
    await game.roll();
    stop();
    const after = game.view();
    expect(after.game.lastTurn?.player).toBe('white');
    expect(updates.at(-1)?.map(eventOf)).toEqual(['diceRoll']);
    const local = localUpdates(before, [
      ...moves.map((move): MatchAction => ({ type: 'move', player: 'white', move })),
      { type: 'confirm', player: 'white' },
      { type: 'roll', player: 'black', dice: after.game.state.dice! },
    ]);
    expect(updates.flat().map(eventOf)).toEqual(local.flat());
    expect(calls(updates)).toEqual(calls(local));
  });

  it('plays the game win like a local game, and nothing for a lost game', async () => {
    const { game } = await blackToMove();
    const alice = await game.storeFor();
    const board = onlineBoardStore(alice, game.gameId)!;
    const before = alice.getState().flow!;
    const { updates, stop } = record(board, 'white');

    // Black's time runs out: White wins the game, and the next one starts.
    game.wait(60_000);
    expect(game.server.runDueTimeouts()).toBe(1);
    await flush();
    const won = game.view();
    expect(won.status).toBe('active');
    expect(won.match.games).toHaveLength(1);
    expect(won.match.games[0]?.winner).toBe('white');
    expect(updates.flat().map(eventOf)).toEqual(['gameWin']);
    expect(localUpdates(before, [{ type: 'timeout', player: 'black' }]).flat()).toEqual([
      'gameWin',
    ]);

    // Now White's time runs out, or Black's. A game White loses plays nothing.
    updates.length = 0;
    const next = alice.getState().flow!;
    const loser = won.waitingFor!;
    game.wait(60_000);
    expect(game.server.runDueTimeouts()).toBe(1);
    await flush();
    stop();
    const expected = loser === 'white' ? [] : ['gameWin'];
    expect(updates.flat().map(eventOf)).toEqual(expected);
    expect(localUpdates(next, [{ type: 'timeout', player: loser }]).flat()).toEqual(expected);
  });

  it('plays the win when the sheet opens, and the next turn once when it closes (#286)', async () => {
    const { game } = await blackToMove();
    const alice = await game.storeFor();
    const board = onlineBoardStore(alice, game.gameId)!;
    const before = alice.getState().flow!;
    const { updates, stop } = record(board, 'white');

    // Black's time runs out. The view holds game 2, but the board holds
    // the end of game 1: only the win plays.
    game.wait(60_000);
    expect(game.server.runDueTimeouts()).toBe(1);
    await flush();
    const next = game.view();
    expect(next.match.games).toHaveLength(1);
    // The winner starts game 2, and waits for their roll (#355).
    expect(next.waitingFor).toBe('white');
    expect(next.game.phase).toBe('awaiting-roll');
    expect(updates.map((u) => u.map(eventOf))).toEqual([['gameWin']]);

    // The sheet closes: the turn of game 2 starts, once.
    board.release();
    board.release();
    expect(updates.map((u) => u.map(eventOf))).toEqual([['gameWin'], ['turnStart']]);
    // White rolls.
    expect(alice.getState().dispatch({ type: 'roll', player: 'white' })).toBe(true);
    await flush();
    stop();
    expect(updates.map((u) => u.map(eventOf))).toEqual([['gameWin'], ['turnStart'], ['diceRoll']]);
    // Local: the game ends, Next game, then the roll of the same dice.
    const local = localUpdates(before, [
      { type: 'timeout', player: 'black' },
      { type: 'nextGame' },
      { type: 'roll', player: 'white', dice: game.view().game.state.dice! },
    ]);
    expect(updates.flat().map(eventOf)).toEqual(local.flat());
  });

  it('plays the match win like a local game', async () => {
    let found: Awaited<ReturnType<typeof setup>> | null = null;
    for (let seed = 1; seed < 60 && found === null; seed++) {
      const game = await setup(seed, 1);
      if (game.view().waitingFor === 'black') found = game;
    }
    const game = found!;
    const alice = await game.storeFor();
    const board = onlineBoardStore(alice, game.gameId)!;
    const before = alice.getState().flow!;
    const { updates, stop } = record(board, 'white');

    game.wait(60_000);
    expect(game.server.runDueTimeouts()).toBe(1);
    await flush();
    stop();
    expect(game.view().status).toBe('finished');
    expect(updates.flat().map(eventOf)).toEqual(['matchWin']);
    expect(localUpdates(before, [{ type: 'timeout', player: 'black' }]).flat()).toEqual([
      'matchWin',
    ]);
  });

  it('gives no invalid-move feedback for a send that failed, only for a refused move', async () => {
    let found: Awaited<ReturnType<typeof setup>> | null = null;
    for (let seed = 1; seed < 60 && found === null; seed++) {
      const game = await setup(seed);
      if (game.view().waitingFor === 'white') found = game;
    }
    const game = found!;
    const inner = game.server.transportFor(ALICE);
    const offline: GameTransport = {
      subscribe: (id, onView, onError) => inner.subscribe(id, onView, onError),
      rollDice: (request) => inner.rollDice(request),
      sendTurn: () => Promise.reject(new Error('network request failed')),
      setDraft: () => Promise.reject(new Error('network request failed')),
      sendAnswer: () => Promise.reject(new Error('network request failed')),
      resign: () => Promise.reject(new Error('network request failed')),
      listMyGames: () => Promise.reject(new Error('network request failed')),
      watchMyGames: (request, onList, onError) => inner.watchMyGames(request, onList, onError),
    };
    const alice = await game.storeFor(offline);
    const board = onlineBoardStore(alice, game.gameId)!;
    const { updates, stop } = record(board, 'white');

    const moves = pickTurn(alice.getState().flow!.game, createSeededRng(2));
    for (const move of moves) alice.getState().dispatch({ type: 'move', player: 'white', move });
    updates.length = 0;
    expect(alice.getState().dispatch({ type: 'confirm', player: 'white' })).toBe(true);
    await flush();
    expect(alice.getState().notice).toBe('sendFailed');
    expect(alice.getState().lastError).toMatch(/network/);
    expect(updates.flat()).toEqual([]);

    // A move the engine refuses buzzes.
    expect(alice.getState().dispatch({ type: 'undo', player: 'black' })).toBe(false);
    stop();
    expect(updates.flat()).toEqual(['invalidMove']);
  });

  it('plays your first move of a turn too (the view has an empty log)', async () => {
    let found: Awaited<ReturnType<typeof setup>> | null = null;
    for (let seed = 1; seed < 60 && found === null; seed++) {
      const game = await setup(seed);
      if (game.view().waitingFor === 'white') found = game;
    }
    const game = found!;
    const alice = await game.storeFor();
    const board = onlineBoardStore(alice, game.gameId)!;
    const { updates, stop } = record(board, 'white');
    const [first] = pickTurn(alice.getState().flow!.game, createSeededRng(2));
    alice.getState().dispatch({ type: 'move', player: 'white', move: first! });
    stop();
    expect(updates.flat()).toHaveLength(1);
  });

  it('plays no roll for a double chosen after a 1-2, and nothing for the same view again', async () => {
    const { game } = await blackToMove();
    const flow = viewFlow(game.view());
    expect(viewEvents(flow, viewFlow(game.view()), 'white')).toEqual([]);
    const asked: MatchFlow = { ...flow, game: { ...flow.game, phase: 'awaiting-answer' } };
    const chosen: MatchFlow = {
      ...flow,
      game: {
        ...flow.game,
        state: { ...flow.game.state, variantData: { chosenDouble: 3 } as never },
      },
    };
    expect(viewEvents(asked, chosen, 'white')).toEqual([]);
    expect(viewEvents(asked, flow, 'white').map(eventOf)).toEqual(['turnStart', 'diceRoll']);
  });
});

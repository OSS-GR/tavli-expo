// The in-memory game server: the GameTransport contract, whole matches
// through two transports, and turn timers on a fake clock.

import { describe, expect, it } from 'vitest';

import {
  ASYNC_TURN_TIME_MS,
  MAX_LISTED_GAMES,
  ONLINE_GAME_CHOICES,
  isGameTransportErrorData,
} from '@tavli/contracts';
import type {
  GameTransport,
  GameTransportErrorCode,
  OnlineGameChoice,
  OnlineGameView,
} from '@tavli/contracts';
import { gameTransportContract } from '@tavli/contracts/testing';
import type { GameTransportContractSubject } from '@tavli/contracts/testing';
import { createSeededRng, replay } from '@tavli/engine';
import type { PlayerId } from '@tavli/engine';

import { SERVER_ACTOR } from './calls';
import { createMemoryGameServer } from './memory-server';
import type { MemoryGameServer } from './memory-server';
import { OnlineGameError, createOnlineMatch } from './online-game';
import { closedOut, lastBearOff, motherPin, openMemoryGame, pickChoice, pickTurn } from './testing';

const ALICE = 'alice';
const BOB = 'bob';
const PLAYERS = { white: ALICE, black: BOB };
const START = Date.UTC(2026, 9, 28, 12, 0, 0);
const LIVE = 60_000;

/** A server on a clock that the test moves by hand. */
function setup(seed = 1) {
  let clock = START;
  const server = createMemoryGameServer({ rng: createSeededRng(seed), now: () => clock });
  return {
    server,
    /** Moves the server clock. */
    wait: (ms: number) => {
      clock += ms;
    },
  };
}

/**
 * A new game between Alice (White) and Bob (Black), with both opening dice
 * rolled (#379, `openMemoryGame`): the first player waits to move.
 */
async function startOpened(
  server: MemoryGameServer,
  choice: OnlineGameChoice,
  targetPoints: number,
  turnTimeMinutes: number | null,
): Promise<string> {
  const gameId = server.createGame(ALICE, PLAYERS, choice, targetPoints, turnTimeMinutes);
  await openMemoryGame(server, gameId);
  return gameId;
}

/** Lets the pending microtasks run (the server answers on later microtasks). */
async function flush(): Promise<void> {
  for (let i = 0; i < 10; i++) await Promise.resolve();
}

function otherSide(side: PlayerId): PlayerId {
  return side === 'white' ? 'black' : 'white';
}

/** A subscription that keeps the last view. */
function watch(transport: GameTransport, gameId: string) {
  const views: OnlineGameView[] = [];
  const stop = transport.subscribe(gameId, (view) => views.push(view));
  return {
    views,
    stop,
    last(): OnlineGameView {
      const view = views[views.length - 1];
      if (view === undefined) throw new Error('no view yet');
      return view;
    },
  };
}

async function rejectsWith(call: Promise<unknown>, code: GameTransportErrorCode) {
  const reason: unknown = await call.then(
    () => {
      throw new Error('the call resolved');
    },
    (error: unknown) => error,
  );
  expect(isGameTransportErrorData(reason)).toBe(true);
  expect(reason).toEqual({ code, message: expect.any(String) });
  // Plain data, as it comes over a network, not an Error.
  expect(reason).not.toBeInstanceOf(Error);
}

function contractSubject(): GameTransportContractSubject {
  const { server, wait } = setup(7);
  const picker = createSeededRng(8);
  return {
    createGame: async ({ choice, targetPoints, turnTimeMinutes }) =>
      server.createGame(ALICE, PLAYERS, choice, targetPoints, turnTimeMinutes),
    createMotherQuestion: async () => {
      const gameId = server.createGame(ALICE, PLAYERS, 'plakoto', 1, 1);
      const plakoto = createOnlineMatch(
        { choice: 'plakoto', targetPoints: 1, players: PLAYERS },
        createSeededRng(1),
      );
      const { flow, pin } = motherPin(plakoto);
      server.setFlowForTest(gameId, flow);
      await server.transportFor(BOB).sendTurn({ gameId, expectedVersion: 1, moves: pin });
      return gameId;
    },
    createWinningTurn: async () => {
      const gameId = server.createGame(ALICE, PLAYERS, 'portes', 3, 1);
      const portes = createOnlineMatch(
        { choice: 'portes', targetPoints: 3, players: PLAYERS },
        createSeededRng(1),
      );
      server.setFlowForTest(gameId, lastBearOff(portes));
      return gameId;
    },
    createOtherGame: async () =>
      server.createGame(BOB, { white: BOB, black: 'eve' }, 'portes', 1, 1),
    missingGameId: async () => 'game-404',
    transportFor: (who) => server.transportFor(who === 'stranger' ? 'eve' : PLAYERS[who]),
    legalTurn: (view) => pickTurn(view.game, picker),
    passTime: async (ms) => wait(ms),
  };
}

describe('GameTransport contract (in-memory server)', () => {
  for (const check of gameTransportContract()) {
    it(check.name, () => check.run(contractSubject()));
  }
});

describe('createGame', () => {
  it('starts at version 1 in the opening roll, with a running clock (#379)', () => {
    const { server } = setup();
    const gameId = server.createGame(ALICE, PLAYERS, 'portes', 1, 1);
    const view = server.getGame(gameId);
    expect(view).toMatchObject({
      gameId,
      version: 1,
      status: 'active',
      turnDeadline: START + LIVE,
      waitingFor: 'white',
    });
    expect(view?.game.phase).toBe('opening-roll');
    expect(view?.game.opening).toEqual({ white: null, black: null, ties: [] });
    expect(server.events(gameId)).toEqual([
      {
        seq: 0,
        version: 1,
        actor: SERVER_ACTOR,
        event: expect.objectContaining({ type: 'start' }),
      },
    ]);
  });

  it('rejects the same checks as the Convex mutation', () => {
    const { server } = setup();
    const codeOf = (players: { white: string; black: string }, caller = ALICE) => {
      try {
        server.createGame(caller, players, 'portes', 1, 1);
      } catch (error) {
        if (error instanceof OnlineGameError) return error.code;
        throw error;
      }
      return 'created';
    };
    expect(codeOf(PLAYERS, 'eve')).toBe('BAD_REQUEST');
    expect(codeOf({ white: ALICE, black: ALICE })).toBe('BAD_REQUEST');
    expect(codeOf({ white: ALICE, black: SERVER_ACTOR })).toBe('BAD_REQUEST');
    expect(server.getGame('game-1')).toBeNull();
  });

  it('gives each game its own id', () => {
    const { server } = setup();
    const a = server.createGame(ALICE, PLAYERS, 'portes', 1, 1);
    const b = server.createGame(BOB, PLAYERS, 'fevga', 1, null);
    expect(a).not.toBe(b);
    expect(server.getGame(b)?.choice).toBe('fevga');
  });
});

describe('copies', () => {
  it('getGame and events return copies', () => {
    const { server } = setup();
    const gameId = server.createGame(ALICE, PLAYERS, 'portes', 1, 1);
    const view = server.getGame(gameId) as { version: number; players: { white: string } };
    view.version = 99;
    view.players.white = 'eve';
    expect(server.getGame(gameId)?.version).toBe(1);
    expect(server.getGame(gameId)?.players.white).toBe(ALICE);
    const events = server.events(gameId) as { actor: string }[];
    (events[0] as { actor: string }).actor = 'eve';
    expect(server.events(gameId)[0]?.actor).toBe(SERVER_ACTOR);
  });

  it('two players get equal views, but not the same objects', async () => {
    const { server } = setup();
    const gameId = server.createGame(ALICE, PLAYERS, 'portes', 1, 1);
    const white = watch(server.transportFor(ALICE), gameId);
    const black = watch(server.transportFor(BOB), gameId);
    await flush();
    expect(white.last()).toEqual(black.last());
    expect(white.last()).not.toBe(black.last());
    expect(white.last().game).not.toBe(black.last().game);
  });
});

/**
 * Plays a whole match through the two transports: each side plays only
 * from the views it gets. Returns the last view.
 */
async function playMatch(server: MemoryGameServer, gameId: string, seed: number) {
  const picker = createSeededRng(seed);
  const transports = { white: server.transportFor(ALICE), black: server.transportFor(BOB) };
  const watchers = {
    white: watch(transports.white, gameId),
    black: watch(transports.black, gameId),
  };
  await flush();
  for (let turn = 0; turn < 5000; turn++) {
    const view = watchers.white.last();
    expect(watchers.black.last()).toEqual(view);
    if (view.status === 'finished') {
      watchers.white.stop();
      watchers.black.stop();
      return view;
    }
    const side = view.waitingFor;
    if (side === null) throw new Error('nobody to wait for');
    const mine = watchers[side].last();
    const expectedVersion = mine.version;
    if (mine.prompt !== null) {
      const choice = pickChoice(mine.prompt.choices, picker);
      await transports[side].sendAnswer({ gameId, expectedVersion, choice });
    } else if (mine.game.phase === 'awaiting-roll' || mine.game.phase === 'opening-roll') {
      // In the opening roll (#379) `waitingFor` names the side still to roll.
      await transports[side].rollDice({ gameId, expectedVersion });
    } else {
      const moves = pickTurn(mine.game, picker);
      await transports[side].sendTurn({ gameId, expectedVersion, moves });
    }
    await flush();
    expect(watchers.white.last().version).toBe(view.version + 1);
  }
  throw new Error('the match does not end');
}

describe('whole matches through two transports', () => {
  for (const choice of ONLINE_GAME_CHOICES) {
    it(`${choice}: plays to the end; the event log replays to the last view`, async () => {
      const { server } = setup(21);
      const targetPoints = choice === 'tavli' ? 3 : 1;
      const gameId = server.createGame(ALICE, PLAYERS, choice, targetPoints, 1);
      const view = await playMatch(server, gameId, 31);
      expect(view.match.status).toBe('finished');
      expect(view.waitingFor).toBeNull();
      expect(view.turnDeadline).toBeNull();
      expect(view.choice).toBe(choice satisfies OnlineGameChoice);

      const log = server.events(gameId);
      expect(log.map((row) => row.seq)).toEqual(log.map((_, i) => i));
      expect(log[log.length - 1]?.version).toBe(view.version);
      const again = replay(log.map((row) => row.event));
      expect(again.match).toEqual(view.match);
      expect(again.game).toEqual(view.game);
      // Rolls, moves and confirms carry the id of the player who sent them (#355).
      for (const row of log) {
        const event = row.event;
        if (
          event.type === 'roll' ||
          event.type === 'move' ||
          event.type === 'confirm' ||
          event.type === 'answer'
        ) {
          expect(row.actor).toBe(PLAYERS[event.player]);
        }
      }
    });
  }
});

describe('turn timers on a fake clock', () => {
  it('runDueTimeouts: nothing before the deadline; at it the late player loses the game', async () => {
    const { server, wait } = setup(3);
    const gameId = await startOpened(server, 'portes', 15, 1);
    const white = watch(server.transportFor(ALICE), gameId);
    await flush();
    const before = white.last();
    const late = before.waitingFor as PlayerId;

    wait(LIVE - 1);
    expect(server.runDueTimeouts()).toBe(0);
    wait(1);
    expect(server.runDueTimeouts()).toBe(1);
    await flush();
    const after = white.last();
    expect(after.version).toBe(before.version + 1);
    // Nothing is borne off: a time out is still 1 point, never a diplo (#378).
    expect(after.match.games[0]).toMatchObject({
      winner: otherSide(late),
      points: 1,
      reason: 'timeout',
    });
    // The next game waits for its first roll (#355).
    expect(after.game.phase).toBe('awaiting-roll');
    expect(after.turnDeadline).toBe(START + 2 * LIVE);
    expect(server.events(gameId).find((row) => row.event.type === 'timeout')).toMatchObject({
      actor: SERVER_ACTOR,
      event: { type: 'timeout', player: late },
    });
    // Run again at the same time: nothing is due.
    expect(server.runDueTimeouts()).toBe(0);
  });

  it('runs each check at its deadline, like the Convex scheduler', async () => {
    const { server, wait } = setup(3);
    const gameId = await startOpened(server, 'portes', 15, 1);
    wait(3 * LIVE);
    expect(server.runDueTimeouts()).toBe(3);
    const view = server.getGame(gameId);
    expect(view?.match.games).toHaveLength(3);
    expect(view?.turnDeadline).toBe(START + 4 * LIVE);
    const again = replay(server.events(gameId).map((row) => row.event));
    expect(again.match).toEqual(view?.match);
  });

  it('the match ends when a time out gives the last point; then no clock runs', async () => {
    const { server, wait } = setup(3);
    const gameId = await startOpened(server, 'portes', 1, 1);
    wait(10 * LIVE);
    expect(server.runDueTimeouts()).toBe(1);
    const view = server.getGame(gameId);
    expect(view?.status).toBe('finished');
    expect(view?.match.games[0]).toMatchObject({ points: 1, reason: 'timeout' });
    expect(view?.turnDeadline).toBeNull();
    wait(10 * ASYNC_TURN_TIME_MS);
    expect(server.runDueTimeouts()).toBe(0);
  });

  it('a late sendTurn gets TIMED_OUT, and the time out is saved', async () => {
    const { server, wait } = setup(3);
    const gameId = await startOpened(server, 'portes', 15, 1);
    const before = server.getGame(gameId) as OnlineGameView;
    const late = before.waitingFor as PlayerId;
    const watcher = watch(server.transportFor(PLAYERS[late]), gameId);
    await flush();
    wait(LIVE);
    await rejectsWith(
      server.transportFor(PLAYERS[late]).sendTurn({
        gameId,
        expectedVersion: before.version,
        moves: pickTurn(before.game, createSeededRng(1)),
      }),
      'TIMED_OUT',
    );
    await flush();
    const after = watcher.last();
    expect(after.version).toBe(before.version + 1);
    expect(after.match.games[0]).toMatchObject({ winner: otherSide(late), reason: 'timeout' });
    expect(after.turnDeadline).toBe(START + 2 * LIVE);
    // The time out is saved once: no check is due any more.
    expect(server.runDueTimeouts()).toBe(0);
  });

  it('a move just in time is fine, and gives the next player a full turn', async () => {
    const { server, wait } = setup(3);
    const gameId = await startOpened(server, 'portes', 15, null);
    const before = server.getGame(gameId) as OnlineGameView;
    wait(ASYNC_TURN_TIME_MS - 1);
    await server.transportFor(PLAYERS[before.waitingFor as PlayerId]).sendTurn({
      gameId,
      expectedVersion: before.version,
      moves: pickTurn(before.game, createSeededRng(1)),
    });
    const after = server.getGame(gameId);
    expect(after?.version).toBe(before.version + 1);
    expect(after?.match.games).toHaveLength(0);
    expect(after?.turnDeadline).toBe(START + 2 * ASYNC_TURN_TIME_MS - 1);
    expect(server.runDueTimeouts()).toBe(0);
  });

  it('a roll keeps the turn deadline; the turn time covers the wait before it (#355)', async () => {
    const { server, wait } = setup(3);
    const gameId = await startOpened(server, 'portes', 15, 1);
    const first = server.getGame(gameId) as OnlineGameView;
    const mover = first.waitingFor as PlayerId;
    await server.transportFor(PLAYERS[mover]).sendTurn({
      gameId,
      expectedVersion: first.version,
      moves: pickTurn(first.game, createSeededRng(1)),
    });
    const before = server.getGame(gameId) as OnlineGameView;
    const roller = before.waitingFor as PlayerId;
    expect(before.game.phase).toBe('awaiting-roll');
    expect(before.turnDeadline).toBe(START + LIVE);
    wait(LIVE / 2);
    await server.transportFor(PLAYERS[roller]).rollDice({
      gameId,
      expectedVersion: before.version,
    });
    const after = server.getGame(gameId) as OnlineGameView;
    expect(after.version).toBe(before.version + 1);
    expect(after.game.state.dice).not.toBeNull();
    if (after.waitingFor === roller) {
      expect(after.turnDeadline).toBe(START + LIVE);
    } else {
      // The roll had no legal move: the other player gets a full turn.
      expect(after.turnDeadline).toBe(START + LIVE / 2 + LIVE);
    }
    // The old check is for an old version: it does nothing.
    wait(LIVE / 2 - 1);
    expect(server.runDueTimeouts()).toBe(0);
  });

  it('a roll with no legal move passes; the other player gets a full turn', async () => {
    const { server, wait } = setup(3);
    const gameId = server.createGame(ALICE, PLAYERS, 'portes', 15, 1);
    const portes = createOnlineMatch(
      { choice: 'portes', targetPoints: 15, players: PLAYERS },
      createSeededRng(1),
    );
    server.setFlowForTest(gameId, closedOut(portes));
    const black = watch(server.transportFor(BOB), gameId);
    await flush();
    const before = black.last();
    expect(before.waitingFor).toBe('white');
    wait(1000);
    await server.transportFor(ALICE).rollDice({ gameId, expectedVersion: before.version });
    await flush();
    const after = black.last();
    expect(after.version).toBe(before.version + 1);
    expect(after.game.phase).toBe('awaiting-roll');
    expect(after.waitingFor).toBe('black');
    expect(after.game.lastTurn).toMatchObject({ player: 'white', moves: [] });
    expect(after.game.lastTurn?.dice).toHaveLength(2);
    expect(after.turnDeadline).toBe(START + 1000 + LIVE);
    const roll = server.events(gameId).find((row) => row.event.type === 'roll');
    expect(roll).toMatchObject({ actor: ALICE, version: after.version });
  });

  it('a late rollDice gets TIMED_OUT, and the time out is saved', async () => {
    const { server, wait } = setup(3);
    const gameId = server.createGame(ALICE, PLAYERS, 'portes', 15, 1);
    const portes = createOnlineMatch(
      { choice: 'portes', targetPoints: 15, players: PLAYERS },
      createSeededRng(1),
    );
    server.setFlowForTest(gameId, closedOut(portes));
    const before = server.getGame(gameId) as OnlineGameView;
    wait(LIVE);
    await rejectsWith(
      server.transportFor(ALICE).rollDice({ gameId, expectedVersion: before.version }),
      'TIMED_OUT',
    );
    const after = server.getGame(gameId) as OnlineGameView;
    expect(after.version).toBe(before.version + 1);
    expect(after.match.games[0]).toMatchObject({ winner: 'black', reason: 'timeout' });
    expect(server.runDueTimeouts()).toBe(0);
  });

  it('resign ignores the clock and stops it', async () => {
    const { server, wait } = setup(3);
    const gameId = server.createGame(ALICE, PLAYERS, 'portes', 15, 1);
    wait(5 * LIVE);
    await server.transportFor(BOB).resign(gameId);
    const view = server.getGame(gameId);
    expect(view?.status).toBe('finished');
    expect(view?.match.winner).toBe('white');
    expect(view?.match.games).toHaveLength(0);
    expect(server.runDueTimeouts()).toBe(0);
  });
});

describe('the opening roll (#379)', () => {
  it('at the deadline, the player who did not roll loses the game; the next game starts', async () => {
    const { server, wait } = setup(3);
    const gameId = server.createGame(ALICE, PLAYERS, 'portes', 15, 1);
    wait(1000);
    await server.transportFor(BOB).rollDice({ gameId, expectedVersion: 1 });
    const rolled = server.getGame(gameId) as OnlineGameView;
    expect(rolled.waitingFor).toBe('white');
    expect(rolled.turnDeadline).toBe(START + LIVE);
    wait(LIVE - 1001);
    expect(server.runDueTimeouts()).toBe(0);
    wait(1);
    expect(server.runDueTimeouts()).toBe(1);
    const after = server.getGame(gameId) as OnlineGameView;
    expect(after.match.games).toEqual([
      // 1 point, also with nothing borne off (#378).
      expect.objectContaining({ starter: 'black', winner: 'black', points: 1, reason: 'timeout' }),
    ]);
    expect(after.previousGame?.result?.reason).toBe('timeout');
    // The next game opens by itself (the winner starts).
    expect(after.game.phase).toBe('awaiting-roll');
    expect(after.waitingFor).toBe('black');
    expect(after.turnDeadline).toBe(START + 2 * LIVE);
    expect(server.events(gameId).find((row) => row.event.type === 'timeout')).toMatchObject({
      actor: SERVER_ACTOR,
      event: { type: 'timeout', player: 'white' },
    });
    const again = replay(server.events(gameId).map((row) => row.event));
    expect(again.match).toEqual(after.match);
  });

  it('at the deadline with no die rolled, the server rolls both and the first turn starts', () => {
    const { server, wait } = setup(3);
    const gameId = server.createGame(ALICE, PLAYERS, 'portes', 15, 1);
    wait(LIVE);
    expect(server.runDueTimeouts()).toBe(1);
    const after = server.getGame(gameId) as OnlineGameView;
    expect(after.match.games).toEqual([]);
    expect(after.game.phase).toBe('moving');
    expect(after.waitingFor).toBe(after.game.starter);
    expect(after.turnDeadline).toBe(START + 2 * LIVE);
    const rolls = server.events(gameId).filter((row) => row.event.type === 'rollOpening');
    expect(rolls.length).toBeGreaterThanOrEqual(2);
    for (const row of rolls) expect(row.actor).toBe(SERVER_ACTOR);
  });

  it('a late opening roll gets TIMED_OUT, and the time out is saved', async () => {
    const { server, wait } = setup(3);
    const gameId = server.createGame(ALICE, PLAYERS, 'portes', 15, 1);
    await server.transportFor(ALICE).rollDice({ gameId, expectedVersion: 1 });
    wait(LIVE);
    await rejectsWith(
      server.transportFor(BOB).rollDice({ gameId, expectedVersion: 2 }),
      'TIMED_OUT',
    );
    const after = server.getGame(gameId) as OnlineGameView;
    expect(after.match.games[0]).toMatchObject({ winner: 'white', reason: 'timeout' });
    expect(server.runDueTimeouts()).toBe(0);
  });

  it('an async opening has the 24-hour deadline of an async turn', () => {
    const { server } = setup(3);
    const gameId = server.createGame(ALICE, PLAYERS, 'portes', 15, null);
    expect(server.getGame(gameId)?.turnDeadline).toBe(START + ASYNC_TURN_TIME_MS);
  });

  it('a roll after the opening is a normal roll, with the version checked', async () => {
    const { server } = setup(3);
    const gameId = server.createGame(ALICE, PLAYERS, 'portes', 15, 1);
    const opened = await openMemoryGame(server, gameId);
    await rejectsWith(
      server.transportFor(PLAYERS[opened.waitingFor as PlayerId]).rollDice({
        gameId,
        expectedVersion: 1,
      }),
      'STALE_VERSION',
    );
  });
});

describe('drafts (#374)', () => {
  it('a late draft gets TIMED_OUT and saves nothing; the time out comes from the clock', async () => {
    const { server, wait } = setup(3);
    const gameId = await startOpened(server, 'portes', 15, 1);
    const before = server.getGame(gameId) as OnlineGameView;
    const late = before.waitingFor as PlayerId;
    const watcher = watch(server.transportFor(PLAYERS[otherSide(late)]), gameId);
    await flush();
    wait(LIVE);
    const moves = pickTurn(before.game, createSeededRng(1)).slice(0, 1);
    await rejectsWith(
      server
        .transportFor(PLAYERS[late])
        .setDraft({ gameId, expectedVersion: before.version, moves }),
      'TIMED_OUT',
    );
    await flush();
    expect(watcher.views).toHaveLength(1);
    expect(server.getGame(gameId)).toEqual(before);
    expect(server.runDueTimeouts()).toBe(1);
  });

  it('a draft changes no list, the version or the clock, and the next step clears it', async () => {
    const { server, wait } = setup(3);
    const gameId = await startOpened(server, 'portes', 15, 1);
    const before = server.getGame(gameId) as OnlineGameView;
    const mover = PLAYERS[before.waitingFor as PlayerId];
    const lists: unknown[] = [];
    const stop = server.transportFor(mover).watchMyGames({ status: 'active' }, (list) => {
      lists.push(list);
    });
    await flush();
    expect(lists).toHaveLength(1);
    const events = server.events(gameId).length;
    wait(1000);
    const moves = pickTurn(before.game, createSeededRng(1));
    await server
      .transportFor(mover)
      .setDraft({ gameId, expectedVersion: before.version, moves: moves.slice(0, 1) });
    await flush();
    const shown = server.getGame(gameId) as OnlineGameView;
    expect(shown).toEqual({ ...before, draft: { seq: 1, moves: moves.slice(0, 1) } });
    expect(lists).toHaveLength(1);
    expect(server.events(gameId)).toHaveLength(events);
    await server.transportFor(mover).sendTurn({ gameId, expectedVersion: before.version, moves });
    await flush();
    expect(server.getGame(gameId)?.draft).toBeNull();
    stop();
  });
});

describe('calls act like a network', () => {
  it('a call changes nothing before the caller code runs on', async () => {
    const { server } = setup();
    const gameId = server.createGame(ALICE, PLAYERS, 'portes', 5, 1);
    const sent = server.transportFor(ALICE).resign(gameId);
    expect(server.getGame(gameId)?.status).toBe('active');
    await sent;
    expect(server.getGame(gameId)?.status).toBe('finished');
  });
});

describe('listMyGames', () => {
  it('lists at most MAX_LISTED_GAMES games, the newest ones', async () => {
    const { server, wait } = setup();
    const ids: string[] = [];
    for (let i = 0; i < MAX_LISTED_GAMES + 2; i++) {
      ids.push(server.createGame(ALICE, PLAYERS, 'portes', 1, 1));
      wait(1);
    }
    const listed = await server.transportFor(ALICE).listMyGames({ status: 'active' });
    expect(listed.map((game) => game.gameId)).toEqual(ids.slice(2).reverse());
  });

  it('gives a copy: changing it changes nothing on the server', async () => {
    const { server } = setup();
    const gameId = server.createGame(ALICE, PLAYERS, 'plakoto', 3, null);
    const transport = server.transportFor(BOB);
    const listed = await transport.listMyGames({ status: 'active' });
    expect(listed).toEqual([
      expect.objectContaining({ gameId, choice: 'plakoto', targetPoints: 3, mySide: 'black' }),
    ]);
    (listed[0] as { score: { white: number } }).score.white = 9;
    const again = await transport.listMyGames({ status: 'active' });
    expect(again[0]?.score).toEqual({ white: 0, black: 0 });
  });

  it('a time out is a change: the game moves to the top', async () => {
    const { server, wait } = setup();
    const first = server.createGame(ALICE, PLAYERS, 'portes', 3, 1);
    wait(1000);
    const second = server.createGame(ALICE, PLAYERS, 'portes', 3, 1);
    wait(LIVE - 500);
    // Only the first game's deadline has passed.
    expect(server.runDueTimeouts()).toBe(1);
    const listed = await server.transportFor(ALICE).listMyGames({ status: 'active' });
    expect(listed.map((game) => game.gameId)).toEqual([first, second]);
    expect(listed[0]?.updatedAt).toBe(START + LIVE);
  });
});

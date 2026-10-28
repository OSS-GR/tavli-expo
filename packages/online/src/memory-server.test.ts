// The in-memory game server: the GameTransport contract, whole matches
// through two transports, and turn timers on a fake clock.

import { describe, expect, it } from 'vitest';

import { ONLINE_GAME_CHOICES, TURN_TIME_MS, isGameTransportErrorData } from '@tavli/contracts';
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
import { motherPin, pickChoice, pickTurn } from './testing';

const ALICE = 'alice';
const BOB = 'bob';
const PLAYERS = { white: ALICE, black: BOB };
const START = Date.UTC(2026, 9, 28, 12, 0, 0);
const LIVE = TURN_TIME_MS.live;

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
  const { server } = setup(7);
  const picker = createSeededRng(8);
  return {
    createGame: async ({ choice, targetPoints, pace }) =>
      server.createGame(ALICE, PLAYERS, choice, targetPoints, pace),
    createMotherQuestion: async () => {
      const gameId = server.createGame(ALICE, PLAYERS, 'plakoto', 1, 'live');
      const plakoto = createOnlineMatch(
        { choice: 'plakoto', targetPoints: 1, players: PLAYERS },
        createSeededRng(1),
      );
      const { flow, pin } = motherPin(plakoto);
      server.setFlowForTest(gameId, flow);
      await server.transportFor(BOB).sendTurn({ gameId, expectedVersion: 1, moves: pin });
      return gameId;
    },
    missingGameId: async () => 'game-404',
    transportFor: (who) => server.transportFor(who === 'stranger' ? 'eve' : PLAYERS[who]),
    legalTurn: (view) => pickTurn(view.game, picker),
  };
}

describe('GameTransport contract (in-memory server)', () => {
  for (const check of gameTransportContract()) {
    it(check.name, () => check.run(contractSubject()));
  }
});

describe('createGame', () => {
  it('starts at version 1 with the first roll and a running clock', () => {
    const { server } = setup();
    const gameId = server.createGame(ALICE, PLAYERS, 'portes', 1, 'live');
    const view = server.getGame(gameId);
    expect(view).toMatchObject({
      gameId,
      version: 1,
      status: 'active',
      turnDeadline: START + LIVE,
    });
    expect(view?.game.state.dice).not.toBeNull();
    expect(server.events(gameId)[0]).toMatchObject({ seq: 0, version: 1, actor: SERVER_ACTOR });
  });

  it('rejects the same checks as the Convex mutation', () => {
    const { server } = setup();
    const codeOf = (players: { white: string; black: string }, caller = ALICE) => {
      try {
        server.createGame(caller, players, 'portes', 1, 'live');
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
    const a = server.createGame(ALICE, PLAYERS, 'portes', 1, 'live');
    const b = server.createGame(BOB, PLAYERS, 'fevga', 1, 'async');
    expect(a).not.toBe(b);
    expect(server.getGame(b)?.choice).toBe('fevga');
  });
});

describe('copies', () => {
  it('getGame and events return copies', () => {
    const { server } = setup();
    const gameId = server.createGame(ALICE, PLAYERS, 'portes', 1, 'live');
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
    const gameId = server.createGame(ALICE, PLAYERS, 'portes', 1, 'live');
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
    await (mine.prompt === null
      ? transports[side].sendTurn({
          gameId,
          expectedVersion: mine.version,
          moves: pickTurn(mine.game, picker),
        })
      : transports[side].sendAnswer({
          gameId,
          expectedVersion: mine.version,
          choice: pickChoice(mine.prompt.choices, picker),
        }));
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
      const gameId = server.createGame(ALICE, PLAYERS, choice, targetPoints, 'live');
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
      // Moves and confirms carry the id of the player who sent them.
      for (const row of log) {
        const event = row.event;
        if (event.type === 'move' || event.type === 'confirm' || event.type === 'answer') {
          expect(row.actor).toBe(PLAYERS[event.player]);
        }
      }
    });
  }
});

describe('turn timers on a fake clock', () => {
  it('runDueTimeouts: nothing before the deadline; at it the late player loses the game', async () => {
    const { server, wait } = setup(3);
    const gameId = server.createGame(ALICE, PLAYERS, 'portes', 15, 'live');
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
    expect(after.match.games[0]).toMatchObject({ winner: otherSide(late), reason: 'timeout' });
    expect(after.game.phase).toBe('moving');
    expect(after.turnDeadline).toBe(START + 2 * LIVE);
    expect(server.events(gameId).find((row) => row.event.type === 'timeout')).toMatchObject({
      actor: SERVER_ACTOR,
      event: { type: 'timeout', player: late },
    });
    // Run again at the same time: nothing is due.
    expect(server.runDueTimeouts()).toBe(0);
  });

  it('runs each check at its deadline, like the Convex scheduler', () => {
    const { server, wait } = setup(3);
    const gameId = server.createGame(ALICE, PLAYERS, 'portes', 15, 'live');
    wait(3 * LIVE);
    expect(server.runDueTimeouts()).toBe(3);
    const view = server.getGame(gameId);
    expect(view?.match.games).toHaveLength(3);
    expect(view?.turnDeadline).toBe(START + 4 * LIVE);
    const again = replay(server.events(gameId).map((row) => row.event));
    expect(again.match).toEqual(view?.match);
  });

  it('the match ends when a time out gives the last point; then no clock runs', () => {
    const { server, wait } = setup(3);
    const gameId = server.createGame(ALICE, PLAYERS, 'portes', 1, 'live');
    wait(10 * LIVE);
    expect(server.runDueTimeouts()).toBe(1);
    const view = server.getGame(gameId);
    expect(view?.status).toBe('finished');
    expect(view?.turnDeadline).toBeNull();
    wait(10 * TURN_TIME_MS.async);
    expect(server.runDueTimeouts()).toBe(0);
  });

  it('a late sendTurn gets TIMED_OUT, and the time out is saved', async () => {
    const { server, wait } = setup(3);
    const gameId = server.createGame(ALICE, PLAYERS, 'portes', 15, 'live');
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
    const gameId = server.createGame(ALICE, PLAYERS, 'portes', 15, 'async');
    const before = server.getGame(gameId) as OnlineGameView;
    wait(TURN_TIME_MS.async - 1);
    await server.transportFor(PLAYERS[before.waitingFor as PlayerId]).sendTurn({
      gameId,
      expectedVersion: before.version,
      moves: pickTurn(before.game, createSeededRng(1)),
    });
    const after = server.getGame(gameId);
    expect(after?.version).toBe(before.version + 1);
    expect(after?.match.games).toHaveLength(0);
    expect(after?.turnDeadline).toBe(START + 2 * TURN_TIME_MS.async - 1);
    expect(server.runDueTimeouts()).toBe(0);
  });

  it('resign ignores the clock and stops it', async () => {
    const { server, wait } = setup(3);
    const gameId = server.createGame(ALICE, PLAYERS, 'portes', 15, 'live');
    wait(5 * LIVE);
    await server.transportFor(BOB).resign(gameId);
    const view = server.getGame(gameId);
    expect(view?.status).toBe('finished');
    expect(view?.match.winner).toBe('white');
    expect(view?.match.games).toHaveLength(0);
    expect(server.runDueTimeouts()).toBe(0);
  });
});

describe('calls act like a network', () => {
  it('a call changes nothing before the caller code runs on', async () => {
    const { server } = setup();
    const gameId = server.createGame(ALICE, PLAYERS, 'portes', 5, 'live');
    const sent = server.transportFor(ALICE).resign(gameId);
    expect(server.getGame(gameId)?.status).toBe('active');
    await sent;
    expect(server.getGame(gameId)?.status).toBe('finished');
  });
});

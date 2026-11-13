// Play ranked on the in-memory server (#529, ADR-0009): two time outs in a
// row by the same player lose the match, the match is rated like any
// other, and a friend game keeps today's rule. The pure rule has its own
// tests (`ranked.test.ts`); these check that the server runs it.

import { describe, expect, it } from 'vitest';

import { RANKED_TURN_TIME_MINUTES } from '@tavli/contracts';
import type { OnlineGameView } from '@tavli/contracts';
import { createSeededRng, replay } from '@tavli/engine';

import { createMemoryGameServer } from './memory-server';
import type { MemoryGameServer } from './memory-server';
import { OnlineGameError } from './online-game';
import { NEW_RATING } from './ratings';
import { openMemoryGame, pickTurn } from './testing';

const ALICE = 'alice';
const BOB = 'bob';
const PLAYERS = { white: ALICE, black: BOB };
const START = Date.UTC(2026, 10, 13, 12, 0, 0);
const TURN_MS = RANKED_TURN_TIME_MINUTES * 60_000;

function setup() {
  let clock = START;
  const server = createMemoryGameServer({ rng: createSeededRng(5), now: () => clock });
  return {
    server,
    wait: (ms: number) => {
      clock += ms;
    },
  };
}

function viewOf(server: MemoryGameServer, gameId: string): OnlineGameView {
  const view = server.getGame(gameId);
  if (view === null) throw new Error('no such game');
  return view;
}

/** Alice plays her turn in time: a roll, then a legal turn (or the pass). */
async function alicePlays(server: MemoryGameServer, gameId: string): Promise<void> {
  const alice = server.transportFor(ALICE);
  let view = viewOf(server, gameId);
  if (view.game.phase === 'awaiting-roll') {
    await alice.rollDice({ gameId, expectedVersion: view.version });
    view = viewOf(server, gameId);
  }
  if (view.waitingFor === 'white' && view.game.phase === 'moving') {
    const moves = pickTurn(view.game, createSeededRng(view.version));
    await alice.sendTurn({ gameId, expectedVersion: view.version, moves });
  }
}

/** Alice plays until the server waits for Bob, then Bob's clock runs out. Returns the view. */
async function bobTimesOut(
  server: MemoryGameServer,
  gameId: string,
  wait: (ms: number) => void,
): Promise<OnlineGameView> {
  for (let i = 0; i < 50 && viewOf(server, gameId).waitingFor === 'white'; i++) {
    await alicePlays(server, gameId);
  }
  expect(viewOf(server, gameId).waitingFor).toBe('black');
  wait(TURN_MS);
  expect(server.runDueTimeouts()).toBe(1);
  return viewOf(server, gameId);
}

async function newGame(server: MemoryGameServer, ranked: boolean): Promise<string> {
  const gameId = server.createGame(ALICE, PLAYERS, 'portes', 5, RANKED_TURN_TIME_MINUTES, {
    ranked,
  });
  await openMemoryGame(server, gameId);
  return gameId;
}

describe('Play ranked on the in-memory server (#529)', () => {
  it('a ranked game says so in the view and in the list', async () => {
    const { server } = setup();
    const ranked = await newGame(server, true);
    const friend = await newGame(server, false);
    expect(viewOf(server, ranked).ranked).toBe(true);
    expect(viewOf(server, friend).ranked).toBe(false);
    const list = await server.transportFor(BOB).listMyGames({ status: 'active' });
    expect(list.find((row) => row.gameId === ranked)?.ranked).toBe(true);
    expect(list.find((row) => row.gameId === friend)?.ranked).toBe(false);
  });

  it(`a ranked game needs ${RANKED_TURN_TIME_MINUTES} minutes per turn`, () => {
    const { server } = setup();
    expect(() => server.createGame(ALICE, PLAYERS, 'portes', 5, 1, { ranked: true })).toThrow(
      OnlineGameError,
    );
    expect(() => server.createGame(ALICE, PLAYERS, 'portes', 5, null, { ranked: true })).toThrow(
      OnlineGameError,
    );
  });

  it('two time outs in a row lose the match; it is rated as a full loss', async () => {
    const { server, wait } = setup();
    server.markSaved(ALICE);
    server.markSaved(BOB);
    const gameId = await newGame(server, true);
    const first = await bobTimesOut(server, gameId, wait);
    expect(first.status).toBe('active');
    expect(first.matchEndReason).toBeNull();
    const second = await bobTimesOut(server, gameId, wait);
    expect(second).toMatchObject({
      status: 'finished',
      waitingFor: null,
      turnDeadline: null,
      matchEndReason: 'timeouts-in-a-row',
    });
    expect(second.match).toMatchObject({ winner: 'white', resignedBy: 'black' });
    expect(second.match.games.filter((game) => game.reason === 'timeout')).toHaveLength(2);
    // The log holds the engine's own actions, and replays.
    const events = server.events(gameId).map((row) => row.event);
    expect(events.slice(-2)).toEqual([
      { type: 'timeout', player: 'black' },
      { type: 'resignMatch', player: 'black' },
    ]);
    expect(replay(events).match).toEqual(second.match);
    // Rated like any finished match.
    const alice = await server.ratingsFor(ALICE).mine();
    const bob = await server.ratingsFor(BOB).mine();
    expect(alice.matches).toBe(1);
    expect(bob.matches).toBe(1);
    expect(alice.rating).toBeGreaterThan(NEW_RATING.rating);
    expect(bob.rating).toBeLessThan(NEW_RATING.rating);
    // No clock runs after the end.
    wait(10 * TURN_MS);
    expect(server.runDueTimeouts()).toBe(0);
  });

  it('a turn played between two time outs keeps the match going', async () => {
    const { server, wait } = setup();
    const gameId = await newGame(server, true);
    await bobTimesOut(server, gameId, wait);
    // Bob plays one turn in time.
    for (let i = 0; i < 50 && viewOf(server, gameId).waitingFor === 'white'; i++) {
      await alicePlays(server, gameId);
    }
    const bob = server.transportFor(BOB);
    let view = viewOf(server, gameId);
    await bob.rollDice({ gameId, expectedVersion: view.version });
    view = viewOf(server, gameId);
    if (view.waitingFor === 'black' && view.game.phase === 'moving') {
      const moves = pickTurn(view.game, createSeededRng(1));
      await bob.sendTurn({ gameId, expectedVersion: view.version, moves });
    }
    const after = await bobTimesOut(server, gameId, wait);
    expect(after.status).toBe('active');
    expect(after.match.resignedBy).toBeNull();
  });

  it("a friend game keeps today's rule: only the games are lost", async () => {
    const { server, wait } = setup();
    const gameId = await newGame(server, false);
    await bobTimesOut(server, gameId, wait);
    const view = await bobTimesOut(server, gameId, wait);
    expect(view.status).toBe('active');
    expect(view.match.score).toEqual({ white: 2, black: 0 });
    expect(view.matchEndReason).toBeNull();
  });
});

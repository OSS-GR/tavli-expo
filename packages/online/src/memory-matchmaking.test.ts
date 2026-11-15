// Play ranked matching on the in-memory server (#531): the Matchmaking
// contract, and what the contract leaves to each server (a matched seek
// that goes after its time, the next UTC day, a guest move).

import { describe, expect, it } from 'vitest';

import {
  MATCHED_SEEK_KEEP_MS,
  RATED_MATCHES_PER_PAIR_PER_DAY,
  SEEK_RANGE_GROW_MS,
} from '@tavli/contracts';
import { matchmakingContract } from '@tavli/contracts/testing';
import type { MatchmakingContractSubject } from '@tavli/contracts/testing';
import { createSeededRng } from '@tavli/engine';

import { createMemoryGameServer } from './memory-server';

const START = Date.UTC(2026, 10, 13, 12, 0, 0);
const DAY = 24 * 60 * 60 * 1000;

function setup() {
  let now = START;
  const server = createMemoryGameServer({ rng: createSeededRng(7), now: () => now });
  for (const player of ['alice', 'bob', 'carol']) server.markSaved(player);
  return {
    server,
    passTime: (ms: number) => {
      now += ms;
    },
  };
}

function contractSubject(): MatchmakingContractSubject {
  const { server, passTime } = setup();
  return {
    idOf: (player) => player,
    matchmakingFor: (player) => server.matchmakingFor(player),
    gamesFor: (player) => server.transportFor(player),
    invitesFor: (player) => server.invitesFor(player),
    safetyFor: (player) => server.safetyFor(player),
    onlineDataFor: (player) => server.onlineDataFor(player),
    setRating: (player, rating) => {
      server.setRatingForTest(player, rating);
      return Promise.resolve();
    },
    advance: (ms) => {
      passTime(ms);
      return Promise.resolve();
    },
    runMatching: () => server.runMatching(),
  };
}

describe('Matchmaking contract (in-memory server)', () => {
  for (const check of matchmakingContract()) {
    it(check.name, () => check.run(contractSubject()));
  }
});

describe('matchmaking on the in-memory server', () => {
  it('forgets a matched seek after its time; the game goes on', async () => {
    const { server, passTime } = setup();
    await server.matchmakingFor('alice').seek({ game: 'portes' });
    await server.matchmakingFor('bob').seek({ game: 'portes' });
    const mine = await server.matchmakingFor('alice').mySeek();
    expect(mine.kind).toBe('matched');
    const gameId = mine.kind === 'matched' ? mine.gameId : '';
    passTime(MATCHED_SEEK_KEEP_MS - 1);
    await server.runMatching();
    expect((await server.matchmakingFor('alice').mySeek()).kind).toBe('matched');
    passTime(1);
    await server.runMatching();
    expect(await server.matchmakingFor('alice').mySeek()).toEqual({ kind: 'none' });
    expect(server.getGame(gameId)?.status).toBe('active');
  });

  it('matches the pair again on the next UTC day', async () => {
    const { server, passTime } = setup();
    const both = async () => {
      await server.matchmakingFor('alice').seek({ game: 'portes' });
      await server.matchmakingFor('bob').seek({ game: 'portes' });
    };
    for (let i = 0; i < RATED_MATCHES_PER_PAIR_PER_DAY; i += 1) {
      await both();
      const mine = await server.matchmakingFor('alice').mySeek();
      if (mine.kind !== 'matched') throw new Error('no match');
      await server.transportFor(i % 2 === 0 ? 'bob' : 'alice').resign(mine.gameId);
    }
    await both();
    expect((await server.matchmakingFor('alice').mySeek()).kind).toBe('waiting');
    passTime(DAY);
    await server.matchmakingFor('alice').cancel();
    await server.matchmakingFor('bob').cancel();
    await both();
    expect((await server.matchmakingFor('alice').mySeek()).kind).toBe('matched');
  });

  it('runs the matching only for live seeks: a seek that ended is gone', async () => {
    const { server, passTime } = setup();
    await server.matchmakingFor('alice').seek({ game: 'fevga' });
    passTime(SEEK_RANGE_GROW_MS);
    await server.runMatching();
    expect((await server.matchmakingFor('bob').lookingCounts()).fevga).toBe(1);
  });
});

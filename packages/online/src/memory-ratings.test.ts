// Ratings on the in-memory server (#407): the Ratings contract, and what
// the contract leaves to each server (the next UTC day, the row cap).

import { describe, expect, it } from 'vitest';

import {
  GLOBAL_BOARD_ROWS,
  MIN_BOARD_MATCHES,
  RATED_MATCHES_PER_PAIR_PER_DAY,
  TERMS_VERSION,
} from '@tavli/contracts';
import { ratingsContract } from '@tavli/contracts/testing';
import type { RatingsContractSubject } from '@tavli/contracts/testing';
import { createSeededRng } from '@tavli/engine';

import { createMemoryGameServer } from './memory-server';
import type { MemoryGameServer } from './memory-server';

const START = Date.UTC(2026, 10, 9, 12, 0, 0);
const DAY = 24 * 60 * 60 * 1000;
const GAME = { choice: 'portes', targetPoints: 3, turnTimeMinutes: null } as const;

function setup() {
  let now = START;
  const server = createMemoryGameServer({ rng: createSeededRng(7), now: () => now });
  return {
    server,
    passTime: (ms: number) => {
      now += ms;
    },
  };
}

function contractSubject(): RatingsContractSubject {
  const { server } = setup();
  for (const player of ['alice', 'bob', 'carol']) server.markSaved(player);
  return {
    idOf: (player) => player,
    ratingsFor: (player) => server.ratingsFor(player),
    invitesFor: (player) => server.invitesFor(player),
    gamesFor: (player) => server.transportFor(player),
    friendsFor: (player) => server.friendsFor(player),
    safetyFor: (player) => server.safetyFor(player),
    usernamesFor: (player) => server.usernamesFor(player, player !== 'guest'),
    onlineDataFor: (player) => server.onlineDataFor(player),
    settle: () => Promise.resolve(),
  };
}

describe('Ratings contract (in-memory server)', () => {
  for (const check of ratingsContract()) {
    it(check.name, () => check.run(contractSubject()));
  }
});

/** `winner` beats `loser`: the loser resigns. */
async function win(server: MemoryGameServer, winner: string, loser: string) {
  const code = await server.invitesFor(winner).createInvite(GAME);
  const gameId = await server.invitesFor(loser).acceptInvite(code);
  await server.transportFor(loser).resign(gameId);
}

describe('ratings on the in-memory server', () => {
  it('counts the pair again on the next UTC day', async () => {
    const { server, passTime } = setup();
    server.markSaved('a');
    server.markSaved('b');
    for (let i = 0; i <= RATED_MATCHES_PER_PAIR_PER_DAY; i += 1) await win(server, 'a', 'b');
    expect((await server.ratingsFor('a').mine()).matches).toBe(RATED_MATCHES_PER_PAIR_PER_DAY);
    passTime(DAY);
    await win(server, 'a', 'b');
    expect((await server.ratingsFor('a').mine()).matches).toBe(RATED_MATCHES_PER_PAIR_PER_DAY + 1);
  });

  it(`shows the top ${GLOBAL_BOARD_ROWS} listed players, with the places of all`, async () => {
    const { server } = setup();
    const count = GLOBAL_BOARD_ROWS + 2;
    const ids = Array.from({ length: count }, (_, i) => `p${String(i).padStart(2, '0')}`);
    for (const id of ids) {
      server.markSaved(id);
      await server
        .usernamesFor(id, true)
        .setMine({ name: `Player${id}`, acceptTerms: TERMS_VERSION, ageChecked: true });
    }
    // Each player wins against the next MIN_BOARD_MATCHES times (in pairs of
    // at most 3 a day): everyone gets enough rated matches.
    for (let i = 0; i < count; i += 1) {
      for (let k = 1; k <= MIN_BOARD_MATCHES; k += 1) {
        await win(server, ids[i] ?? '', ids[(i + k) % count] ?? '');
      }
    }
    const board = await server.ratingsFor('p00').globalBoard();
    expect(board).toHaveLength(GLOBAL_BOARD_ROWS);
    expect(board.map((row) => row.rating)).toEqual(
      [...board.map((row) => row.rating)].sort((a, b) => b - a),
    );
    expect(board[0]?.rank).toBe(1);
    // Blocking the leader drops the row; the others keep their places.
    const leader = board[0]?.playerId ?? '';
    const second = board[1];
    await server.safetyFor('p00').block(leader === 'p00' ? (second?.playerId ?? '') : leader);
    const after = await server.ratingsFor('p00').globalBoard();
    expect(after).toHaveLength(GLOBAL_BOARD_ROWS);
    expect(after.find((row) => row.playerId === (second?.playerId ?? ''))?.rank).toBe(second?.rank);
  });
});

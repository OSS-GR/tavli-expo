// Usernames on the in-memory server (#405): the Usernames contract, and
// what the contract leaves to each server (names in game views, delete).

import { describe, expect, it } from 'vitest';

import { TERMS_VERSION, usernameName } from '@tavli/contracts';
import { usernamesContract } from '@tavli/contracts/testing';
import type { UsernamesContractSubject } from '@tavli/contracts/testing';
import { createSeededRng } from '@tavli/engine';

import { createMemoryGameServer } from './memory-server';

const START = Date.UTC(2026, 10, 9, 12, 0, 0);
const GAME = { choice: 'portes', targetPoints: 3, turnTimeMinutes: null } as const;
const STEP = { acceptTerms: TERMS_VERSION, ageChecked: true } as const;

function setup() {
  let now = START;
  const server = createMemoryGameServer({ rng: createSeededRng(3), now: () => now });
  return {
    server,
    passTime: (ms: number) => {
      now += ms;
    },
  };
}

function contractSubject(): UsernamesContractSubject {
  const { server, passTime } = setup();
  return {
    usernamesFor: (player) =>
      player === null
        ? server.usernamesFor(null, false)
        : server.usernamesFor(player, player !== 'guest'),
    invitesFor: (player) => server.invitesFor(player),
    passTime: async (ms) => {
      passTime(ms);
      await Promise.resolve();
    },
  };
}

describe('Usernames contract (in-memory server)', () => {
  for (const check of usernamesContract()) {
    it(check.name, () => check.run(contractSubject()));
  }
});

describe('usernames on the in-memory server', () => {
  it('shows the username in game views and keeps the guest name of the other side', async () => {
    const { server } = setup();
    await server.usernamesFor('alice', true).setMine({ name: 'Alex', ...STEP });
    const code = await server.invitesFor('alice').createInvite(GAME);
    const gameId = await server.invitesFor('bob').acceptInvite(code);
    const view = server.getGame(gameId);
    expect(view?.names.white).toEqual(usernameName('Alex'));
    expect(view?.names.black?.kind).toBe('guest');
    expect(server.nameOf('alice')).toEqual(usernameName('Alex'));
  });

  it('deletes the username with the data, and frees the name', async () => {
    const { server } = setup();
    await server.usernamesFor('alice', true).setMine({ name: 'Alex', ...STEP });
    await server.onlineDataFor('alice').deleteMyData();
    await expect(server.usernamesFor('alice', true).mine()).rejects.toMatchObject({
      code: 'NOT_SIGNED_IN',
    });
    await expect(
      server.usernamesFor('bob', true).setMine({ name: 'alex', ...STEP }),
    ).resolves.toMatchObject({ name: 'alex' });
  });
});

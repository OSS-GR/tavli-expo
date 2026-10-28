// The invites of the in-memory server (#256): the Invites contract, and
// what the contract leaves to each server (the game an accept starts,
// codes, clashes, a game that cannot start).

import { describe, expect, it } from 'vitest';

import { INVITE_CODE_ALPHABET, isInviteErrorData } from '@tavli/contracts';
import { invitesContract } from '@tavli/contracts/testing';
import type { InvitesContractSubject } from '@tavli/contracts/testing';
import { createSeededRng } from '@tavli/engine';
import type { Rng } from '@tavli/engine';

import { SERVER_ACTOR } from './calls';
import { InviteError, MAX_CODE_TRIES } from './invites';
import { createMemoryGameServer } from './memory-server';

const ALICE = 'alice';
const BOB = 'bob';
const START = Date.UTC(2026, 9, 28, 12, 0, 0);

/** A server on a clock that the test moves by hand. */
function setup(rng: Rng = createSeededRng(1)) {
  let clock = START;
  const server = createMemoryGameServer({ rng, now: () => clock });
  return {
    server,
    wait: (ms: number) => {
      clock += ms;
    },
  };
}

function contractSubject(): InvitesContractSubject {
  const { server, wait } = setup(createSeededRng(5));
  const ids = { inviter: ALICE, friend: BOB, other: 'carol' } as const;
  return {
    inviterId: ALICE,
    createInvite: async ({ choice, targetPoints, pace }) =>
      server.createInvite(ALICE, choice, targetPoints, pace),
    invitesFor: (who) => server.invitesFor(ids[who]),
    passTime: async (ms) => wait(ms),
  };
}

describe('Invites contract (in-memory server)', () => {
  for (const check of invitesContract()) {
    it(check.name, () => check.run(contractSubject()));
  }
});

describe('in-memory invites', () => {
  it('accept starts a game that both players can watch; the inviter plays white', async () => {
    const { server } = setup();
    const code = server.createInvite(ALICE, 'plakoto', 3, 'async');
    const gameId = await server.invitesFor(BOB).acceptInvite(code);
    expect(server.getGame(gameId)).toMatchObject({
      gameId,
      version: 1,
      status: 'active',
      choice: 'plakoto',
      pace: 'async',
      players: { white: ALICE, black: BOB },
    });
    expect(server.getGame(gameId)?.match.rules.match.targetPoints).toBe(3);
    expect(server.getInvite(code)).toMatchObject({ status: 'accepted', gameId });
  });

  it('makes codes from the invite alphabet, one per invite', () => {
    const { server } = setup();
    const codes = Array.from({ length: 20 }, () => server.createInvite(ALICE, 'portes', 1, 'live'));
    expect(new Set(codes).size).toBe(20);
    for (const code of codes) {
      expect(code).toHaveLength(8);
      expect([...code].every((char) => INVITE_CODE_ALPHABET.includes(char))).toBe(true);
    }
  });

  it('draws a new code on a clash, and gives up after MAX_CODE_TRIES', () => {
    // The same value every time: every draw gives the same code.
    const stuck: Rng = { nextUint32: () => 7 };
    const { server } = setup(stuck);
    expect(server.createInvite(ALICE, 'portes', 1, 'live')).toBe('99999999');
    expect(() => server.createInvite(ALICE, 'portes', 1, 'live')).toThrow(
      `no free invite code after ${MAX_CODE_TRIES} tries`,
    );
  });

  it('rejects a bad match length, as the Convex createInvite does', () => {
    const { server } = setup();
    expect(() => server.createInvite(ALICE, 'portes', 0, 'live')).toThrow(InviteError);
    expect(() => server.createInvite(ALICE, 'portes', 1.5, 'live')).toThrow(InviteError);
  });

  it('rejects with plain data, as over a network, not an Error', async () => {
    const { server } = setup();
    const code = server.createInvite(ALICE, 'portes', 1, 'live');
    const reason: unknown = await server
      .invitesFor(ALICE)
      .acceptInvite(code)
      .catch((error: unknown) => error);
    expect(isInviteErrorData(reason)).toBe(true);
    expect(reason).toEqual({ code: 'OWN_INVITE', message: expect.any(String) });
    expect(reason).not.toBeInstanceOf(Error);
  });

  it('keeps the invite open when the game cannot start', async () => {
    const { server } = setup();
    const code = server.createInvite(ALICE, 'portes', 1, 'live');
    // The server actor cannot be a player, so the game check fails.
    const reason: unknown = await server
      .invitesFor(SERVER_ACTOR)
      .acceptInvite(code)
      .catch((error: unknown) => error);
    expect(reason).toEqual({ code: 'BAD_REQUEST', message: expect.any(String) });
    expect(server.getInvite(code)?.status).toBe('open');
    expect(server.getGame('game-1')).toBeNull();
  });

  it('a call changes nothing before the caller code runs on', async () => {
    const { server } = setup();
    const code = server.createInvite(ALICE, 'portes', 1, 'live');
    const sent = server.invitesFor(BOB).declineInvite(code);
    expect(server.getInvite(code)?.status).toBe('open');
    await sent;
    expect(server.getInvite(code)?.status).toBe('declined');
  });

  it('the inviter cancels an open invite; nobody can accept it then', async () => {
    const { server } = setup();
    const code = server.createInvite(ALICE, 'portes', 1, 'live');
    expect(() => server.cancelInvite(BOB, code)).toThrow(
      expect.objectContaining({ code: 'NOT_YOUR_INVITE' }),
    );
    server.cancelInvite(ALICE, code.toLowerCase());
    expect(server.getInvite(code)?.status).toBe('cancelled');
    await expect(server.invitesFor(BOB).acceptInvite(code)).rejects.toMatchObject({
      code: 'INVITE_CLOSED',
    });
    expect(() => server.cancelInvite(ALICE, code)).toThrow(
      expect.objectContaining({ code: 'INVITE_CLOSED' }),
    );
    expect(() => server.cancelInvite(ALICE, 'ABCD2345')).toThrow(
      expect.objectContaining({ code: 'INVITE_NOT_FOUND' }),
    );
  });
});

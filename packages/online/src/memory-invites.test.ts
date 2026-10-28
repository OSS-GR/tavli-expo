// The invites of the in-memory server (#256, #281): the Invites contract,
// and what the contract leaves to each server (the game an accept starts,
// codes, clashes, a game that cannot start, the expiry in runDueTimeouts).

import { describe, expect, it } from 'vitest';

import { INVITE_CODE_ALPHABET, INVITE_TIME_MS, isInviteErrorData } from '@tavli/contracts';
import { invitesContract } from '@tavli/contracts/testing';
import type { InvitesContractSubject } from '@tavli/contracts/testing';
import { createSeededRng } from '@tavli/engine';
import type { Rng } from '@tavli/engine';

import { SERVER_ACTOR } from './calls';
import { InviteError, MAX_CODE_TRIES, MAX_OPEN_INVITES } from './invites';
import { createMemoryGameServer } from './memory-server';

const ALICE = 'alice';
const BOB = 'bob';
const START = Date.UTC(2026, 9, 28, 12, 0, 0);

/** Lets the pending microtasks run (the server answers on later microtasks). */
async function flush(): Promise<void> {
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

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
    invitesFor: (who) => server.invitesFor(ids[who]),
    passTime: async (ms) => {
      wait(ms);
      // The in-memory server runs no timers: this is its `expireInvite`.
      server.runDueTimeouts();
    },
    settle: flush,
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
    // One player per invite: one player may have only MAX_OPEN_INVITES open.
    const codes = Array.from({ length: 20 }, (_, i) =>
      server.createInvite(`player-${i}`, 'portes', 1, 'live'),
    );
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

  it('an invite whose time is up shows expired, but watchers hear of it only in runDueTimeouts', async () => {
    const { server, wait } = setup();
    const code = server.createInvite(ALICE, 'portes', 1, 'live');
    const views: (string | undefined)[] = [];
    const stop = server.invitesFor(ALICE).watchInvite(code, (view) => views.push(view?.status));
    await flush();
    wait(INVITE_TIME_MS);
    expect(server.getInvite(code)?.status).toBe('expired');
    await flush();
    expect(views).toEqual(['open']);
    // Turn time outs are counted; invite expiries are not.
    expect(server.runDueTimeouts()).toBe(0);
    await flush();
    expect(views).toEqual(['open', 'expired']);
    // Once marked, it is not sent again.
    server.runDueTimeouts();
    await flush();
    expect(views).toEqual(['open', 'expired']);
    stop();
  });

  it('watchMyInvites hears of an expiry only in runDueTimeouts, and of invites made on the server', async () => {
    const { server, wait } = setup();
    const lists: string[][] = [];
    const stop = server
      .invitesFor(ALICE)
      .watchMyInvites((list) => lists.push(list.map((view) => view.code)));
    await flush();
    const code = server.createInvite(ALICE, 'portes', 1, 'live');
    await flush();
    expect(lists).toEqual([[], [code]]);
    wait(INVITE_TIME_MS);
    expect(await server.invitesFor(ALICE).listMyInvites()).toEqual([]);
    await flush();
    expect(lists).toEqual([[], [code]]);
    server.runDueTimeouts();
    await flush();
    expect(lists).toEqual([[], [code], []]);
    // Another player's invite does not send the same list again.
    server.createInvite(BOB, 'portes', 1, 'live');
    await flush();
    expect(lists).toHaveLength(3);
    stop();
  });

  it('watchInvite on text that is not a code sends null', async () => {
    const { server } = setup();
    const views: unknown[] = [];
    const stop = server.invitesFor(BOB).watchInvite('ABC', (view) => views.push(view));
    await flush();
    expect(views).toEqual([null]);
    stop();
  });

  it('createInvite through the port: the caller is the inviter, and a bad length draws no code', async () => {
    const draws: number[] = [];
    const seeded = createSeededRng(4);
    const counting: Rng = {
      nextUint32: () => {
        const value = seeded.nextUint32();
        draws.push(value);
        return value;
      },
    };
    const { server } = setup(counting);
    await expect(
      server.invitesFor(BOB).createInvite({ choice: 'fevga', targetPoints: 0, pace: 'live' }),
    ).rejects.toEqual({ code: 'BAD_REQUEST', message: expect.any(String) });
    expect(draws).toEqual([]);
    const code = await server
      .invitesFor(BOB)
      .createInvite({ choice: 'fevga', targetPoints: 3, pace: 'async' });
    expect(server.getInvite(code)).toMatchObject({ from: BOB, choice: 'fevga', status: 'open' });
    expect(await server.invitesFor(BOB).listMyInvites()).toHaveLength(1);
    expect(await server.invitesFor(ALICE).listMyInvites()).toEqual([]);
  });
});

describe('the cap on open invites (#275)', () => {
  /** ALICE makes `MAX_OPEN_INVITES` invites. Returns their codes. */
  function fill(server: ReturnType<typeof setup>['server']): string[] {
    return Array.from({ length: MAX_OPEN_INVITES }, () =>
      server.createInvite(ALICE, 'portes', 1, 'live'),
    );
  }

  const tooMany = expect.objectContaining({ code: 'TOO_MANY_INVITES' });

  it('rejects one more open invite with TOO_MANY_INVITES, and saves nothing', () => {
    const { server } = setup();
    const codes = fill(server);
    expect(() => server.createInvite(ALICE, 'portes', 1, 'live')).toThrow(InviteError);
    expect(() => server.createInvite(ALICE, 'portes', 1, 'live')).toThrow(tooMany);
    // The cap comes first, also for a call with a bad match length.
    expect(() => server.createInvite(ALICE, 'portes', 0, 'live')).toThrow(tooMany);
    for (const code of codes) expect(server.getInvite(code)?.status).toBe('open');
  });

  it('another player is not affected', () => {
    const { server } = setup();
    fill(server);
    expect(server.createInvite(BOB, 'portes', 1, 'live')).toHaveLength(8);
  });

  it('an accepted, declined or cancelled invite frees a place', async () => {
    const { server } = setup();
    const [accepted, declined, cancelled] = fill(server);
    await server.invitesFor(BOB).acceptInvite(accepted!);
    expect(server.createInvite(ALICE, 'portes', 1, 'live')).toHaveLength(8);
    expect(() => server.createInvite(ALICE, 'portes', 1, 'live')).toThrow(tooMany);
    await server.invitesFor(BOB).declineInvite(declined!);
    expect(server.createInvite(ALICE, 'portes', 1, 'live')).toHaveLength(8);
    expect(() => server.createInvite(ALICE, 'portes', 1, 'live')).toThrow(tooMany);
    server.cancelInvite(ALICE, cancelled!);
    expect(server.createInvite(ALICE, 'portes', 1, 'live')).toHaveLength(8);
    expect(() => server.createInvite(ALICE, 'portes', 1, 'live')).toThrow(tooMany);
  });

  it('frees every place at expiresAt, with no timer', () => {
    const { server, wait } = setup();
    fill(server);
    wait(INVITE_TIME_MS - 1);
    expect(() => server.createInvite(ALICE, 'portes', 1, 'live')).toThrow(tooMany);
    wait(1);
    const again = fill(server);
    expect(new Set(again).size).toBe(MAX_OPEN_INVITES);
    expect(() => server.createInvite(ALICE, 'portes', 1, 'live')).toThrow(tooMany);
  });
});

// Delete my online data on the in-memory server (#315): the OnlineData
// contract, and what the contract leaves to each server (watchers, the
// log of the resign, decline after the delete).

import { describe, expect, it } from 'vitest';

import type { InviteView, OnlineGameView } from '@tavli/contracts';
import { onlineDataContract } from '@tavli/contracts/testing';
import type { OnlineDataContractSubject } from '@tavli/contracts/testing';
import { createSeededRng } from '@tavli/engine';

import { createMemoryGameServer } from './memory-server';

const ALICE = 'alice';
const BOB = 'bob';
const START = Date.UTC(2026, 9, 28, 12, 0, 0);
const GAME = { choice: 'portes', targetPoints: 3, turnTimeMinutes: null } as const;

/** Lets the pending microtasks run (the server answers on later microtasks). */
async function flush(): Promise<void> {
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

function setup() {
  return createMemoryGameServer({ rng: createSeededRng(3), now: () => START });
}

function contractSubject(): OnlineDataContractSubject {
  const server = setup();
  const ids = { me: ALICE, friend: BOB } as const;
  return {
    dataFor: (player) =>
      player === null
        ? {
            // The in-memory server has no sign-in: the app's fake gives
            // this answer with nobody signed in (`test/onlineFake.ts`).
            deleteMyData: () =>
              Promise.reject({ code: 'NOT_SIGNED_IN', message: 'nobody is signed in' }),
          }
        : server.onlineDataFor(ids[player]),
    invitesFor: (player) => server.invitesFor(ids[player]),
    gamesFor: (player) => server.transportFor(ids[player]),
  };
}

describe('OnlineData contract (in-memory server)', () => {
  for (const check of onlineDataContract()) {
    it(check.name, async () => check.run(contractSubject()));
  }
});

describe('onlineDataFor', () => {
  it('tells the watchers: the game view shows the resign, the invite turns null', async () => {
    const server = setup();
    const gameCode = await server.invitesFor(ALICE).createInvite(GAME);
    const gameId = await server.invitesFor(BOB).acceptInvite(gameCode);
    const openCode = await server.invitesFor(ALICE).createInvite(GAME);

    const views: OnlineGameView[] = [];
    server.transportFor(BOB).subscribe(gameId, (view) => views.push(view));
    const invites: (InviteView | null)[] = [];
    server.invitesFor(BOB).watchInvite(openCode, (view) => invites.push(view));
    const lists: (readonly InviteView[])[] = [];
    server.invitesFor(ALICE).watchMyInvites((list) => lists.push(list));
    await flush();
    expect(invites.at(-1)?.status).toBe('open');
    expect(lists.at(-1)).toHaveLength(1);

    await server.onlineDataFor(ALICE).deleteMyData();
    await flush();
    expect(views.at(-1)?.status).toBe('finished');
    expect(invites.at(-1)).toBeNull();
    expect(lists.at(-1)).toEqual([]);
    // The resign is in the log, by the deleted player.
    const last = server.events(gameId).at(-1);
    expect(last?.actor).toBe(ALICE);
    expect(last?.event).toEqual({ type: 'resignMatch', player: 'white' });
  });

  it("a deleted player cannot decline an invite; the other player's calls still work", async () => {
    const server = setup();
    const code = await server.invitesFor(BOB).createInvite(GAME);
    await server.onlineDataFor(ALICE).deleteMyData();
    await expect(server.invitesFor(ALICE).declineInvite(code)).rejects.toMatchObject({
      code: 'NOT_SIGNED_IN',
    });
    expect(() => server.createInvite(ALICE, 'portes', 3, null)).toThrow(
      'this account does not exist',
    );
    await expect(server.onlineDataFor(BOB).deleteMyData()).resolves.toBeUndefined();
  });
});

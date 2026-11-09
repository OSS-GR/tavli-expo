// Block and report on the in-memory server (#320): the Safety contract,
// and what the contract leaves to each server (the caps, what a report
// keeps, live views after a block).

import { describe, expect, it } from 'vitest';

import { MAX_BLOCKS, MAX_REPORTS_PER_DAY, REPORT_WINDOW_MS, TERMS_VERSION } from '@tavli/contracts';
import type { OnlineGameView } from '@tavli/contracts';
import { safetyContract } from '@tavli/contracts/testing';
import type { SafetyContractSubject } from '@tavli/contracts/testing';
import { createSeededRng } from '@tavli/engine';

import { createMemoryGameServer } from './memory-server';

const START = Date.UTC(2026, 10, 9, 12, 0, 0);
const GAME = { choice: 'portes', targetPoints: 3, turnTimeMinutes: null } as const;

function setup() {
  let now = START;
  const server = createMemoryGameServer({ rng: createSeededRng(5), now: () => now });
  return {
    server,
    passTime: (ms: number) => {
      now += ms;
    },
  };
}

function contractSubject(): SafetyContractSubject {
  const { server } = setup();
  return {
    idOf: (player) => player,
    safetyFor: (player) => server.safetyFor(player),
    invitesFor: (player) => server.invitesFor(player),
    gamesFor: (player) => server.transportFor(player),
    onlineDataFor: (player) => server.onlineDataFor(player),
    settle: () => Promise.resolve(),
  };
}

describe('Safety contract (in-memory server)', () => {
  for (const check of safetyContract()) {
    it(check.name, () => check.run(contractSubject()));
  }
});

/** Lets the server's microtasks run. */
async function flush() {
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
}

describe('block and report on the in-memory server', () => {
  async function meet(server: ReturnType<typeof setup>['server'], a: string, b: string) {
    const code = await server.invitesFor(a).createInvite(GAME);
    await server.invitesFor(b).declineInvite(code);
  }

  it('caps blocks at MAX_BLOCKS', async () => {
    const { server } = setup();
    const safety = server.safetyFor('me');
    for (let i = 0; i < MAX_BLOCKS; i += 1) {
      await meet(server, `p${i}`, 'me');
      await safety.block(`p${i}`);
    }
    await meet(server, 'last', 'me');
    await expect(safety.block('last')).rejects.toMatchObject({ code: 'TOO_MANY_BLOCKS' });
    // A block that is there already is no new block.
    await expect(safety.block('p0')).resolves.toBeUndefined();
    // A report still goes in when the block list is full.
    await expect(safety.report({ playerId: 'last', reason: 'name' })).resolves.toBeUndefined();
    expect(server.reportsOf()).toHaveLength(1);
    expect(await safety.listBlocked()).toHaveLength(MAX_BLOCKS);
  });

  it('caps reports per day, and counts only the last 24 hours', async () => {
    const { server, passTime } = setup();
    const safety = server.safetyFor('me');
    for (let i = 0; i <= MAX_REPORTS_PER_DAY; i += 1) await meet(server, `p${i}`, 'me');
    for (let i = 0; i < MAX_REPORTS_PER_DAY; i += 1) {
      await safety.report({ playerId: `p${i}`, reason: 'other' });
    }
    const last = { playerId: `p${MAX_REPORTS_PER_DAY}`, reason: 'other' } as const;
    await expect(safety.report(last)).rejects.toMatchObject({ code: 'TOO_MANY_REPORTS' });
    // A repeat of a kept report adds none, so the cap does not stop it.
    await expect(safety.report({ playerId: 'p0', reason: 'name' })).resolves.toBeUndefined();
    passTime(REPORT_WINDOW_MS);
    await expect(safety.report(last)).resolves.toBeUndefined();
    expect(server.reportsOf()).toHaveLength(MAX_REPORTS_PER_DAY + 1);
  });

  it('keeps the reason and the username at the time, once per pair until the owner deletes it', async () => {
    const { server, passTime } = setup();
    await server
      .usernamesFor('bob', true)
      .setMine({ name: 'BadName', acceptTerms: TERMS_VERSION, ageChecked: true });
    await meet(server, 'bob', 'alice');
    const alice = server.safetyFor('alice');
    await alice.report({ playerId: 'bob', reason: 'name' });
    await server.usernamesFor('bob', true).setMine({ name: 'Nicer' });
    await alice.report({ playerId: 'bob', reason: 'harassment' });
    expect(server.reportsOf()).toEqual([
      {
        reporterId: 'alice',
        reportedId: 'bob',
        reason: 'name',
        username: 'BadName',
        createdAt: START,
      },
    ]);
    server.deleteReport('alice', 'bob');
    passTime(1000);
    await alice.report({ playerId: 'bob', reason: 'cheating' });
    expect(server.reportsOf()).toEqual([
      {
        reporterId: 'alice',
        reportedId: 'bob',
        reason: 'cheating',
        username: 'Nicer',
        createdAt: START + 1000,
      },
    ]);
  });

  it('a guest report keeps no username', async () => {
    const { server } = setup();
    await meet(server, 'bob', 'alice');
    await server.safetyFor('alice').report({ playerId: 'bob', reason: 'cheating' });
    expect(server.reportsOf()[0]?.username).toBeNull();
  });

  it('sends the blocker a new view and list at once', async () => {
    const { server } = setup();
    const code = await server.invitesFor('alice').createInvite(GAME);
    const gameId = await server.invitesFor('bob').acceptInvite(code);
    const views: OnlineGameView[] = [];
    const bobViews: OnlineGameView[] = [];
    server.transportFor('alice').subscribe(gameId, (view) => views.push(view));
    server.transportFor('bob').subscribe(gameId, (view) => bobViews.push(view));
    const lists: (string | null)[] = [];
    server
      .transportFor('alice')
      .watchMyGames({ status: 'active' }, (list) =>
        lists.push(list[0]?.opponentName?.kind ?? null),
      );
    await flush();
    expect(views.at(-1)?.names.black).not.toBeNull();
    await server.safetyFor('alice').block('bob');
    await flush();
    expect(views.at(-1)?.names.black).toBeNull();
    expect(lists).toEqual(['guest', null]);
    // Bob gets no new view: nothing changed for him.
    expect(bobViews).toHaveLength(1);
    await server.safetyFor('alice').unblock('bob');
    await flush();
    expect(views.at(-1)?.names.black).not.toBeNull();
  });

  it('account delete removes the reports by and about the player', async () => {
    const { server } = setup();
    await meet(server, 'bob', 'alice');
    await meet(server, 'carol', 'bob');
    await server.safetyFor('alice').report({ playerId: 'bob', reason: 'name' });
    await server.safetyFor('bob').report({ playerId: 'carol', reason: 'other' });
    await server.safetyFor('carol').report({ playerId: 'bob', reason: 'other' });
    await meet(server, 'carol', 'alice');
    await server.safetyFor('alice').report({ playerId: 'carol', reason: 'other' });
    await server.onlineDataFor('bob').deleteMyData();
    expect(server.reportsOf().map((report) => [report.reporterId, report.reportedId])).toEqual([
      ['alice', 'carol'],
    ]);
  });
});

// Moving a guest into an account (#403), run offline with convex-test
// and the Better Auth component's test helper. The users are real rows
// of the component (`authUsers`), so the test can check the guest is gone.

import betterAuthTest from '@convex-dev/better-auth/test';
import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createRecordingPushProvider } from '@tavli/contracts';
import { createSeededRng } from '@tavli/engine';
import { pickTurn } from '@tavli/online/testing';

import { api, components, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { GUEST_GAME_PAGE, GUEST_MOVES_PAGE } from './guestMove';
import { MAX_PUSH_TOKENS_PER_PLAYER } from './model/push';
import { setPushProvider } from './push';
import schema from './schema';
import { authUsers, modules, openGame } from './test.setup';

type Tester = ReturnType<typeof setup>;

function setup() {
  const t = convexTest(schema, modules);
  betterAuthTest.register(t);
  return t;
}

function as(t: Tester, id: string) {
  return t.withIdentity({ subject: id });
}

const START = Date.UTC(2026, 10, 9, 12, 0, 0);

beforeEach(() => {
  vi.stubEnv('BETTER_AUTH_SECRET', 'a-test-secret-that-is-long-enough-0123456789');
  vi.stubEnv('CONVEX_SITE_URL', 'http://127.0.0.1:3211');
  // Every game schedules a turn timer; fake timers keep it from firing.
  vi.useFakeTimers();
  vi.setSystemTime(START);
  setPushProvider(createRecordingPushProvider());
});

afterEach(() => {
  setPushProvider(null);
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

/** Runs the scheduled jobs that are due now, and the ones they schedule, a few rounds deep. */
async function flush(t: Tester, rounds = 12) {
  for (let i = 0; i < rounds; i++) {
    vi.advanceTimersByTime(0);
    await t.finishInProgressScheduledFunctions();
  }
}

/** A guest, a saved account and two other players. */
async function players(t: Tester) {
  const [guest, friend, other] = await authUsers(t, 3);
  const [account] = await authUsers(t, 1, true);
  return { guest: guest!, account: account!, friend: friend!, other: other! };
}

async function createGame(t: Tester, white: string, black: string): Promise<Id<'games'>> {
  return await t.mutation(internal.games.createGame, {
    callerId: white,
    players: { white, black },
    choice: 'portes',
    targetPoints: 3,
    turnTimeMinutes: null,
  });
}

async function move(t: Tester, source: string, target: string) {
  await t.mutation(internal.guestMove.startGuestMove, { source, target });
  await flush(t);
}

async function moveRows(t: Tester, gameId: Id<'games'>) {
  return await t.run(
    async (ctx) =>
      await ctx.db
        .query('moves')
        .withIndex('by_game', (q) => q.eq('gameId', gameId))
        .collect(),
  );
}

async function userRow(t: Tester, id: string) {
  return await t.run(
    async (ctx) =>
      await ctx.runQuery(components.betterAuth.adapter.findOne, {
        model: 'user',
        where: [{ field: '_id', value: id }],
      }),
  );
}

async function sessionRows(t: Tester, userId: string) {
  const result = (await t.run(
    async (ctx) =>
      await ctx.runQuery(components.betterAuth.adapter.findMany, {
        model: 'session',
        where: [{ field: 'userId', value: userId }],
        paginationOpts: { cursor: null, numItems: 10 },
      }),
  )) as { page: unknown[] };
  return result.page;
}

describe('startGuestMove (#403)', () => {
  it('a moved game stays playable for the other player and the account', async () => {
    const t = setup();
    const { guest, account, friend } = await players(t);
    const gameId = await createGame(t, guest, friend);
    await openGame(t, gameId, { white: guest, black: friend });
    const before = await as(t, friend).query(api.games.getGame, { gameId });

    await move(t, guest, account);

    const view = (await as(t, account).query(api.games.getGame, { gameId }))!;
    expect(view.players).toEqual({ white: account, black: friend });
    // The game did not change, so a call on its way still fits.
    expect(view.version).toBe(before!.version);
    const rows = await moveRows(t, gameId);
    expect(rows.some((row) => row.actor === guest)).toBe(false);
    expect(JSON.parse(rows[0]!.event)).toMatchObject({
      type: 'start',
      players: { white: account, black: friend },
    });
    expect(await as(t, account).query(api.games.listMyGames, { status: 'active' })).toHaveLength(1);

    // Whoever the game waits for plays on.
    const side = view.waitingFor!;
    const call = { gameId, expectedVersion: view.version };
    const result = await (view.game.phase === 'awaiting-roll'
      ? as(t, view.players[side]).mutation(api.games.rollDice, call)
      : as(t, view.players[side]).mutation(api.games.makeMove, {
          ...call,
          moves: pickTurn(view.game, createSeededRng(1)),
        }));
    expect(result).toEqual({ ok: true, version: view.version + 1 });
    // The guest is no player any more.
    await expect(as(t, guest).query(api.games.getGame, { gameId })).rejects.toMatchObject({
      data: { code: 'NOT_A_PLAYER' },
    });
  });

  it('deletes the guest, its sessions and its name, and moves its push tokens', async () => {
    const t = setup();
    const { guest, account } = await players(t);
    for (let i = 0; i < MAX_PUSH_TOKENS_PER_PLAYER; i++) {
      await as(t, account).mutation(api.push.registerPushToken, {
        token: `ExponentPushToken[account-${i}]`,
        platform: 'ios',
      });
      vi.advanceTimersByTime(1);
    }
    await as(t, guest).mutation(api.push.registerPushToken, {
      token: 'ExponentPushToken[guest-phone]',
      platform: 'android',
    });
    await t.run(async (ctx) => {
      await ctx.db.insert('playerNames', { playerId: guest, guestNumber: '4821' });
    });

    await move(t, guest, account);

    expect(await userRow(t, guest)).toBeNull();
    expect(await sessionRows(t, guest)).toEqual([]);
    const tokens = await t.run(async (ctx) => await ctx.db.query('pushTokens').collect());
    expect(tokens).toHaveLength(MAX_PUSH_TOKENS_PER_PLAYER);
    expect(tokens.every((row) => row.playerId === account)).toBe(true);
    // The phone in hand now is the guest's: its token stays, the oldest goes.
    expect(tokens.map((row) => row.token)).toContain('ExponentPushToken[guest-phone]');
    expect(tokens.map((row) => row.token)).not.toContain('ExponentPushToken[account-0]');
    const names = await t.run(async (ctx) => await ctx.db.query('playerNames').collect());
    expect(names).toEqual([]);
    // Nothing new can name the guest.
    await expect(
      as(t, guest).mutation(api.invites.createInvite, {
        choice: 'portes',
        targetPoints: 3,
        turnTimeMinutes: null,
      }),
    ).rejects.toMatchObject({ data: { code: 'NOT_SIGNED_IN' } });
  });

  it('a game between the guest and the account ends with the guest resigning', async () => {
    const t = setup();
    const { guest, account } = await players(t);
    const running = await createGame(t, account, guest);
    await openGame(t, running, { white: account, black: guest });
    const finished = await createGame(t, guest, account);
    await as(t, account).mutation(api.games.resign, { gameId: finished });

    await move(t, guest, account);

    const ended = (await as(t, account).query(api.games.getGame, { gameId: running }))!;
    expect(ended.status).toBe('finished');
    expect(ended.match.winner).toBe('white');
    expect(ended.players).toEqual({ white: account, black: guest });
    const kept = (await as(t, account).query(api.games.getGame, { gameId: finished }))!;
    expect(kept.players).toEqual({ white: guest, black: account });
  });

  it('moves invites sent and answered, blocks and reports, and drops pairs and copies', async () => {
    const t = setup();
    const { guest, account, friend, other } = await players(t);
    const open = await as(t, guest).mutation(api.invites.createInvite, {
      choice: 'portes',
      targetPoints: 3,
      turnTimeMinutes: null,
    });
    const theirs = await as(t, friend).mutation(api.invites.createInvite, {
      choice: 'portes',
      targetPoints: 3,
      turnTimeMinutes: null,
    });
    await as(t, guest).mutation(api.invites.declineInvite, { code: theirs });
    await t.run(async (ctx) => {
      const createdAt = Date.now();
      // The guest blocks friend and other; the account blocks other already.
      await ctx.db.insert('blocks', { blockerId: guest, blockedId: friend, createdAt });
      await ctx.db.insert('blocks', { blockerId: guest, blockedId: other, createdAt });
      await ctx.db.insert('blocks', { blockerId: account, blockedId: other, createdAt });
      // A block between the two, and one of the guest by friend.
      await ctx.db.insert('blocks', { blockerId: account, blockedId: guest, createdAt });
      await ctx.db.insert('blocks', { blockerId: friend, blockedId: guest, createdAt });
      await ctx.db.insert('reports', {
        reporterId: friend,
        reportedId: guest,
        reason: 'name',
        createdAt,
      });
      await ctx.db.insert('reports', {
        reporterId: guest,
        reportedId: account,
        reason: 'other',
        createdAt,
      });
    });

    await move(t, guest, account);

    const rows = await t.run(async (ctx) => ({
      invites: await ctx.db.query('invites').collect(),
      blocks: await ctx.db.query('blocks').collect(),
      reports: await ctx.db.query('reports').collect(),
    }));
    expect(rows.invites.find((row) => row.code === open)).toMatchObject({
      from: account,
      status: 'open',
    });
    expect(rows.invites.find((row) => row.code === theirs)).toMatchObject({
      from: friend,
      answeredBy: account,
    });
    expect(rows.blocks.map((row) => [row.blockerId, row.blockedId]).sort()).toEqual(
      [
        [account, friend],
        [account, other],
        [friend, account],
      ].sort(),
    );
    expect(rows.reports.map((row) => [row.reporterId, row.reportedId])).toEqual([
      [friend, account],
    ]);
    expect(
      await as(t, account)
        .query(api.invites.listMyInvites, {})
        .then((list) => list.length),
    ).toBe(1);
  });

  it('moves many games and long logs in pages', async () => {
    const t = setup();
    const { guest, account, friend } = await players(t);
    const games: Id<'games'>[] = [];
    for (let i = 0; i < GUEST_GAME_PAGE + 3; i++) {
      games.push(await (i % 2 === 0 ? createGame(t, guest, friend) : createGame(t, friend, guest)));
    }
    // One game with a log longer than a page.
    await t.run(async (ctx) => {
      for (let seq = 1; seq <= GUEST_MOVES_PAGE + 20; seq++) {
        await ctx.db.insert('moves', {
          gameId: games[0]!,
          seq: 1_000 + seq,
          version: 1,
          actor: guest,
          event: '{"type":"action"}',
        });
      }
    });

    await move(t, guest, account);

    const all = await t.run(async (ctx) => await ctx.db.query('games').collect());
    expect(all.every((game) => game.players.white !== guest && game.players.black !== guest)).toBe(
      true,
    );
    const rows = await moveRows(t, games[0]!);
    expect(rows.length).toBeGreaterThan(GUEST_MOVES_PAGE);
    expect(rows.some((row) => row.actor === guest)).toBe(false);
  });

  it('refuses a source that is no guest, or a target that is one, and changes nothing', async () => {
    const t = setup();
    const { guest, account, friend } = await players(t);
    const gameId = await createGame(t, guest, friend);
    const refused = { data: { code: 'BAD_REQUEST' } };
    await expect(
      t.mutation(internal.guestMove.startGuestMove, { source: account, target: guest }),
    ).rejects.toMatchObject(refused);
    await expect(
      t.mutation(internal.guestMove.startGuestMove, { source: guest, target: friend }),
    ).rejects.toMatchObject(refused);
    await expect(
      t.mutation(internal.guestMove.startGuestMove, { source: guest, target: guest }),
    ).rejects.toMatchObject(refused);
    // A guest with a key claim is being saved: it never moves.
    await t.run(async (ctx) => {
      await ctx.db.insert('authKeys', {
        providerId: 'apple',
        accountId: 'apple-1',
        userId: guest,
        claimedAt: Date.now(),
      });
    });
    await expect(
      t.mutation(internal.guestMove.startGuestMove, { source: guest, target: account }),
    ).rejects.toMatchObject(refused);
    await flush(t);
    expect(await userRow(t, guest)).not.toBeNull();
    const game = await t.run(async (ctx) => await ctx.db.get(gameId));
    expect(game?.players.white).toBe(guest);
  });

  it('when the account goes during the move, the guest’s games and invites go as a deleted player’s', async () => {
    const t = setup();
    const { guest, account, friend } = await players(t);
    const gameId = await createGame(t, guest, friend);
    await openGame(t, gameId, { white: guest, black: friend });
    await as(t, guest).mutation(api.invites.createInvite, {
      choice: 'portes',
      targetPoints: 3,
      turnTimeMinutes: null,
    });

    await t.mutation(internal.guestMove.startGuestMove, { source: guest, target: account });
    // The account is deleted before the pages run.
    await as(t, account).mutation(api.account.deleteMyAccount, {});
    await flush(t);

    const view = (await as(t, friend).query(api.games.getGame, { gameId }))!;
    expect(view.status).toBe('finished');
    expect(view.match.winner).toBe('black');
    expect(view.players).toEqual({ white: guest, black: friend });
    const invites = await t.run(async (ctx) => await ctx.db.query('invites').collect());
    expect(invites).toEqual([]);
  });
});

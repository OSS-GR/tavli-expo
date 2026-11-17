// Download my data (#445), run offline with convex-test and the Better
// Auth component's test helper: what the copy holds, what it never holds,
// and the pages. The contract checks of the port run in
// `convexOnlineData.test.ts`.

import betterAuthTest from '@convex-dev/better-auth/test';
import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MY_DATA_FORMAT, TERMS_VERSION, createRecordingPushProvider } from '@tavli/contracts';

import { api, components } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { MY_DATA_GAMES_PAGE, MY_DATA_ROWS_PAGE } from './myData';
import { setPushProvider } from './push';
import schema from './schema';
import { authUsers, modules, nameUsers } from './test.setup';

type Tester = ReturnType<typeof setup>;

function setup() {
  const t = convexTest(schema, modules);
  betterAuthTest.register(t);
  return t;
}

function as(t: Tester, id: string) {
  return t.withIdentity({ subject: id });
}

const START = Date.UTC(2026, 10, 17, 12, 0, 0);
const GAME = { choice: 'portes', targetPoints: 1, turnTimeMinutes: null } as const;

beforeEach(() => {
  vi.stubEnv('BETTER_AUTH_SECRET', 'a-test-secret-that-is-long-enough-0123456789');
  vi.stubEnv('CONVEX_SITE_URL', 'http://127.0.0.1:3211');
  // Every invite schedules its expiry and every game a turn timer; fake
  // timers keep those (and the pushes) from firing.
  vi.useFakeTimers();
  vi.setSystemTime(START);
  setPushProvider(createRecordingPushProvider());
});

afterEach(() => {
  setPushProvider(null);
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

/** `from` invites, `to` accepts: the new game. */
async function startMatch(t: Tester, from: string, to: string): Promise<Id<'games'>> {
  const code = await as(t, from).mutation(api.invites.createInvite, GAME);
  return (await as(t, to).mutation(api.invites.acceptInvite, { code })) as Id<'games'>;
}

/** An email key for `userId`, as `/key/save` makes it. */
async function addEmailKey(t: Tester, userId: string, email: string): Promise<void> {
  await t.run(async (ctx) => {
    await ctx.runMutation(components.betterAuth.adapter.create, {
      input: {
        model: 'account',
        data: {
          accountId: email,
          providerId: 'email',
          userId,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      },
    });
  });
}

describe('exportMyData', () => {
  it('needs a sign-in, and an account that still exists', async () => {
    const t = setup();
    await expect(t.action(api.myData.exportMyData, {})).rejects.toMatchObject({
      data: { code: 'NOT_SIGNED_IN' },
    });
    await expect(as(t, 'no-such-user').action(api.myData.exportMyData, {})).rejects.toMatchObject({
      data: { code: 'NOT_SIGNED_IN' },
    });
  });

  it("holds the caller's data, and of the others only the names the caller sees", async () => {
    const t = setup();
    const [me = '', friend = '', other = ''] = await authUsers(t, 3, true);
    await addEmailKey(t, me, 'me@example.test');
    await as(t, me).mutation(api.usernames.setMyUsername, {
      name: 'Kafeneio',
      acceptTerms: TERMS_VERSION,
      ageChecked: true,
    });
    await as(t, me).mutation(api.push.registerPushToken, {
      token: 'ExponentPushToken[secret-token]',
      platform: 'ios',
    });
    // A one-point match the friend resigns: a rated win for me.
    const won = await startMatch(t, me, friend);
    await as(t, friend).mutation(api.games.resign, { gameId: won });
    // Friends need a username (#599).
    await nameUsers(t, [friend]);
    await as(t, me).mutation(api.friends.sendFriendRequest, { playerId: friend });
    await as(t, friend).mutation(api.friends.acceptFriendRequest, { playerId: me });
    // A game with the other player, then a report (which blocks too).
    const active = await startMatch(t, other, me);
    await as(t, me).mutation(api.safety.reportPlayer, { playerId: other, reason: 'name' });
    const open = await as(t, me).mutation(api.invites.createInvite, GAME);
    const friendName = await t.run(async (ctx) => {
      const row = await ctx.db
        .query('playerNames')
        .withIndex('by_player', (q) => q.eq('playerId', friend))
        .first();
      return { kind: 'username', name: row?.username };
    });

    const data = await as(t, me).action(api.myData.exportMyData, {});
    expect(data.format).toBe(MY_DATA_FORMAT);
    expect(data.madeAt).toBe(START);
    expect(data.account).toMatchObject({
      kind: 'saved',
      username: 'Kafeneio',
      termsAcceptedAt: START,
      ageCheckedAt: START,
      keys: [{ provider: 'email', email: 'me@example.test', addedAt: START }],
    });
    expect(data.account.termsVersion).toBe(TERMS_VERSION);
    expect(data.rating).toMatchObject({ matches: 1, shownOnBoard: true });
    expect(data.friends).toEqual([{ name: friendName, since: START, wins: 1, losses: 0 }]);
    expect(data.games.map((game) => [game.gameId, game.status]).sort()).toEqual(
      [
        [won, 'finished'],
        [active, 'active'],
      ].sort(),
    );
    // I block the other player: their name shows nowhere.
    expect(data.games.find((game) => game.gameId === active)?.opponentName).toBeNull();
    expect(data.blocks).toEqual([{ name: expect.anything(), blockedAt: START }]);
    expect(data.reports).toEqual([{ reason: 'name', username: null, reportedAt: START }]);
    expect(data.invites.map((invite) => invite.status).sort()).toEqual(['accepted', 'open']);
    expect(data.invites.find((invite) => invite.status === 'open')?.code).toBe(open);
    expect(data.invites.find((invite) => invite.status === 'accepted')?.gameId).toBe(won);
    expect(data.pushTokens).toEqual([{ platform: 'ios', updatedAt: START }]);
    expect(data.rankedSearch).toBeNull();

    const text = JSON.stringify(data);
    expect(text).not.toContain(friend);
    expect(text).not.toContain(other);
    expect(text).not.toContain('secret-token');
  });

  it('an open invite whose time is up says expired, also before the server marks it', async () => {
    const t = setup();
    const [me = ''] = await authUsers(t, 1);
    await as(t, me).mutation(api.invites.createInvite, GAME);
    const { expiresAt } = (await t.run((ctx) => ctx.db.query('invites').first()))!;
    vi.setSystemTime(expiresAt);
    const data = await as(t, me).action(api.myData.exportMyData, {});
    expect(data.invites.map((invite) => invite.status)).toEqual(['expired']);
  });

  it('reads the games and the invites in pages, and misses none', async () => {
    const t = setup();
    const [me = '', friend = ''] = await authUsers(t, 2);
    const gameId = await startMatch(t, me, friend);
    // Copies of the rows, past one page each.
    await t.run(async (ctx) => {
      const { _id, _creationTime, ...game } = (await ctx.db.get(gameId))!;
      const {
        _id: inviteId,
        _creationTime: made,
        ...invite
      } = (await ctx.db.query('invites').first())!;
      for (let i = 0; i < MY_DATA_GAMES_PAGE; i += 1) {
        await ctx.db.insert('games', {
          ...game,
          players: i % 2 === 0 ? game.players : { white: friend, black: me },
        });
      }
      for (let i = 0; i < MY_DATA_ROWS_PAGE; i += 1) {
        await ctx.db.insert('invites', { ...invite, code: `C${String(i).padStart(7, '0')}` });
      }
      void [_id, _creationTime, inviteId, made];
    });
    const data = await as(t, me).action(api.myData.exportMyData, {});
    expect(data.games).toHaveLength(MY_DATA_GAMES_PAGE + 1);
    expect(new Set(data.games.map((game) => game.mySide))).toEqual(new Set(['white', 'black']));
    expect(data.invites).toHaveLength(MY_DATA_ROWS_PAGE + 1);
  });
});

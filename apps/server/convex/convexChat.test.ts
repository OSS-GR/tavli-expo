// Chat (ADR-0011, #692): the Convex adapter (`createConvexChat` in
// `@tavli/backend-convex`) against the real functions, offline. Fake
// Convex clients (`test.network.ts`) run each call through convex-test as
// one signed-in user. The `Chat` contract checks
// (`@tavli/contracts/testing`) run on top. Then what the contract leaves
// to this server: what a row keeps, and that a closed chat reads no text.

import betterAuthTest from '@convex-dev/better-auth/test';
import { convexTest } from 'convex-test';
import { getFunctionName } from 'convex/server';
import type { FunctionArgs, FunctionReturnType } from 'convex/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  CHAT_FUNCTIONS,
  CHAT_FUNCTION_NAMES,
  createConvexChat,
  createConvexInvites,
  createConvexSafety,
} from '@tavli/backend-convex';
import type { ChatFunctions } from '@tavli/backend-convex';
import { CHAT_VIEW_MESSAGES, createRecordingPushProvider } from '@tavli/contracts';
import { CHAT_KEEP_MS } from '@tavli/online';
import { chatContract } from '@tavli/contracts/testing';
import type { ChatContractSubject } from '@tavli/contracts/testing';

import { api, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { CHAT_DELETE_PAGE } from './chat';
import { setPushProvider } from './push';
import schema from './schema';
import { convexTestNetwork } from './test.network';
import type { Tester } from './test.network';
import { authUsers, modules, nameUsers } from './test.setup';

// The players, made by `setup()`: three saved accounts with a username, and a guest.
let ALICE = '';
let BOB = '';
let CAROL = '';
let GIL = '';

async function setup() {
  const t = convexTest(schema, modules);
  betterAuthTest.register(t);
  [ALICE = '', BOB = '', CAROL = ''] = await authUsers(t, 3, true);
  [GIL = ''] = await authUsers(t, 1);
  await nameUsers(t, [ALICE, BOB, CAROL]);
  return t;
}

const START = Date.UTC(2026, 10, 25, 12, 0, 0);
const GAME = { choice: 'portes', targetPoints: 3, turnTimeMinutes: null } as const;

beforeEach(() => {
  // The account delete runs Better Auth's own `deleteUser` (`createAuth(ctx)`).
  vi.stubEnv('BETTER_AUTH_SECRET', 'a-test-secret-that-is-long-enough-0123456789');
  vi.stubEnv('CONVEX_SITE_URL', 'http://127.0.0.1:3211');
  // Invites schedule their expiry and games a turn timer: fake timers keep
  // them from firing.
  vi.useFakeTimers();
  vi.setSystemTime(START);
  setPushProvider(createRecordingPushProvider());
});

afterEach(() => {
  setPushProvider(null);
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

/** Runs the functions scheduled up to now (the pages of a delete or a move). */
async function runScheduled(t: Tester) {
  vi.advanceTimersByTime(0);
  await t.finishInProgressScheduledFunctions();
}

function as(t: Tester, playerId: string) {
  return t.withIdentity({ subject: playerId });
}

/** `from` invites `to`, and `to` accepts. Resolves to the game id. */
async function play(t: Tester, from: string, to: string): Promise<Id<'games'>> {
  const code = await as(t, from).mutation(api.invites.createInvite, GAME);
  return await as(t, to).mutation(api.invites.acceptInvite, { code });
}

async function contractSubject(): Promise<ChatContractSubject> {
  const t = await setup();
  const network = convexTestNetwork(t);
  const ids = { alice: ALICE, bob: BOB, carol: CAROL, gil: GIL } as const;
  // The adapters under test are used for the invites too, so the games
  // start as they do in the app.
  const invites = (player: keyof typeof ids) =>
    createConvexInvites({ client: network.clientFor(ids[player]) });
  const start = async (from: keyof typeof ids, to: keyof typeof ids) =>
    await invites(to).acceptInvite(await invites(from).createInvite(GAME));
  return {
    chatFor: (player) =>
      createConvexChat({ client: network.clientFor(player === null ? null : ids[player]) }),
    safetyFor: (player) => createConvexSafety({ client: network.clientFor(ids[player]) }),
    idOf: (player) => ids[player],
    gameId: await start('alice', 'bob'),
    guestGameId: await start('alice', 'gil'),
    advance: (ms) => {
      // Only the clock moves: no scheduled function (a turn timer) runs.
      vi.setSystemTime(Date.now() + ms);
      return Promise.resolve();
    },
    settle: () => network.settle(),
  };
}

describe('Chat contract (Convex adapter on the real functions)', () => {
  for (const check of chatContract()) {
    it(check.name, async () => check.run(await contractSubject()));
  }
});

/** Type check only: `Actual` fits `Expected`. */
type Extends<Actual, Expected> = Actual extends Expected ? true : false;
function expectType<T extends true>(): T | undefined {
  return undefined;
}

describe('chat on the Convex server', () => {
  it('a message row keeps the game, the sender, the side, the clean text and the time', async () => {
    const t = await setup();
    const gameId = await play(t, ALICE, BOB);
    await as(t, BOB).mutation(api.chat.sendChat, { gameId, text: '  good\n luck ' });
    const rows = await t.run(async (ctx) => await ctx.db.query('chatMessages').collect());
    expect(
      rows.map(({ gameId: game, senderId, text, sentAt, hidden }) => ({
        game,
        senderId,
        text,
        sentAt,
        hidden,
      })),
    ).toEqual([{ game: gameId, senderId: BOB, text: 'good luck', sentAt: START, hidden: false }]);
    const view = await as(t, ALICE).query(api.chat.getChat, { gameId });
    expect(view.messages).toEqual([
      { id: rows[0]?._id, from: rows[0]?.from, text: 'good luck', sentAt: START },
    ]);
  });

  it("keeps a blocked sender's message hidden, also after the unblock", async () => {
    const t = await setup();
    const gameId = await play(t, ALICE, BOB);
    await as(t, ALICE).mutation(api.safety.blockPlayer, { playerId: BOB });
    await as(t, BOB).mutation(api.chat.sendChat, { gameId, text: 'hello?' });
    await as(t, ALICE).mutation(api.safety.unblockPlayer, { playerId: BOB });
    const rows = await t.run(async (ctx) => await ctx.db.query('chatMessages').collect());
    expect(rows.map((row) => row.hidden)).toEqual([true]);
    expect((await as(t, ALICE).query(api.chat.getChat, { gameId })).messages).toEqual([]);
    expect((await as(t, BOB).query(api.chat.getChat, { gameId })).messages).toHaveLength(1);
  });

  it('a view holds only the newest CHAT_VIEW_MESSAGES', async () => {
    const t = await setup();
    const gameId = await play(t, ALICE, BOB);
    // Rows put in directly: the rate limit would need hours of sends.
    await t.run(async (ctx) => {
      for (let i = 0; i < CHAT_VIEW_MESSAGES + 3; i += 1) {
        await ctx.db.insert('chatMessages', {
          gameId,
          senderId: BOB,
          from: 'black',
          text: `message ${i}`,
          sentAt: START + i,
          hidden: false,
        });
      }
    });
    const { messages } = await as(t, ALICE).query(api.chat.getChat, { gameId });
    expect(messages).toHaveLength(CHAT_VIEW_MESSAGES);
    expect(messages[0]?.text).toBe('message 3');
    expect(messages[messages.length - 1]?.text).toBe(`message ${CHAT_VIEW_MESSAGES + 2}`);
  });

  it('the switch is a field of the name row, and on again removes it', async () => {
    const t = await setup();
    const row = async () =>
      await t.run(
        async (ctx) =>
          await ctx.db
            .query('playerNames')
            .withIndex('by_player', (q) => q.eq('playerId', GIL))
            .first(),
      );
    // A guest with no name row yet gets one.
    expect(await row()).toBeNull();
    await as(t, GIL).mutation(api.chat.setChatEnabled, { enabled: false });
    expect((await row())?.chatOff).toBe(true);
    await as(t, GIL).mutation(api.chat.setChatEnabled, { enabled: true });
    expect(await row()).not.toBeNull();
    expect((await row())?.chatOff).toBeUndefined();
  });

  it('a mute is one row per player and game', async () => {
    const t = await setup();
    const gameId = await play(t, ALICE, BOB);
    await as(t, ALICE).mutation(api.chat.setChatMuted, { gameId, muted: true });
    await as(t, ALICE).mutation(api.chat.setChatMuted, { gameId, muted: true });
    const mutes = async () => await t.run(async (ctx) => await ctx.db.query('chatMutes').collect());
    expect((await mutes()).map(({ playerId, gameId: game }) => ({ playerId, game }))).toEqual([
      { playerId: ALICE, game: gameId },
    ]);
    await as(t, ALICE).mutation(api.chat.setChatMuted, { gameId, muted: false });
    expect(await mutes()).toEqual([]);
  });

  /** Every chat row, as the tests compare them. */
  async function chatRows(t: Awaited<ReturnType<typeof setup>>) {
    return await t.run(async (ctx) => ({
      messages: (await ctx.db.query('chatMessages').collect()).map(({ senderId, text }) => ({
        senderId,
        text,
      })),
      mutes: (await ctx.db.query('chatMutes').collect()).map(({ playerId }) => playerId),
    }));
  }

  it("the account delete removes the player's messages and mutes, in pages", async () => {
    const t = await setup();
    const gameId = await play(t, ALICE, BOB);
    await as(t, BOB).mutation(api.chat.sendChat, { gameId, text: 'from bob' });
    await as(t, ALICE).mutation(api.chat.setChatMuted, { gameId, muted: true });
    await as(t, BOB).mutation(api.chat.setChatMuted, { gameId, muted: true });
    // More of Alice's rows than one page holds, put in directly.
    await t.run(async (ctx) => {
      for (let i = 0; i < CHAT_DELETE_PAGE + 5; i += 1) {
        await ctx.db.insert('chatMessages', {
          gameId,
          senderId: ALICE,
          from: 'white',
          text: `message ${i}`,
          sentAt: START + i,
          hidden: false,
        });
      }
    });
    await as(t, ALICE).mutation(api.account.deleteMyAccount, {});
    await runScheduled(t);
    await runScheduled(t);
    expect(await chatRows(t)).toEqual({
      messages: [{ senderId: BOB, text: 'from bob' }],
      mutes: [BOB],
    });
    // The other account is gone, so the chat is closed for Bob.
    expect(await as(t, BOB).query(api.chat.getChat, { gameId })).toEqual({
      gameId,
      status: 'unavailable',
      messages: [],
    });
  });

  it("the guest move gives the guest's mutes to the account, never twice", async () => {
    const t = await setup();
    const [guest = '', other = ''] = await authUsers(t, 2);
    const first = await play(t, BOB, guest);
    const second = await play(t, BOB, other);
    await as(t, guest).mutation(api.chat.setChatMuted, { gameId: first, muted: true });
    await as(t, guest).mutation(api.chat.setChatEnabled, { enabled: false });
    // The account has a mute of its own, and one the guest has too after a row put in directly.
    await as(t, ALICE).mutation(api.chat.setChatEnabled, { enabled: true });
    await t.run(async (ctx) => {
      await ctx.db.insert('chatMutes', { playerId: ALICE, gameId: first });
      await ctx.db.insert('chatMutes', { playerId: guest, gameId: second });
    });
    await t.mutation(internal.guestMove.startGuestMove, { source: guest, target: ALICE });
    await runScheduled(t);
    const mutes = await t.run(async (ctx) => await ctx.db.query('chatMutes').collect());
    expect(
      mutes
        .map(({ playerId, gameId }) => ({ playerId, gameId }))
        .sort((a, b) => a.gameId.localeCompare(b.gameId)),
    ).toEqual(
      [
        { playerId: ALICE, gameId: first },
        { playerId: ALICE, gameId: second },
      ].sort((a, b) => a.gameId.localeCompare(b.gameId)),
    );
    // The account keeps its own switch: the guest's went with the guest.
    expect(await as(t, ALICE).query(api.chat.myChatSettings, {})).toEqual({ enabled: true });
  });

  it("Download my data holds the caller's own messages and switch, never the other player's", async () => {
    const t = await setup();
    const gameId = await play(t, ALICE, BOB);
    await as(t, ALICE).mutation(api.chat.sendChat, { gameId, text: 'first' });
    vi.setSystemTime(START + 1000);
    await as(t, BOB).mutation(api.chat.sendChat, { gameId, text: 'from bob' });
    vi.setSystemTime(START + 2000);
    await as(t, ALICE).mutation(api.chat.sendChat, { gameId, text: 'second' });
    await as(t, ALICE).mutation(api.chat.setChatEnabled, { enabled: false });
    const copy = await as(t, ALICE).action(api.myData.exportMyData, {});
    expect(copy.chat).toEqual({
      enabled: false,
      messages: [
        { gameId, text: 'second', sentAt: START + 2000 },
        { gameId, text: 'first', sentAt: START },
      ],
    });
    expect(JSON.stringify(copy)).not.toContain('from bob');
  });

  it('a match that ends schedules the delete of its chat', async () => {
    const t = await setup();
    const gameId = await play(t, ALICE, BOB);
    await as(t, ALICE).mutation(api.games.resign, { gameId });
    const jobs = await t.run(
      async (ctx) => await ctx.db.system.query('_scheduled_functions').collect(),
    );
    const job = jobs.find((row) => row.name.includes('deleteGameChat'));
    expect(job?.args).toEqual([{ gameId }]);
    expect(job?.scheduledTime).toBe(START + CHAT_KEEP_MS);
  });

  it('the chat of a match is deleted and closed CHAT_KEEP_MS after the match ends', async () => {
    const t = await setup();
    const gameId = await play(t, ALICE, BOB);
    await as(t, ALICE).mutation(api.chat.sendChat, { gameId, text: 'good game' });
    await as(t, BOB).mutation(api.chat.setChatMuted, { gameId, muted: true });
    await as(t, ALICE).mutation(api.games.resign, { gameId });
    // One millisecond before: the chat is open, and a send still works.
    // (Only the clock moves here: a fake timer cannot hold a 30-day delay,
    // so the test runs the scheduled job itself.)
    vi.setSystemTime(START + CHAT_KEEP_MS - 1);
    await as(t, ALICE).mutation(api.chat.sendChat, { gameId, text: 'still here' });
    expect((await as(t, ALICE).query(api.chat.getChat, { gameId })).messages).toHaveLength(2);
    vi.setSystemTime(START + CHAT_KEEP_MS);
    await t.mutation(internal.chat.deleteGameChat, { gameId });
    expect(await chatRows(t)).toEqual({ messages: [], mutes: [] });
    expect(await as(t, ALICE).query(api.chat.getChat, { gameId })).toEqual({
      gameId,
      status: 'unavailable',
      messages: [],
    });
    await expect(
      as(t, ALICE).mutation(api.chat.sendChat, { gameId, text: 'hello?' }),
    ).rejects.toThrow(/CHAT_CLOSED/);
  });

  it('the adapter names the functions of the server api', () => {
    for (const key of Object.keys(CHAT_FUNCTION_NAMES) as (keyof ChatFunctions)[]) {
      expect(getFunctionName(CHAT_FUNCTIONS[key])).toBe(getFunctionName(api.chat[key]));
    }
  });

  it('the server takes the adapter arguments and returns what the adapter expects', () => {
    type Api = typeof api.chat;
    type Fns = ChatFunctions;
    expectType<Extends<FunctionArgs<Api['sendChat']>, FunctionArgs<Fns['sendChat']>>>();
    expectType<Extends<FunctionArgs<Api['setChatMuted']>, FunctionArgs<Fns['setChatMuted']>>>();
    expectType<Extends<FunctionArgs<Fns['setChatEnabled']>, FunctionArgs<Api['setChatEnabled']>>>();
    expectType<Extends<FunctionArgs<Fns['myChatSettings']>, FunctionArgs<Api['myChatSettings']>>>();
    expectType<Extends<FunctionReturnType<Api['getChat']>, FunctionReturnType<Fns['getChat']>>>();
    expectType<Extends<FunctionReturnType<Api['sendChat']>, FunctionReturnType<Fns['sendChat']>>>();
    expectType<
      Extends<FunctionReturnType<Api['myChatSettings']>, FunctionReturnType<Fns['myChatSettings']>>
    >();
    // @ts-expect-error -- a number is not what the call returns.
    expectType<Extends<number, FunctionReturnType<Fns['getChat']>>>();
  });
});

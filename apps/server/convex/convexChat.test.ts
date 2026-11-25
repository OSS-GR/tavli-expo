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
import { chatContract } from '@tavli/contracts/testing';
import type { ChatContractSubject } from '@tavli/contracts/testing';

import { api } from './_generated/api';
import type { Id } from './_generated/dataModel';
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
  // Invites schedule their expiry and games a turn timer: fake timers keep
  // them from firing.
  vi.useFakeTimers();
  vi.setSystemTime(START);
  setPushProvider(createRecordingPushProvider());
});

afterEach(() => {
  setPushProvider(null);
  vi.useRealTimers();
});

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

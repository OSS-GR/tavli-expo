// Push tokens and "your turn" pushes (#280), run offline with convex-test.
// The sender is a recording provider (`setPushProvider`), so no test
// reaches the network. Each push runs as a scheduled action after the
// save: `flush` moves the fake clock by 0 ms and waits for it. Alice and
// Bob are Better Auth users (`authUsers`): `registerPushToken` checks
// that the account exists (#306).

import betterAuthTest from '@convex-dev/better-auth/test';
import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TURN_TIME_MS, createRecordingPushProvider } from '@tavli/contracts';
import type {
  GameTransportErrorCode,
  OnlineGamePace,
  OnlineGameView,
  RecordingPushProvider,
} from '@tavli/contracts';
import { createSeededRng } from '@tavli/engine';
import type { PerPlayer, PlayerId } from '@tavli/engine';
import { loadFlow, storeFlow } from '@tavli/online';
import { motherPin } from '@tavli/online/testing';

import { api, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { MAX_PUSH_TOKENS_PER_PLAYER, PUSH_RETRY_MS, TURN_PUSH_TEXT } from './model/push';
import { setPushProvider } from './push';
import schema from './schema';
import { authUsers, modules, pickTurn } from './test.setup';

// The players: new Better Auth users for each test, made by `setup()`.
let ALICE = '';
let BOB = '';
let PLAYERS: PerPlayer<string> = { white: ALICE, black: BOB };
const ALICE_TOKEN = 'ExponentPushToken[alice-phone]';
const BOB_TOKEN = 'ExponentPushToken[bob-phone]';
const TOKEN_OF: Record<PlayerId, string> = { white: ALICE_TOKEN, black: BOB_TOKEN };

type Tester = Awaited<ReturnType<typeof setup>>;

async function setup() {
  const t = convexTest(schema, modules);
  betterAuthTest.register(t);
  [ALICE = '', BOB = ''] = await authUsers(t, 2);
  PLAYERS = { white: ALICE, black: BOB };
  return t;
}

function as(t: Tester, id: string) {
  return t.withIdentity({ subject: id });
}

const START = Date.UTC(2026, 9, 28, 12, 0, 0);
let push: RecordingPushProvider;

beforeEach(() => {
  // Every game schedules a turn timer; fake timers keep it from firing.
  vi.useFakeTimers();
  vi.setSystemTime(START);
  push = createRecordingPushProvider();
  setPushProvider(push);
});

afterEach(() => {
  setPushProvider(null);
  vi.useRealTimers();
});

/** Runs the pushes the last save scheduled (they run at once, after it). */
async function flush(t: Tester) {
  vi.advanceTimersByTime(0);
  await t.finishInProgressScheduledFunctions();
}

/** Moves the clock by `ms` and runs what is due then. */
async function wait(t: Tester, ms: number) {
  vi.advanceTimersByTime(ms);
  await t.finishInProgressScheduledFunctions();
}

async function rejectsWith(call: Promise<unknown>, code: GameTransportErrorCode) {
  await expect(call).rejects.toMatchObject({ data: { code } });
}

async function register(t: Tester, id: string, token: string) {
  await as(t, id).mutation(api.push.registerPushToken, { token, platform: 'ios' });
}

async function tokenRows(t: Tester) {
  return await t.run(async (ctx) => ctx.db.query('pushTokens').collect());
}

/** The saved tokens, as `player: token`, in order. */
async function tokens(t: Tester): Promise<string[]> {
  return (await tokenRows(t)).map((row) => `${row.playerId}: ${row.token}`).sort();
}

async function createGame(
  t: Tester,
  pace: OnlineGamePace,
  choice: 'portes' | 'plakoto' = 'portes',
  callerId = ALICE,
) {
  return await t.mutation(internal.games.createGame, {
    callerId,
    players: PLAYERS,
    choice,
    targetPoints: 5,
    pace,
  });
}

async function view(t: Tester, gameId: Id<'games'>): Promise<OnlineGameView> {
  const game = await as(t, ALICE).query(api.games.getGame, { gameId });
  if (game === null) throw new Error('no game');
  return game;
}

function waiting(v: OnlineGameView): PlayerId {
  if (v.waitingFor === null) throw new Error('nobody to wait for');
  return v.waitingFor;
}

/** The side the server waits for plays one turn. Returns that side. */
async function playOneTurn(t: Tester, gameId: Id<'games'>): Promise<PlayerId> {
  const v = await view(t, gameId);
  const side = waiting(v);
  await as(t, PLAYERS[side]).mutation(api.games.makeMove, {
    gameId,
    expectedVersion: v.version,
    moves: pickTurn(v.game, createSeededRng(v.version)),
  });
  return side;
}

function otherSide(side: PlayerId): PlayerId {
  return side === 'white' ? 'black' : 'white';
}

async function registerBoth(t: Tester) {
  await register(t, ALICE, ALICE_TOKEN);
  await register(t, BOB, BOB_TOKEN);
}

describe('registerPushToken and removePushToken', () => {
  it('saves the caller’s token once, and removes it', async () => {
    const t = await setup();
    await register(t, ALICE, ALICE_TOKEN);
    vi.setSystemTime(START + 1000);
    await as(t, ALICE).mutation(api.push.registerPushToken, {
      token: ALICE_TOKEN,
      platform: 'android',
    });
    const rows = await tokenRows(t);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      playerId: ALICE,
      token: ALICE_TOKEN,
      platform: 'android',
      updatedAt: START + 1000,
    });
    await as(t, ALICE).mutation(api.push.removePushToken, { token: ALICE_TOKEN });
    expect(await tokens(t)).toEqual([]);
    // Removing it again does nothing.
    await as(t, ALICE).mutation(api.push.removePushToken, { token: ALICE_TOKEN });
  });

  it('needs a sign-in', async () => {
    const t = await setup();
    await rejectsWith(
      t.mutation(api.push.registerPushToken, { token: ALICE_TOKEN, platform: 'ios' }),
      'NOT_SIGNED_IN',
    );
    await rejectsWith(
      t.mutation(api.push.removePushToken, { token: ALICE_TOKEN }),
      'NOT_SIGNED_IN',
    );
  });

  it('registerPushToken refuses a token with no account, and saves nothing (#306)', async () => {
    const t = await setup();
    await rejectsWith(register(t, 'no-such-user', ALICE_TOKEN), 'NOT_SIGNED_IN');
    expect(await tokens(t)).toEqual([]);
  });

  it('rejects a token that is not an Expo push token', async () => {
    const t = await setup();
    for (const token of ['', 'hello', 'ExponentPushToken[]', 'ExponentPushToken[a b]']) {
      await rejectsWith(
        as(t, ALICE).mutation(api.push.registerPushToken, { token, platform: 'ios' }),
        'BAD_REQUEST',
      );
      await rejectsWith(as(t, ALICE).mutation(api.push.removePushToken, { token }), 'BAD_REQUEST');
    }
    expect(await tokens(t)).toEqual([]);
  });

  it('a stranger cannot remove another player’s token', async () => {
    const t = await setup();
    await register(t, ALICE, ALICE_TOKEN);
    await as(t, 'eve').mutation(api.push.removePushToken, { token: ALICE_TOKEN });
    expect(await tokens(t)).toEqual([`${ALICE}: ${ALICE_TOKEN}`]);
  });

  it('a token registered by another player moves to that player', async () => {
    // The phone signed in to another account.
    const t = await setup();
    await register(t, ALICE, ALICE_TOKEN);
    await register(t, BOB, ALICE_TOKEN);
    expect(await tokens(t)).toEqual([`${BOB}: ${ALICE_TOKEN}`]);
  });

  it(`keeps at most ${MAX_PUSH_TOKENS_PER_PLAYER} tokens per player: a new one drops the oldest`, async () => {
    const t = await setup();
    const phone = (i: number) => `ExpoPushToken[phone-${i}]`;
    for (let i = 0; i <= MAX_PUSH_TOKENS_PER_PLAYER; i++) {
      vi.setSystemTime(START + i * 1000);
      await register(t, ALICE, phone(i));
    }
    await register(t, BOB, BOB_TOKEN);
    const mine = (await tokenRows(t)).filter((row) => row.playerId === ALICE);
    expect(mine.map((row) => row.token).sort()).toEqual(
      Array.from({ length: MAX_PUSH_TOKENS_PER_PLAYER }, (_, i) => phone(i + 1)).sort(),
    );

    // A fresh register of an old token makes it the newest: it stays.
    vi.setSystemTime(START + 100_000);
    await register(t, ALICE, phone(1));
    vi.setSystemTime(START + 200_000);
    await register(t, ALICE, phone(99));
    const after = (await tokenRows(t)).filter((row) => row.playerId === ALICE);
    expect(after.map((row) => row.token)).toContain(phone(1));
    expect(after.map((row) => row.token)).not.toContain(phone(2));
    expect(after).toHaveLength(MAX_PUSH_TOKENS_PER_PLAYER);
    // Bob's token is not touched by Alice's cap.
    expect(await tokens(t)).toContain(`${BOB}: ${BOB_TOKEN}`);
  });

  it('the cap never drops the token just registered, even when the others look newer', async () => {
    // Another call's server clock can be ahead: its rows then sort after
    // the new one.
    const t = await setup();
    const phone = (i: number) => `ExpoPushToken[phone-${i}]`;
    await t.run(async (ctx) => {
      for (let i = 0; i < MAX_PUSH_TOKENS_PER_PLAYER; i++) {
        await ctx.db.insert('pushTokens', {
          playerId: ALICE,
          token: phone(i),
          platform: 'ios',
          updatedAt: START + 60_000,
        });
      }
    });
    await register(t, ALICE, ALICE_TOKEN);
    const mine = (await tokenRows(t)).map((row) => row.token);
    expect(mine).toHaveLength(MAX_PUSH_TOKENS_PER_PLAYER);
    expect(mine).toContain(ALICE_TOKEN);
    expect(mine).not.toContain(phone(0));
  });
});

describe('"your turn" pushes', () => {
  it('a turn in an async game sends one push to the other player', async () => {
    const t = await setup();
    const gameId = await createGame(t, 'async');
    await flush(t);
    await registerBoth(t);
    const played = await playOneTurn(t, gameId);
    expect(push.sent).toEqual([]);
    await flush(t);
    expect(push.sent).toEqual([
      {
        to: TOKEN_OF[otherSide(played)],
        title: TURN_PUSH_TEXT.title,
        body: TURN_PUSH_TEXT.body,
        data: { gameId },
        priority: 'high',
        // Kept for the whole turn time, and no longer.
        ttlSeconds: TURN_TIME_MS.async / 1000,
      },
    ]);
    // The push text holds no player ids.
    for (const message of push.sent) {
      for (const id of [ALICE, BOB]) {
        expect(`${message.title} ${message.body} ${message.data.gameId}`).not.toContain(id);
      }
    }

    // The next turn tells the first player.
    push.clear();
    await playOneTurn(t, gameId);
    await flush(t);
    expect(push.sent.map((message) => message.to)).toEqual([TOKEN_OF[played]]);
  });

  it('a live game sends none', async () => {
    const t = await setup();
    await registerBoth(t);
    const gameId = await createGame(t, 'live');
    await playOneTurn(t, gameId);
    await playOneTurn(t, gameId);
    await flush(t);
    expect(push.sent).toEqual([]);
  });

  it('a new async game tells the first player only when they did not start it', async () => {
    const t = await setup();
    await registerBoth(t);
    // The server rolls the opening, so either side may move first.
    for (let i = 0; i < 12; i++) {
      push.clear();
      const callerId = i % 2 === 0 ? ALICE : BOB;
      const gameId = await createGame(t, 'async', 'portes', callerId);
      await flush(t);
      const first = waiting(await view(t, gameId));
      const expected = PLAYERS[first] === callerId ? [] : [TOKEN_OF[first]];
      expect(push.sent.map((message) => message.to)).toEqual(expected);
    }
  });

  it('sends to every phone of the player, and none to a player with no token', async () => {
    const t = await setup();
    const gameId = await createGame(t, 'async');
    await flush(t);
    const side = waiting(await view(t, gameId));
    const other = PLAYERS[otherSide(side)];
    await register(t, other, 'ExponentPushToken[one]');
    vi.setSystemTime(START + 1);
    await register(t, other, 'ExponentPushToken[two]');
    await playOneTurn(t, gameId);
    await flush(t);
    expect(push.sent.map((message) => message.to)).toEqual([
      'ExponentPushToken[two]',
      'ExponentPushToken[one]',
    ]);

    // The first player has no token: the next turn schedules nothing.
    push.clear();
    await playOneTurn(t, gameId);
    const scheduled = await t.run(async (ctx) =>
      ctx.db.system.query('_scheduled_functions').collect(),
    );
    expect(scheduled.filter((job) => job.name.includes('push'))).toHaveLength(1);
    await flush(t);
    expect(push.sent).toEqual([]);
  });

  it('a dead token is removed; the other tokens stay', async () => {
    const t = await setup();
    const gameId = await createGame(t, 'async');
    await flush(t);
    const side = waiting(await view(t, gameId));
    const other = PLAYERS[otherSide(side)];
    const dead = 'ExponentPushToken[old-phone]';
    const live = 'ExponentPushToken[new-phone]';
    await register(t, other, dead);
    await register(t, other, live);
    push.kill(dead);
    await playOneTurn(t, gameId);
    await flush(t);
    expect(push.sent.map((message) => message.to).sort()).toEqual([live, dead].sort());
    expect(await tokens(t)).toEqual([`${other}: ${live}`]);
  });

  it('when the same player waits again (after the mother question), there is no push', async () => {
    const t = await setup();
    const gameId = await createGame(t, 'async', 'plakoto');
    await flush(t);
    const pin = await t.run(async (ctx) => {
      const doc = await ctx.db.get(gameId);
      if (doc === null) throw new Error('no game');
      const pinned = motherPin(loadFlow(doc.flow));
      await ctx.db.patch(gameId, { flow: storeFlow(pinned.flow, null) });
      return pinned.pin;
    });
    await registerBoth(t);
    const before = await view(t, gameId);
    // Black pins White's mother: White must answer. That is White's wait.
    await as(t, BOB).mutation(api.games.makeMove, {
      gameId,
      expectedVersion: before.version,
      moves: [...pin],
    });
    await flush(t);
    expect(push.sent.map((message) => message.to)).toEqual([ALICE_TOKEN]);

    // White plays on and moves next: the wait stays with White, no push.
    push.clear();
    const asked = await view(t, gameId);
    expect(asked.waitingFor).toBe('white');
    await as(t, ALICE).mutation(api.games.answer, {
      gameId,
      expectedVersion: asked.version,
      choice: 'playOn',
    });
    expect((await view(t, gameId)).waitingFor).toBe('white');
    await flush(t);
    expect(push.sent).toEqual([]);
  });

  it('a resign ends the match: no push', async () => {
    const t = await setup();
    const gameId = await createGame(t, 'async');
    await flush(t);
    await registerBoth(t);
    push.clear();
    await as(t, BOB).mutation(api.games.resign, { gameId });
    await flush(t);
    expect(push.sent).toEqual([]);
  });

  it('a late push does nothing: the game changed since', async () => {
    const t = await setup();
    const gameId = await createGame(t, 'async');
    await flush(t);
    await registerBoth(t);
    const v = await view(t, gameId);
    await t.action(internal.push.sendTurnPush, {
      gameId,
      version: v.version - 1,
      playerId: PLAYERS[waiting(v)],
    });
    expect(push.sent).toEqual([]);
    await t.action(internal.push.sendTurnPush, {
      gameId,
      version: v.version,
      playerId: PLAYERS[waiting(v)],
    });
    expect(push.sent.map((message) => message.to)).toEqual([TOKEN_OF[waiting(v)]]);
  });

  it('a push after the turn deadline does nothing: the turn is lost anyway', async () => {
    const t = await setup();
    const gameId = await createGame(t, 'async');
    await flush(t);
    await registerBoth(t);
    await playOneTurn(t, gameId);
    const v = await view(t, gameId);
    // The clock moves, but the scheduled push and time out have not run.
    vi.setSystemTime(START + TURN_TIME_MS.async);
    await t.action(internal.push.sendTurnPush, {
      gameId,
      version: v.version,
      playerId: PLAYERS[waiting(v)],
    });
    expect(push.sent).toEqual([]);
  });

  it('a failed push does not touch the game or the tokens', async () => {
    const t = await setup();
    const gameId = await createGame(t, 'async');
    await flush(t);
    await registerBoth(t);
    setPushProvider({
      send: (messages) =>
        Promise.resolve(
          messages.map(() => ({ ok: false as const, error: 'Failed' as const, message: 'down' })),
        ),
    });
    await playOneTurn(t, gameId);
    await flush(t);
    const v = await view(t, gameId);
    expect(v.version).toBe(2);
    expect(await tokens(t)).toEqual([`${ALICE}: ${ALICE_TOKEN}`, `${BOB}: ${BOB_TOKEN}`]);
  });
  it('a time out that starts the next game tells the side it waits for, the same side too', async () => {
    const t = await setup();
    const gameId = await createGame(t, 'async');
    await flush(t);
    // "alternate": the player who did not start game 1 starts game 2. So
    // when that player runs out of time, game 2 waits for them again.
    await t.run(async (ctx) => {
      const doc = await ctx.db.get(gameId);
      if (doc === null) throw new Error('no game');
      const flow = loadFlow(doc.flow);
      const rules = {
        ...flow.match.rules,
        match: { ...flow.match.rules.match, nextGameStarter: 'alternate' as const },
      };
      await ctx.db.patch(gameId, {
        flow: storeFlow({ ...flow, match: { ...flow.match, rules } }, null),
      });
    });
    await registerBoth(t);
    const starter = await playOneTurn(t, gameId);
    const late = otherSide(starter);
    await flush(t);
    expect(push.sent.map((message) => message.to)).toEqual([TOKEN_OF[late]]);

    push.clear();
    await wait(t, TURN_TIME_MS.async);
    const next = await view(t, gameId);
    expect(next.match.games[0]).toMatchObject({ winner: starter, reason: 'timeout' });
    expect(waiting(next)).toBe(late);
    await flush(t);
    expect(push.sent.map((message) => message.to)).toEqual([TOKEN_OF[late]]);
  });

  it('a time out tells the winner, who starts the next game', async () => {
    const t = await setup();
    const gameId = await createGame(t, 'async');
    await flush(t);
    await registerBoth(t);
    const late = waiting(await view(t, gameId));
    await wait(t, TURN_TIME_MS.async);
    const next = await view(t, gameId);
    expect(next.match.games[0]).toMatchObject({ winner: otherSide(late), reason: 'timeout' });
    expect(waiting(next)).toBe(otherSide(late));
    await flush(t);
    expect(push.sent.map((message) => message.to)).toEqual([TOKEN_OF[otherSide(late)]]);
  });

  it(`a failed push is tried once more after ${PUSH_RETRY_MS / 1000} s, for the failed tokens only`, async () => {
    const t = await setup();
    const gameId = await createGame(t, 'async');
    await flush(t);
    const other = PLAYERS[otherSide(waiting(await view(t, gameId)))];
    const good = 'ExponentPushToken[good-phone]';
    const flaky = 'ExponentPushToken[flaky-phone]';
    await register(t, other, good);
    vi.setSystemTime(START + 1);
    await register(t, other, flaky);
    push.fail(flaky);
    await playOneTurn(t, gameId);
    await flush(t);
    expect(push.sent.map((message) => message.to)).toEqual([flaky, good]);

    push.clear();
    await wait(t, PUSH_RETRY_MS - 1);
    expect(push.sent).toEqual([]);
    await wait(t, 1);
    expect(push.sent.map((message) => message.to)).toEqual([flaky]);
    // The retry keeps the push only for the time left in the turn.
    expect(push.sent[0]?.ttlSeconds).toBe((TURN_TIME_MS.async - PUSH_RETRY_MS) / 1000);

    // It failed again: no third try. A failed token is not removed.
    push.clear();
    await wait(t, PUSH_RETRY_MS * 4);
    expect(push.sent).toEqual([]);
    expect(await tokens(t)).toEqual([`${other}: ${flaky}`, `${other}: ${good}`].sort());
  });

  it('a rate limited push is tried again, and the retry goes out when the service is back', async () => {
    const t = await setup();
    const gameId = await createGame(t, 'async');
    await flush(t);
    await registerBoth(t);
    const side = otherSide(waiting(await view(t, gameId)));
    push.fail(TOKEN_OF[side], 'MessageRateExceeded');
    await playOneTurn(t, gameId);
    await flush(t);
    push.revive(TOKEN_OF[side]);
    push.clear();
    await wait(t, PUSH_RETRY_MS);
    expect(push.sent.map((message) => message.to)).toEqual([TOKEN_OF[side]]);
  });

  it('a retry is dropped when the player has played since', async () => {
    const t = await setup();
    const gameId = await createGame(t, 'async');
    await flush(t);
    const side = otherSide(waiting(await view(t, gameId)));
    await register(t, PLAYERS[side], TOKEN_OF[side]);
    push.fail(TOKEN_OF[side]);
    await playOneTurn(t, gameId);
    await flush(t);
    expect(push.sent).toHaveLength(1);
    // The player opened the app and played before the retry.
    expect(await playOneTurn(t, gameId)).toBe(side);
    await flush(t);
    push.clear();
    await wait(t, PUSH_RETRY_MS);
    expect(push.sent).toEqual([]);
  });
});

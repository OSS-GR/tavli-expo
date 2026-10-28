/**
 * Push tokens and "your turn" pushes (#280, ADR-0004 point 7).
 *
 * The app registers the Expo push token of the phone
 * (`registerPushToken`) and removes it on sign-out (`removePushToken`).
 * Both read the player from the sign-in (`signedInPlayer`); no call takes
 * a player id.
 *
 * When a save in `games.ts` moves the wait to the other player of an
 * async game, it calls `scheduleTurnPush`. That schedules `sendTurnPush`,
 * an action that runs after the save is committed, so a failed push can
 * never fail or undo a move. The action sends "your turn" to the player's
 * tokens through the `PushProvider` port, and removes the tokens the push
 * service calls dead. The pure parts are in `model/push.ts`.
 *
 * The sender is the Expo Push adapter (`@tavli/push-expo`) on `fetch`.
 * Tests swap it with `setPushProvider` (a recording provider), so they
 * never reach the network. See "Push" in
 * `docs/architecture/online-game-service.md`.
 */

import { ConvexError, v } from 'convex/values';

import type { GameTransportErrorCode, OnlineGamePace, PushProvider } from '@tavli/contracts';
import type { PerPlayer } from '@tavli/engine';
import { sideOf } from '@tavli/online';
import { createExpoPushProvider, isExpoPushToken } from '@tavli/push-expo';

import { internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { internalAction, internalMutation, internalQuery, mutation } from './_generated/server';
import type { MutationCtx } from './_generated/server';
import { signedInPlayer } from './caller';
import {
  MAX_PUSH_RETRIES,
  PUSH_RETRY_MS,
  deadTokens,
  retryTokens,
  tokensOverCap,
  turnMessages,
  turnPushSide,
  turnPushTtl,
} from './model/push';
import type { TurnWait } from './model/push';
import { pushPlatform } from './schema';

// ---------------------------------------------------------------------------
// The sender

let provider: PushProvider | null = null;

/**
 * The sender of every push: the Expo Push adapter, made on first use. An
 * Expo access token is not needed now; if push security is ever turned
 * on, set `EXPO_ACCESS_TOKEN` with `npx convex env set` (never in the repo).
 */
function pushProvider(): PushProvider {
  // The adapter cuts off a request after `EXPO_PUSH_TIMEOUT_MS` (10 s):
  // its tokens then get the retry, well before the action's time limit.
  provider ??= createExpoPushProvider({
    fetch: (url, init) => fetch(url, init),
    accessToken: process.env['EXPO_ACCESS_TOKEN'],
  });
  return provider;
}

/**
 * Tests only: swap the sender (`createRecordingPushProvider` from
 * `@tavli/contracts`). `null` goes back to the Expo sender. convex-test
 * runs the actions in the test's own module instance, so the swap
 * reaches `sendTurnPush`. No deployed function calls it.
 */
export function setPushProvider(next: PushProvider | null): void {
  provider = next;
}

// ---------------------------------------------------------------------------
// Tokens

function fail(code: GameTransportErrorCode, message: string): never {
  // A plain object literal, so it fits Convex's `Value` type.
  const data: { code: GameTransportErrorCode; message: string } = { code, message };
  throw new ConvexError(data);
}

function checkToken(token: string): void {
  if (!isExpoPushToken(token)) fail('BAD_REQUEST', 'not an Expo push token');
}

/**
 * Saves the push token of the caller's phone, or marks it as fresh. A
 * token that belonged to another player moves to the caller (the phone
 * signed in to another account). A player keeps at most
 * `MAX_PUSH_TOKENS_PER_PLAYER` tokens: a new one drops the oldest.
 * Rejects a token that is not an Expo push token (`BAD_REQUEST`).
 */
export const registerPushToken = mutation({
  args: { token: v.string(), platform: pushPlatform },
  returns: v.null(),
  handler: async (ctx, { token, platform }) => {
    const playerId = await signedInPlayer(ctx);
    checkToken(token);
    const updatedAt = Date.now();
    const rows = await ctx.db
      .query('pushTokens')
      .withIndex('by_token', (q) => q.eq('token', token))
      .collect();
    let saved = false;
    for (const row of rows) {
      if (row.playerId === playerId && !saved) {
        await ctx.db.patch(row._id, { platform, updatedAt });
        saved = true;
      } else {
        await ctx.db.delete(row._id);
      }
    }
    if (!saved) await ctx.db.insert('pushTokens', { playerId, token, platform, updatedAt });
    const mine = await ctx.db
      .query('pushTokens')
      .withIndex('by_player', (q) => q.eq('playerId', playerId))
      .order('asc')
      .collect();
    for (const row of tokensOverCap(mine, token)) await ctx.db.delete(row._id);
    return null;
  },
});

/**
 * Removes a push token of the caller (for example on sign-out). A token
 * of another player, or one that is not saved, stays as it is: the call
 * does nothing and does not tell which. Rejects a token that is not an
 * Expo push token (`BAD_REQUEST`).
 */
export const removePushToken = mutation({
  args: { token: v.string() },
  returns: v.null(),
  handler: async (ctx, { token }) => {
    const playerId = await signedInPlayer(ctx);
    checkToken(token);
    const rows = await ctx.db
      .query('pushTokens')
      .withIndex('by_token', (q) => q.eq('token', token))
      .collect();
    for (const row of rows) {
      if (row.playerId === playerId) await ctx.db.delete(row._id);
    }
    return null;
  },
});

// ---------------------------------------------------------------------------
// "Your turn"

/** The game fields `scheduleTurnPush` reads. */
export interface PushGame {
  readonly _id: Id<'games'>;
  readonly pace: OnlineGamePace;
  readonly players: PerPlayer<string>;
}

/**
 * Called by every save in `games.ts`, in its transaction, with what the
 * server waited for `before` and `after` the save (`turnWait`) and the
 * player who caused it (`callerId`, or `SERVER_ACTOR` for a time out).
 * When `turnPushSide` picks a side and that player has a push token, it
 * schedules `sendTurnPush` for the saved `version`. It sends nothing
 * itself.
 */
export async function scheduleTurnPush(
  ctx: MutationCtx,
  game: PushGame,
  version: number,
  before: TurnWait,
  after: TurnWait,
  callerId: string,
): Promise<void> {
  const side = turnPushSide(game.pace, before, after, sideOf(game.players, callerId));
  if (side === null) return;
  const playerId = game.players[side];
  // No token, no action: most players have none until the app asks.
  const token = await ctx.db
    .query('pushTokens')
    .withIndex('by_player', (q) => q.eq('playerId', playerId))
    .first();
  if (token === null) return;
  await ctx.scheduler.runAfter(0, internal.push.sendTurnPush, {
    gameId: game._id,
    version,
    playerId,
  });
}

/**
 * The tokens to tell "your turn", newest first: all of the player's, or
 * only those in `only` (a retry), and the game's turn deadline (for the
 * push's time to live). No tokens when the game has changed since
 * `version` (the player already played, or it is over): then the push
 * would be late.
 */
export const turnPushTokens = internalQuery({
  args: {
    gameId: v.id('games'),
    version: v.number(),
    playerId: v.string(),
    only: v.optional(v.array(v.string())),
  },
  returns: v.object({
    tokens: v.array(v.string()),
    turnDeadline: v.union(v.number(), v.null()),
  }),
  handler: async (ctx, { gameId, version, playerId, only }) => {
    const game = await ctx.db.get(gameId);
    if (game === null || game.version !== version || game.status !== 'active') {
      return { tokens: [], turnDeadline: null };
    }
    const rows = await ctx.db
      .query('pushTokens')
      .withIndex('by_player', (q) => q.eq('playerId', playerId))
      .order('desc')
      .collect();
    const all = rows.map((row) => row.token);
    const wanted = only === undefined ? null : new Set(only);
    const tokens = wanted === null ? all : all.filter((token) => wanted.has(token));
    return { tokens, turnDeadline: game.turnDeadline };
  },
});

/** Removes `tokens` of `playerId`: the push service called them dead. */
export const removeDeadTokens = internalMutation({
  args: { playerId: v.string(), tokens: v.array(v.string()) },
  returns: v.null(),
  handler: async (ctx, { playerId, tokens }) => {
    for (const token of tokens) {
      const rows = await ctx.db
        .query('pushTokens')
        .withIndex('by_token', (q) => q.eq('token', token))
        .collect();
      for (const row of rows) {
        if (row.playerId === playerId) await ctx.db.delete(row._id);
      }
    }
    return null;
  },
});

/**
 * Sends "your turn" to the phones of `playerId` (scheduled by
 * `scheduleTurnPush`, after the save), with `high` priority and a time to
 * live up to the turn deadline (`turnPushTtl`; no time left, no push).
 * Removes the dead tokens. A token
 * whose push failed (`Failed`, `MessageRateExceeded`: a busy service or
 * the network) gets one more try after `PUSH_RETRY_MS`: the same action
 * with `attempt` + 1 and only those `tokens`. The version check drops the
 * retry when the player has played since. The push provider never
 * throws; if this action fails anyway, the move is saved.
 */
export const sendTurnPush = internalAction({
  args: {
    gameId: v.id('games'),
    version: v.number(),
    playerId: v.string(),
    /** 0 (or missing) for the first send, 1 for the retry. */
    attempt: v.optional(v.number()),
    /** A retry: only these tokens. */
    tokens: v.optional(v.array(v.string())),
  },
  returns: v.null(),
  handler: async (ctx, { gameId, version, playerId, attempt = 0, tokens: only }) => {
    const { tokens, turnDeadline } = await ctx.runQuery(internal.push.turnPushTokens, {
      gameId,
      version,
      playerId,
      ...(only === undefined ? {} : { only }),
    });
    const ttl = turnPushTtl(turnDeadline, Date.now());
    if (tokens.length === 0 || ttl === null) return null;
    const messages = turnMessages(tokens, gameId, ttl);
    const results = await pushProvider().send(messages);
    const dead = deadTokens(messages, results);
    if (dead.length > 0) {
      await ctx.runMutation(internal.push.removeDeadTokens, { playerId, tokens: dead });
    }
    const retry = retryTokens(messages, results);
    if (retry.length > 0 && attempt < MAX_PUSH_RETRIES) {
      await ctx.scheduler.runAfter(PUSH_RETRY_MS, internal.push.sendTurnPush, {
        gameId,
        version,
        playerId,
        attempt: attempt + 1,
        tokens: retry,
      });
    }
    return null;
  },
});

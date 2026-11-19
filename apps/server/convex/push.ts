/**
 * Push tokens, "your turn" pushes (#280, ADR-0004 point 7) and "game
 * over" pushes (#316).
 *
 * The app registers the Expo push token of the phone
 * (`registerPushToken`) and removes it on sign-out (`removePushToken`).
 * Both read the player from the sign-in (`signedInPlayer`); no call takes
 * a player id. `registerPushToken` also checks that the account still
 * exists (`existingPlayer`, #306), so a deleted account's token cannot
 * save a push token that nothing would remove.
 *
 * When a save in `games.ts` moves the wait to the other player of an
 * async game, it calls `scheduleTurnPush`. That schedules `sendTurnPush`,
 * an action that runs after the save is committed, so a failed push can
 * never fail or undo a move. The action sends "your turn" to the player's
 * tokens through the `PushProvider` port, and removes the tokens the push
 * service calls dead. A save that ends an async match schedules the same
 * action with `kind: 'matchEnd'`: "game over" to the player who did not
 * end it (both players after a time out). A friend invite (#406,
 * `inviteFriend` in `friends.ts`) schedules `sendFriendInvitePush` to
 * the friend. The pure parts are in `model/push.ts`.
 *
 * The sender is the Expo Push adapter (`@tavli/push-expo`) on `fetch`.
 * Tests swap it with `setPushProvider` (a recording provider), so they
 * never reach the network. See "Push" in
 * `docs/architecture/online-game-service.md`.
 */

import { ConvexError, v } from 'convex/values';

import type { GameTransportErrorCode, PushProvider } from '@tavli/contracts';
import type { PerPlayer, PlayerId } from '@tavli/engine';
import { sideOf } from '@tavli/online';
import { createExpoPushProvider, isExpoPushToken } from '@tavli/push-expo';

import { internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { internalAction, internalMutation, internalQuery, mutation } from './_generated/server';
import type { MutationCtx, QueryCtx } from './_generated/server';
import { existingPlayer, signedInPlayer } from './caller';
import {
  MAX_PUSH_RETRIES,
  PUSH_RETRY_MS,
  deadTokens,
  friendInviteMessages,
  friendMessages,
  isNewMatch,
  matchEndPushSides,
  pushMessages,
  pushStillDue,
  retryTokens,
  tokensOverCap,
  turnPushSide,
} from './model/push';
import type { FriendPushKind, PushKind, PushTarget, TurnWait } from './model/push';
import { friendRow, requestRow } from './friendEdges';
import { nameSeenBy } from './safety';
import { pushLocale, pushPlatform } from './schema';

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
 * Rejects a token that is not an Expo push token (`BAD_REQUEST`), and a
 * deleted account (`NOT_SIGNED_IN`).
 */
export const registerPushToken = mutation({
  // `locale` (#631): the language of the phone's pushes. An older build
  // sends none: the row keeps the one it has (English with none).
  args: { token: v.string(), platform: pushPlatform, locale: v.optional(pushLocale) },
  returns: v.null(),
  handler: async (ctx, { token, platform, locale }) => {
    const playerId = await existingPlayer(ctx);
    checkToken(token);
    const updatedAt = Date.now();
    const rows = await ctx.db
      .query('pushTokens')
      .withIndex('by_token', (q) => q.eq('token', token))
      .collect();
    let saved = false;
    for (const row of rows) {
      if (row.playerId === playerId && !saved) {
        await ctx.db.patch(row._id, {
          platform,
          updatedAt,
          ...(locale === undefined ? {} : { locale }),
        });
        saved = true;
      } else {
        await ctx.db.delete(row._id);
      }
    }
    if (!saved) {
      await ctx.db.insert('pushTokens', {
        playerId,
        token,
        platform,
        updatedAt,
        ...(locale === undefined ? {} : { locale }),
      });
    }
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
// "Your turn" and "game over"

/** Which push (`PushKind`): "your turn", a new match (#631) or "game over". */
const pushKind = v.union(v.literal('turn'), v.literal('matchStart'), v.literal('matchEnd'));

/** A player's name (`PlayerName`, contracts), as in `matchmaking.ts`. */
const playerName = v.union(
  v.object({ kind: v.literal('guest'), number: v.string() }),
  v.object({ kind: v.literal('username'), name: v.string() }),
);

/** One phone of a push, as the queries hand it to the actions. */
const pushTarget = v.object({ token: v.string(), locale: pushLocale });

/**
 * The phones of `playerId`, newest first, in the language each saved
 * (English for a row from before #631), or only those in `only` (a retry).
 */
async function targetsOf(
  ctx: QueryCtx,
  playerId: string,
  only: readonly string[] | undefined,
): Promise<PushTarget[]> {
  const rows = await ctx.db
    .query('pushTokens')
    .withIndex('by_player', (q) => q.eq('playerId', playerId))
    .order('desc')
    .collect();
  const wanted = only === undefined ? null : new Set(only);
  return rows
    .filter((row) => wanted === null || wanted.has(row.token))
    .map((row) => ({ token: row.token, locale: row.locale ?? 'en' }));
}

/** The game fields `scheduleTurnPush` reads. */
export interface PushGame {
  readonly _id: Id<'games'>;
  readonly turnTimeMinutes: number | null;
  readonly players: PerPlayer<string>;
}

/**
 * Called by every save in `games.ts`, in its transaction, with what the
 * server waited for `before` and `after` the save (`turnWait`) and the
 * player who caused it (`callerId`, or `SERVER_ACTOR` for a time out).
 * When `turnPushSide` picks a side, that player gets "your turn"; when
 * the save ended an async match, `matchEndPushSides` picks who gets
 * "game over". The two never pick for the same save. For each player
 * with a push token it schedules `sendTurnPush` for the saved `version`.
 * It sends nothing itself.
 */
export async function scheduleTurnPush(
  ctx: MutationCtx,
  game: PushGame,
  version: number,
  before: TurnWait,
  after: TurnWait,
  callerId: string,
): Promise<void> {
  const caller = sideOf(game.players, callerId);
  const turnSide = turnPushSide(before, after, caller);
  if (turnSide !== null) {
    const kind = isNewMatch(before) ? 'matchStart' : 'turn';
    await schedulePush(ctx, game, version, kind, turnSide);
  }
  for (const side of matchEndPushSides(before, after, caller)) {
    await schedulePush(ctx, game, version, 'matchEnd', side);
  }
}

/** Schedules a push of `kind` to the player on `side`, if they have a token. */
async function schedulePush(
  ctx: MutationCtx,
  game: PushGame,
  version: number,
  kind: PushKind,
  side: PlayerId,
): Promise<void> {
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
    kind,
  });
}

/**
 * The phones to send a push of `kind` to, newest first, each with its
 * language: all of the player's, or only those in `only` (a retry), and
 * the game's turn deadline (for the time to live of "your turn"), the
 * other player's name as this player sees it (`nameSeenBy`: `null` when
 * they block them, #631) and whether the game is ranked. No phones when
 * the push is no longer due (`pushStillDue`): "your turn" after the
 * player has played or the match is over, "game over" for a match that is
 * not over, or a game that is gone.
 */
export const turnPushTokens = internalQuery({
  args: {
    gameId: v.id('games'),
    version: v.number(),
    playerId: v.string(),
    // Optional: an action still on the old code during a deploy calls this
    // without `kind`.
    kind: v.optional(pushKind),
    only: v.optional(v.array(v.string())),
  },
  returns: v.object({
    targets: v.array(pushTarget),
    turnDeadline: v.union(v.number(), v.null()),
    name: v.union(playerName, v.null()),
    ranked: v.boolean(),
  }),
  handler: async (ctx, { gameId, version, playerId, kind = 'turn', only }) => {
    const game = await ctx.db.get(gameId);
    if (game === null || !pushStillDue(kind, game, version)) {
      return { targets: [], turnDeadline: null, name: null, ranked: false };
    }
    const targets = await targetsOf(ctx, playerId, only);
    const other = game.players.white === playerId ? game.players.black : game.players.white;
    const name = targets.length === 0 ? null : await nameSeenBy(ctx, playerId, other);
    return { targets, turnDeadline: game.turnDeadline, name, ranked: game.ranked === true };
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
 * Sends a push to the phones of `playerId` (scheduled by
 * `scheduleTurnPush`, after the save). `kind` `turn` (the default) is
 * "your turn", with `high` priority and a time to live up to the turn
 * deadline (`turnPushTtl`; no time left, no push). `matchEnd` is "game
 * over" (#316), with `normal` priority and a time to live of one day
 * (`matchEndMessages`). The name stays `sendTurnPush` for both, and
 * `kind` may be missing, so the jobs scheduled before a deploy still run.
 *
 * Removes the dead tokens. A token whose push failed (`Failed`,
 * `MessageRateExceeded`: a busy service or the network) gets one more
 * try after `PUSH_RETRY_MS`: the same action with `attempt` + 1 and only
 * those `tokens`. The version check (`pushStillDue`) drops a "your turn"
 * retry when the player has played since; a finished match keeps its
 * version, so a "game over" retry goes out. The push provider never
 * throws; if this action fails anyway, the move is saved.
 */
export const sendTurnPush = internalAction({
  args: {
    gameId: v.id('games'),
    version: v.number(),
    playerId: v.string(),
    /** `turn` (or missing) for "your turn", `matchEnd` for "game over". */
    kind: v.optional(pushKind),
    /** 0 (or missing) for the first send, 1 for the retry. */
    attempt: v.optional(v.number()),
    /** A retry: only these tokens. */
    tokens: v.optional(v.array(v.string())),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { gameId, version, playerId, kind = 'turn', attempt = 0, tokens: only } = args;
    const due = await ctx.runQuery(internal.push.turnPushTokens, {
      gameId,
      version,
      playerId,
      kind,
      ...(only === undefined ? {} : { only }),
    });
    if (due.targets.length === 0) return null;
    const messages = pushMessages(kind, due.targets, gameId, due.turnDeadline, Date.now(), {
      name: due.name,
      ranked: due.ranked,
    });
    if (messages.length === 0) return null;
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
        kind,
        attempt: attempt + 1,
        tokens: retry,
      });
    }
    return null;
  },
});

// ---------------------------------------------------------------------------
// Friend invites (#406)

/**
 * Called by `inviteFriend` (`friends.ts`) in its transaction: schedules
 * `sendFriendInvitePush` to `toId` when they have a push token. It sends
 * nothing itself, so a failed push can never undo the invite.
 */
export async function scheduleFriendInvitePush(
  ctx: MutationCtx,
  inviteId: Id<'invites'>,
  toId: string,
): Promise<void> {
  const token = await ctx.db
    .query('pushTokens')
    .withIndex('by_player', (q) => q.eq('playerId', toId))
    .first();
  if (token === null) return;
  await ctx.scheduler.runAfter(0, internal.push.sendFriendInvitePush, { inviteId });
}

/**
 * The friend's phones for a friend invite push, newest first (or only
 * those in `only`, a retry), with the code, the end of the invite and the
 * inviter's name as the friend sees it (#631). No phones when the invite
 * is gone or no longer open.
 */
export const friendInvitePushTokens = internalQuery({
  args: { inviteId: v.id('invites'), only: v.optional(v.array(v.string())) },
  returns: v.union(
    v.object({
      playerId: v.string(),
      code: v.string(),
      expiresAt: v.number(),
      targets: v.array(pushTarget),
      name: v.union(playerName, v.null()),
    }),
    v.null(),
  ),
  handler: async (ctx, { inviteId, only }) => {
    const invite = await ctx.db.get(inviteId);
    if (invite?.status !== 'open' || invite.to === undefined) return null;
    const playerId = invite.to;
    const targets = await targetsOf(ctx, playerId, only);
    const name = targets.length === 0 ? null : await nameSeenBy(ctx, playerId, invite.from);
    return { playerId, code: invite.code, expiresAt: invite.expiresAt, targets, name };
  },
});

/**
 * Sends "<name> invites you to a game" to the friend's phones
 * (`friendInviteMessages`, in each phone's language, #631), with the invite code in the data
 * and a time to live up to the invite's end. Removes the dead tokens and
 * tries the failed ones once more after `PUSH_RETRY_MS`, as
 * `sendTurnPush` does. An invite that was answered, cancelled or expired
 * by then gets no push.
 */
export const sendFriendInvitePush = internalAction({
  args: {
    inviteId: v.id('invites'),
    /** 0 (or missing) for the first send, 1 for the retry. */
    attempt: v.optional(v.number()),
    /** A retry: only these tokens. */
    tokens: v.optional(v.array(v.string())),
  },
  returns: v.null(),
  handler: async (ctx, { inviteId, attempt = 0, tokens: only }) => {
    const due = await ctx.runQuery(internal.push.friendInvitePushTokens, {
      inviteId,
      ...(only === undefined ? {} : { only }),
    });
    if (due === null || due.targets.length === 0) return null;
    const messages = friendInviteMessages(
      due.targets,
      due.code,
      due.expiresAt,
      Date.now(),
      due.name,
    );
    if (messages.length === 0) return null;
    const results = await pushProvider().send(messages);
    const dead = deadTokens(messages, results);
    if (dead.length > 0) {
      await ctx.runMutation(internal.push.removeDeadTokens, {
        playerId: due.playerId,
        tokens: dead,
      });
    }
    const retry = retryTokens(messages, results);
    if (retry.length > 0 && attempt < MAX_PUSH_RETRIES) {
      await ctx.scheduler.runAfter(PUSH_RETRY_MS, internal.push.sendFriendInvitePush, {
        inviteId,
        attempt: attempt + 1,
        tokens: retry,
      });
    }
    return null;
  },
});

// ---------------------------------------------------------------------------
// Friend requests (#631)

/** Which friend push (`FriendPushKind`). */
const friendPushKind = v.union(v.literal('friendRequest'), v.literal('friendAccepted'));

/**
 * Called by the friend functions (`friends.ts`) in their transaction:
 * schedules `sendFriendPush` to `toId` about `fromId` when `toId` has a
 * push token. `friendRequest`: `fromId` asked `toId`. `friendAccepted`:
 * `fromId` accepted the request of `toId` (or asked back, which makes them
 * friends). It sends nothing itself, so a failed push can never undo the
 * request.
 */
export async function scheduleFriendPush(
  ctx: MutationCtx,
  kind: FriendPushKind,
  toId: string,
  fromId: string,
): Promise<void> {
  const token = await ctx.db
    .query('pushTokens')
    .withIndex('by_player', (q) => q.eq('playerId', toId))
    .first();
  if (token === null) return;
  await ctx.scheduler.runAfter(0, internal.push.sendFriendPush, { kind, toId, fromId });
}

/**
 * The phones of `toId` for a friend push (or only those in `only`, a
 * retry), with the name of `fromId` as `toId` sees it. No phones when the
 * push is no longer due: the request was answered, taken back or
 * declined, or the two are no longer friends (a block ends both).
 */
export const friendPushTokens = internalQuery({
  args: {
    kind: friendPushKind,
    toId: v.string(),
    fromId: v.string(),
    only: v.optional(v.array(v.string())),
  },
  returns: v.object({ targets: v.array(pushTarget), name: v.union(playerName, v.null()) }),
  handler: async (ctx, { kind, toId, fromId, only }) => {
    const due =
      kind === 'friendRequest'
        ? (await requestRow(ctx, fromId, toId))?.status === 'open'
        : (await friendRow(ctx, toId, fromId)) !== null;
    if (!due) return { targets: [], name: null };
    const targets = await targetsOf(ctx, toId, only);
    const name = targets.length === 0 ? null : await nameSeenBy(ctx, toId, fromId);
    return { targets, name };
  },
});

/**
 * Sends a friend push (`friendMessages`: "<name> wants to be your friend"
 * or "<name> accepted your friend request", in each phone's language) to
 * the phones of `toId`; a tap opens Friends. Removes the dead tokens and
 * tries the failed ones once more after `PUSH_RETRY_MS`, as
 * `sendTurnPush` does.
 */
export const sendFriendPush = internalAction({
  args: {
    kind: friendPushKind,
    toId: v.string(),
    fromId: v.string(),
    /** 0 (or missing) for the first send, 1 for the retry. */
    attempt: v.optional(v.number()),
    /** A retry: only these tokens. */
    tokens: v.optional(v.array(v.string())),
  },
  returns: v.null(),
  handler: async (ctx, { kind, toId, fromId, attempt = 0, tokens: only }) => {
    const due = await ctx.runQuery(internal.push.friendPushTokens, {
      kind,
      toId,
      fromId,
      ...(only === undefined ? {} : { only }),
    });
    if (due.targets.length === 0) return null;
    const messages = friendMessages(kind, due.targets, due.name);
    const results = await pushProvider().send(messages);
    const dead = deadTokens(messages, results);
    if (dead.length > 0) {
      await ctx.runMutation(internal.push.removeDeadTokens, { playerId: toId, tokens: dead });
    }
    const retry = retryTokens(messages, results);
    if (retry.length > 0 && attempt < MAX_PUSH_RETRIES) {
      await ctx.scheduler.runAfter(PUSH_RETRY_MS, internal.push.sendFriendPush, {
        kind,
        toId,
        fromId,
        attempt: attempt + 1,
        tokens: retry,
      });
    }
    return null;
  },
});

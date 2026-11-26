/**
 * Chat in online games (ADR-0011, epic #692): the two players of a game
 * write short text messages to each other.
 *
 * - `getChat`: the chat of a game as the caller sees it (`ChatView`).
 * - `sendChat`: one message, after the checks.
 * - `setChatMuted`: hide or show the chat of one game for the caller.
 * - `myChatSettings`, `setChatEnabled`: the caller's switch for all games
 *   (`playerNames.chatOff`).
 *
 * The rules are in `@tavli/online` (`chat.ts`: `chatStatus`,
 * `planChatMessage`, `chatSeenBy`), which the in-memory server runs too:
 * never copy them here. This file adds the database.
 *
 * Only a saved account with a username and the current terms may chat,
 * and only when both players may. A player who blocks the other sees no
 * chat; the blocked player is never told, and their message is kept
 * `hidden`. The text of a message never goes to analytics, pushes or
 * logs: never log one here.
 *
 * How long the rows live:
 * - `deleteGameChat` runs `CHAT_KEEP_MS` after a match ends (`games.ts`
 *   schedules it): the messages and the mutes of the game, in pages. From
 *   then on the chat is closed (`chatExpired`), so no new row comes.
 * - `deleteChatRows` runs after an account delete: the player's messages
 *   and mutes, in pages. The switch goes with the name row.
 * - `moveGuestChat` runs in a guest move (#403): the guest's mutes become
 *   the account's. A guest has no messages, but a row would move too.
 *
 * The owner's tools (ADR-0011 item 14) are internal functions, run from
 * the Convex dashboard, never public: `banChatForOwner`,
 * `unbanChatForOwner` and `deleteChatMessagesForOwner`. A report from a
 * chat keeps the reported messages in its `reports` row (`safety.ts`).
 */

import { ConvexError, v } from 'convex/values';

import { CHAT_RATE_WINDOW_MS, CHAT_VIEW_MESSAGES } from '@tavli/contracts';
import type {
  ChatErrorCode,
  ChatMessage,
  ChatSettings,
  ChatStatus,
  ChatView,
} from '@tavli/contracts';
import type { PlayerId } from '@tavli/engine';
import {
  chatBanned,
  chatExpired,
  chatGameNumber,
  chatSeenBy,
  chatStatus,
  loadStored,
  planChatMessage,
  sideOf,
} from '@tavli/online';
import type { ChatPlayer, StoredChatMessage } from '@tavli/online';

import type { Doc, Id } from './_generated/dataModel';
import { internal } from './_generated/api';
import { internalMutation, mutation, query } from './_generated/server';
import type { QueryCtx } from './_generated/server';
import { authComponent } from './auth';
import { existingPlayer, signedInPlayer } from './caller';
import { ensureGuestNumber, nameRowOf } from './playerNames';
import { blocks } from './safety';

/** Throws a `ConvexError` with `ChatErrorData`, so clients get the code. */
function fail(code: ChatErrorCode, message: string): never {
  // A plain object literal, so it fits Convex's `Value` type.
  const data: { code: ChatErrorCode; message: string } = { code, message };
  throw new ConvexError(data);
}

/** The chat ban of `playerId`, or `null`. */
export async function banRow(ctx: QueryCtx, playerId: string) {
  return await ctx.db
    .query('chatBans')
    .withIndex('by_player', (q) => q.eq('playerId', playerId))
    .first();
}

/** What the chat rules need to know about `playerId`. */
async function chatPlayerOf(ctx: QueryCtx, playerId: string): Promise<ChatPlayer> {
  const [user, row, ban] = await Promise.all([
    authComponent.getAnyUserById(ctx, playerId),
    nameRowOf(ctx, playerId),
    banRow(ctx, playerId),
  ]);
  return {
    saved: user !== null && user.isAnonymous !== true,
    hasUsername: row?.username !== undefined,
    termsVersion: row?.termsVersion ?? null,
    enabled: row?.chatOff !== true,
    banned: chatBanned(ban?.until, Date.now()),
  };
}

interface Seat {
  readonly game: Doc<'games'>;
  readonly side: PlayerId;
  readonly otherId: string;
}

/** The game and the caller's side in it. */
async function seatOf(ctx: QueryCtx, callerId: string, gameId: Id<'games'>): Promise<Seat> {
  const game = await ctx.db.get(gameId);
  if (game === null) fail('GAME_NOT_FOUND', 'no such game');
  const side = sideOf(game.players, callerId);
  if (side === null) fail('NOT_A_PLAYER', 'you are not a player of this game');
  return { game, side, otherId: game.players[side === 'white' ? 'black' : 'white'] };
}

async function muteRow(ctx: QueryCtx, playerId: string, gameId: Id<'games'>) {
  return await ctx.db
    .query('chatMutes')
    .withIndex('by_player', (q) => q.eq('playerId', playerId).eq('gameId', gameId))
    .first();
}

/** `chatStatus` of the game for `callerId`. */
async function statusOf(ctx: QueryCtx, callerId: string, seat: Seat): Promise<ChatStatus> {
  const [me, other, mute, blocksOther] = await Promise.all([
    chatPlayerOf(ctx, callerId),
    chatPlayerOf(ctx, seat.otherId),
    muteRow(ctx, callerId, seat.game._id),
    blocks(ctx, callerId, seat.otherId),
  ]);
  const { game } = seat;
  return chatStatus({
    me,
    other,
    muted: mute !== null,
    blocksOther,
    // Rows from before `updatedAt` existed have none: their creation time stands in.
    expired: chatExpired(
      game.status === 'finished' ? (game.updatedAt ?? game._creationTime) : null,
      Date.now(),
    ),
  });
}

function stored(row: Doc<'chatMessages'>): StoredChatMessage {
  return {
    id: row._id,
    from: row.from,
    text: row.text,
    sentAt: row.sentAt,
    // A row from before the server kept the game number counts as game 1.
    game: row.game ?? 1,
    hidden: row.hidden,
  };
}

export const getChat = query({
  args: { gameId: v.id('games') },
  handler: async (ctx, { gameId }): Promise<ChatView> => {
    const callerId = await signedInPlayer(ctx);
    const seat = await seatOf(ctx, callerId, gameId);
    const status = await statusOf(ctx, callerId, seat);
    // A closed chat reads no message row: the text never reaches the phone.
    if (status !== 'open') return { gameId, status, messages: [] };
    // The newest rows the caller may see, newest first, up to the view's cap.
    const seen: StoredChatMessage[] = [];
    const rows = ctx.db
      .query('chatMessages')
      .withIndex('by_game', (q) => q.eq('gameId', gameId))
      .order('desc');
    for await (const row of rows) {
      if (row.hidden && row.from !== seat.side) continue;
      seen.push(stored(row));
      if (seen.length >= CHAT_VIEW_MESSAGES) break;
    }
    // Oldest first again, so two messages of the same millisecond keep their order.
    return { gameId, status, messages: chatSeenBy(seen.reverse(), seat.side, status) };
  },
});

export const sendChat = mutation({
  args: { gameId: v.id('games'), text: v.string() },
  handler: async (ctx, { gameId, text }): Promise<ChatMessage> => {
    const callerId = await existingPlayer(ctx);
    const seat = await seatOf(ctx, callerId, gameId);
    const now = Date.now();
    // Only the last minute counts for the rate limit: a game has no cap.
    const recent = await ctx.db
      .query('chatMessages')
      .withIndex('by_game_sender', (q) =>
        q
          .eq('gameId', gameId)
          .eq('senderId', callerId)
          .gt('sentAt', now - CHAT_RATE_WINDOW_MS),
      )
      .collect();
    const plan = planChatMessage({
      text,
      status: await statusOf(ctx, callerId, seat),
      sentTimes: recent.map((row) => row.sentAt),
      now,
    });
    if (!plan.ok) fail(plan.code, plan.message);
    const game = chatGameNumber(loadStored(seat.game.flow).flow);
    const id = await ctx.db.insert('chatMessages', {
      gameId,
      senderId: callerId,
      from: seat.side,
      text: plan.text,
      sentAt: now,
      game,
      // The other player blocks the sender: only the sender sees it.
      hidden: await blocks(ctx, seat.otherId, callerId),
    });
    return { id, from: seat.side, text: plan.text, sentAt: now, game };
  },
});

export const setChatMuted = mutation({
  args: { gameId: v.id('games'), muted: v.boolean() },
  handler: async (ctx, { gameId, muted }): Promise<null> => {
    const callerId = await existingPlayer(ctx);
    await seatOf(ctx, callerId, gameId);
    const row = await muteRow(ctx, callerId, gameId);
    if (muted && row === null) await ctx.db.insert('chatMutes', { playerId: callerId, gameId });
    if (!muted && row !== null) await ctx.db.delete(row._id);
    return null;
  },
});

export const myChatSettings = query({
  args: {},
  handler: async (ctx): Promise<ChatSettings> => {
    const callerId = await signedInPlayer(ctx);
    return { enabled: (await nameRowOf(ctx, callerId))?.chatOff !== true };
  },
});

export const setChatEnabled = mutation({
  args: { enabled: v.boolean() },
  handler: async (ctx, { enabled }): Promise<null> => {
    const callerId = await existingPlayer(ctx);
    // The switch lives on the name row: make one for a player with none.
    await ensureGuestNumber(ctx, callerId);
    const row = await nameRowOf(ctx, callerId);
    if (row !== null && (row.chatOff === true) === enabled) {
      // `undefined` removes the field: an account with chat on has none.
      await ctx.db.patch(row._id, { chatOff: enabled ? undefined : true });
    }
    return null;
  },
});

/**
 * How many rows one run of the jobs below handles: one write each, far
 * below Convex's limit of 16,000 writes per transaction.
 */
export const CHAT_DELETE_PAGE = 200;

/**
 * Deletes up to `CHAT_DELETE_PAGE` chat messages and mutes of a game, and
 * runs again while there may be more. `games.ts` schedules it
 * `CHAT_KEEP_MS` after the match ends. The chat is closed by then
 * (`chatExpired`), so no new row can come.
 */
export const deleteGameChat = internalMutation({
  args: { gameId: v.id('games') },
  returns: v.null(),
  handler: async (ctx, { gameId }) => {
    const messages = await ctx.db
      .query('chatMessages')
      .withIndex('by_game', (q) => q.eq('gameId', gameId))
      .take(CHAT_DELETE_PAGE);
    for (const row of messages) await ctx.db.delete(row._id);
    // A page full of messages reads no mute: the next run does.
    const room = CHAT_DELETE_PAGE - messages.length;
    const mutes =
      room === 0
        ? []
        : await ctx.db
            .query('chatMutes')
            .withIndex('by_game', (q) => q.eq('gameId', gameId))
            .take(room);
    for (const row of mutes) await ctx.db.delete(row._id);
    if (messages.length + mutes.length === CHAT_DELETE_PAGE) {
      await ctx.scheduler.runAfter(0, internal.chat.deleteGameChat, { gameId });
    }
    return null;
  },
});

/**
 * Deletes up to `CHAT_DELETE_PAGE` chat messages and mutes of `playerId`,
 * a deleted account, and runs again while there may be more. Scheduled by
 * `deleteAccountOf`. No new row can name the player once the account is
 * gone: `sendChat` and `setChatMuted` need it to exist.
 */
export const deleteChatRows = internalMutation({
  args: { playerId: v.string() },
  returns: v.null(),
  handler: async (ctx, { playerId }) => {
    const messages = await ctx.db
      .query('chatMessages')
      .withIndex('by_sender', (q) => q.eq('senderId', playerId))
      .take(CHAT_DELETE_PAGE);
    for (const row of messages) await ctx.db.delete(row._id);
    // A page full of messages reads no mute: the next run does.
    const room = CHAT_DELETE_PAGE - messages.length;
    const mutes =
      room === 0
        ? []
        : await ctx.db
            .query('chatMutes')
            .withIndex('by_player', (q) => q.eq('playerId', playerId))
            .take(room);
    for (const row of mutes) await ctx.db.delete(row._id);
    const ban = await banRow(ctx, playerId);
    if (ban !== null) await ctx.db.delete(ban._id);
    if (messages.length + mutes.length === CHAT_DELETE_PAGE) {
      await ctx.scheduler.runAfter(0, internal.chat.deleteChatRows, { playerId });
    }
    return null;
  },
});

/**
 * Moves up to `CHAT_DELETE_PAGE` chat rows of guest `source` to account
 * `target` (#403), and runs again while there may be more. A mute the
 * account has already is dropped. A ban of the guest follows the person:
 * the account gets it, unless the account's own ban lasts longer. Scheduled by `startGuestMove`, after
 * the guest is deleted, so no new row can name it.
 */
export const moveGuestChat = internalMutation({
  args: { source: v.string(), target: v.string() },
  returns: v.null(),
  handler: async (ctx, { source, target }) => {
    const messages = await ctx.db
      .query('chatMessages')
      .withIndex('by_sender', (q) => q.eq('senderId', source))
      .take(CHAT_DELETE_PAGE);
    for (const row of messages) await ctx.db.patch(row._id, { senderId: target });
    // A page full of messages reads no mute: the next run does.
    const room = CHAT_DELETE_PAGE - messages.length;
    const mutes =
      room === 0
        ? []
        : await ctx.db
            .query('chatMutes')
            .withIndex('by_player', (q) => q.eq('playerId', source))
            .take(room);
    for (const row of mutes) {
      if ((await muteRow(ctx, target, row.gameId)) === null) {
        await ctx.db.patch(row._id, { playerId: target });
      } else {
        await ctx.db.delete(row._id);
      }
    }
    // A guest cannot chat, so a ban of one is rare; it must not be lost in
    // a move, and no row may point at the deleted guest.
    const ban = await banRow(ctx, source);
    if (ban !== null) {
      const own = await banRow(ctx, target);
      if (own === null) {
        await ctx.db.patch(ban._id, { playerId: target });
      } else {
        // The longer ban stays: no end beats any end.
        const longer =
          own.until === null || ban.until === null ? null : Math.max(own.until, ban.until);
        await ctx.db.patch(own._id, { until: longer });
        await ctx.db.delete(ban._id);
      }
    }
    if (messages.length + mutes.length === CHAT_DELETE_PAGE) {
      await ctx.scheduler.runAfter(0, internal.chat.moveGuestChat, { source, target });
    }
    return null;
  },
});

/**
 * The owner stops `playerId`'s chat (ADR-0011 item 14): for `days` days,
 * or for good with no `days`. A second call replaces the ban. The player
 * sees the status `banned`; the other player sees `unavailable`. Run it
 * from the Convex dashboard. Never make it public.
 */
export const banChatForOwner = internalMutation({
  args: { playerId: v.string(), days: v.optional(v.number()) },
  returns: v.null(),
  handler: async (ctx, { playerId, days }) => {
    const now = Date.now();
    const until = days === undefined ? null : now + days * 24 * 60 * 60 * 1000;
    const row = await banRow(ctx, playerId);
    if (row === null) await ctx.db.insert('chatBans', { playerId, until, createdAt: now });
    else await ctx.db.patch(row._id, { until });
    return null;
  },
});

/** The owner ends the chat ban of `playerId`. No ban: no change. Never make it public. */
export const unbanChatForOwner = internalMutation({
  args: { playerId: v.string() },
  returns: v.null(),
  handler: async (ctx, { playerId }) => {
    const row = await banRow(ctx, playerId);
    if (row !== null) await ctx.db.delete(row._id);
    return null;
  },
});

/**
 * The owner deletes every chat message `playerId` wrote, in pages (the
 * mutes and a ban stay). Never make it public.
 */
export const deleteChatMessagesForOwner = internalMutation({
  args: { playerId: v.string() },
  returns: v.null(),
  handler: async (ctx, { playerId }) => {
    const messages = await ctx.db
      .query('chatMessages')
      .withIndex('by_sender', (q) => q.eq('senderId', playerId))
      .take(CHAT_DELETE_PAGE);
    for (const row of messages) await ctx.db.delete(row._id);
    if (messages.length === CHAT_DELETE_PAGE) {
      await ctx.scheduler.runAfter(0, internal.chat.deleteChatMessagesForOwner, { playerId });
    }
    return null;
  },
});

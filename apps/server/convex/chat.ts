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
import { chatSeenBy, chatStatus, planChatMessage, sideOf } from '@tavli/online';
import type { ChatPlayer, StoredChatMessage } from '@tavli/online';

import type { Doc, Id } from './_generated/dataModel';
import { mutation, query } from './_generated/server';
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

/** What the chat rules need to know about `playerId`. */
async function chatPlayerOf(ctx: QueryCtx, playerId: string): Promise<ChatPlayer> {
  const [user, row] = await Promise.all([
    authComponent.getAnyUserById(ctx, playerId),
    nameRowOf(ctx, playerId),
  ]);
  return {
    saved: user !== null && user.isAnonymous !== true,
    hasUsername: row?.username !== undefined,
    termsVersion: row?.termsVersion ?? null,
    enabled: row?.chatOff !== true,
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
  return chatStatus({ me, other, muted: mute !== null, blocksOther });
}

function stored(row: Doc<'chatMessages'>): StoredChatMessage {
  return { id: row._id, from: row.from, text: row.text, sentAt: row.sentAt, hidden: row.hidden };
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
    const id = await ctx.db.insert('chatMessages', {
      gameId,
      senderId: callerId,
      from: seat.side,
      text: plan.text,
      sentAt: now,
      // The other player blocks the sender: only the sender sees it.
      hidden: await blocks(ctx, seat.otherId, callerId),
    });
    return { id, from: seat.side, text: plan.text, sentAt: now };
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

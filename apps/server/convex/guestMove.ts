/**
 * Move a guest into an account (#403, ADR-0008).
 *
 * A guest taps Save with a key that another account has already. The
 * key's owner is the same person, so `/key/save` (`keyPlugin.ts`) offers
 * a move: the counts here (`guestMoveCounts`) and a signed ticket
 * (`model/moveTicket.ts`). When the player chooses Move, `/key/move`
 * runs `startGuestMove` with the ticket's ids and signs the phone in to
 * the account. The guest's player id then becomes the account's id:
 *
 * 1. `startGuestMove`, one transaction: checks that `source` is a guest
 *    with no key and `target` a saved account; moves the push tokens
 *    (then keeps the newest `MAX_PUSH_TOKENS_PER_PLAYER`); deletes the
 *    guest's name row and the Better Auth guest with its sessions; then
 *    schedules the pages below. Once it ran, nothing new can name the
 *    guest: every call that saves an id checks the user exists
 *    (`existingPlayer`).
 * 2. `moveGuestGames`, in pages per side (`by_white`, `by_black`): each
 *    game becomes the account's (`players`, the flow, then its log in
 *    `moveGuestMoves`), and stays playable for the other player. A game
 *    between the guest and the account cannot: the guest resigns it if
 *    it runs, and it keeps the guest's id, like a deleted player's
 *    (`guestGameMove` in `@tavli/online`).
 * 3. `moveGuestInvites`: invites the guest sent (`by_from`) and answered
 *    (`by_answered`).
 * 4. `moveGuestSafety`: blocks both ways and reports by and about the
 *    guest. A row between the two, or one the account has already, is
 *    deleted.
 *
 * The caps (`MAX_OPEN_INVITES`, `MAX_BLOCKS`) are checked only when a
 * row is made, so after a move the account may be over one for a while.
 *
 * If the account is deleted while the pages run, each page hands the
 * rest to the account delete's own pages for the guest's id
 * (`account.ts`, `safety.ts`), so nothing is left behind.
 *
 * See "Move a guest into an account" in
 * `docs/architecture/online-game-service.md`. Never send ids to
 * analytics or the logs.
 */

import { ConvexError, v } from 'convex/values';

import type { GuestMoveCounts } from '@tavli/contracts';
import {
  guestGameMove,
  renamePlayerInEvent,
  renamePlayerInFlow,
  renamePlayers,
} from '@tavli/online';

import { internal } from './_generated/api';
import type { Doc } from './_generated/dataModel';
import { internalMutation, internalQuery } from './_generated/server';
import type { MutationCtx, QueryCtx } from './_generated/server';
import { authComponent, createAuth } from './auth';
import { resignAs } from './games';
import { openInvitesOf } from './invites';
import { tokensOverCap } from './model/push';
import { deletePlayerNameOf } from './playerNames';

/**
 * How many games one run moves. A rename writes the game and schedules
 * one job; a resign (a game between the two) is a full save, as in
 * `GAME_RESIGN_PAGE`. Far below Convex's limit of 16,000 writes.
 */
export const GUEST_GAME_PAGE = 25;

/** How many log rows one run of `moveGuestMoves` reads, and at most writes. */
export const GUEST_MOVES_PAGE = 500;

/** How many invites, blocks or reports one run moves: one or two reads and one write each. */
export const GUEST_ROW_PAGE = 200;

/** The count of games in progress stops here: the sheet says "100 games". */
export const GUEST_COUNT_CAP = 100;

/** Throws a `ConvexError` that `/key/move` turns into `BAD_REQUEST`. */
function refuse(message: string): never {
  throw new ConvexError({ code: 'BAD_REQUEST', message });
}

/** The user exists and is a saved account, not a guest. */
async function isSavedAccount(ctx: QueryCtx, id: string): Promise<boolean> {
  const user = await authComponent.getAnyUserById(ctx, id);
  return user !== null && user.isAnonymous !== true;
}

/** Up to `GUEST_COUNT_CAP` active games of `playerId`. */
async function countActiveGames(ctx: QueryCtx, playerId: string): Promise<number> {
  let count = 0;
  for (const index of ['by_white', 'by_black'] as const) {
    const field = index === 'by_white' ? 'players.white' : 'players.black';
    const games = await ctx.db
      .query('games')
      .withIndex(index, (q) => q.eq(field, playerId).eq('status', 'active'))
      .take(GUEST_COUNT_CAP - count);
    count += games.length;
    if (count === GUEST_COUNT_CAP) break;
  }
  return count;
}

/** What the sheet tells the player before a move: games in progress and open invites. */
export const guestMoveCounts = internalQuery({
  args: { playerId: v.string() },
  returns: v.object({ activeGames: v.number(), openInvites: v.number() }),
  handler: async (ctx, { playerId }): Promise<GuestMoveCounts> => ({
    activeGames: await countActiveGames(ctx, playerId),
    // The cap keeps these few (`MAX_OPEN_INVITES`).
    openInvites: (await openInvitesOf(ctx, playerId, Date.now())).length,
  }),
});

/**
 * Step 1 of the move (see the top of this file). `source` and `target`
 * come from a ticket the server signed (`/key/move`), never from the app.
 * Throws `BAD_REQUEST` and changes nothing when `source` is no longer a
 * guest with no key, or `target` no longer a saved account.
 */
export const startGuestMove = internalMutation({
  args: { source: v.string(), target: v.string() },
  returns: v.null(),
  handler: async (ctx, { source, target }) => {
    if (source === target) refuse('a player cannot move into itself');
    const guest = await authComponent.getAnyUserById(ctx, source);
    if (guest === null || guest.isAnonymous !== true) refuse('only a guest moves');
    // A guest with a key claim is on its way to being saved: never move it.
    const key = await ctx.db
      .query('authKeys')
      .withIndex('by_user', (q) => q.eq('userId', source))
      .first();
    if (key !== null) refuse('only a guest moves');
    if (!(await isSavedAccount(ctx, target))) refuse('the account is gone');

    // Push tokens: a player keeps at most a few, so this is a small read.
    const tokens = await ctx.db
      .query('pushTokens')
      .withIndex('by_player', (q) => q.eq('playerId', source))
      .collect();
    for (const token of tokens) await ctx.db.patch(token._id, { playerId: target });
    const all = await ctx.db
      .query('pushTokens')
      .withIndex('by_player', (q) => q.eq('playerId', target))
      .collect();
    const newest = all.at(-1)?.token ?? '';
    for (const row of tokensOverCap(all, newest)) await ctx.db.delete(row._id);

    // The guest number goes with the guest: the account keeps its own name.
    await deletePlayerNameOf(ctx, source);

    // Better Auth's own delete: the guest's sessions, then the user.
    const { internalAdapter } = await createAuth(ctx).$context;
    await internalAdapter.deleteUser(source);

    for (const index of ['by_white', 'by_black'] as const) {
      await ctx.scheduler.runAfter(0, internal.guestMove.moveGuestGames, {
        source,
        target,
        index,
        cursor: null,
      });
    }
    await ctx.scheduler.runAfter(0, internal.guestMove.moveGuestInvites, { source, target });
    await ctx.scheduler.runAfter(0, internal.guestMove.moveGuestSafety, { source, target });
    return null;
  },
});

/**
 * Moves one page of the guest's games on one side, and runs again while
 * there are more. A renamed game leaves the index range; a kept one
 * stays, so the page goes on from its cursor.
 */
export const moveGuestGames = internalMutation({
  args: {
    source: v.string(),
    target: v.string(),
    index: v.union(v.literal('by_white'), v.literal('by_black')),
    cursor: v.union(v.string(), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, { source, target, index, cursor }) => {
    if (!(await isSavedAccount(ctx, target))) {
      // The account went: the guest's games end as a deleted player's.
      await ctx.scheduler.runAfter(0, internal.account.resignActiveGames, { playerId: source });
      return null;
    }
    const field = index === 'by_white' ? 'players.white' : 'players.black';
    const page = await ctx.db
      .query('games')
      .withIndex(index, (q) => q.eq(field, source))
      .paginate({ cursor, numItems: GUEST_GAME_PAGE });
    for (const game of page.page) await moveGame(ctx, game, source, target);
    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.guestMove.moveGuestGames, {
        source,
        target,
        index,
        cursor: page.continueCursor,
      });
    }
    return null;
  },
});

async function moveGame(
  ctx: MutationCtx,
  game: Doc<'games'>,
  source: string,
  target: string,
): Promise<void> {
  switch (guestGameMove(game.players, game.status === 'active', source, target)) {
    case 'keep':
      return;
    case 'resign':
      await resignAs(ctx, game._id, source);
      return;
    case 'rename':
      // No new version: the game did not change, only who plays one side.
      // A call the other player has on its way still fits.
      await ctx.db.patch(game._id, {
        players: renamePlayers(game.players, source, target),
        flow: renamePlayerInFlow(game.flow, source, target),
      });
      await ctx.scheduler.runAfter(0, internal.guestMove.moveGuestMoves, {
        gameId: game._id,
        source,
        target,
        cursor: null,
      });
  }
}

/** Renames the guest in one page of a game's log (`actor`, the `start` event). */
export const moveGuestMoves = internalMutation({
  args: {
    gameId: v.id('games'),
    source: v.string(),
    target: v.string(),
    cursor: v.union(v.string(), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, { gameId, source, target, cursor }) => {
    const page = await ctx.db
      .query('moves')
      .withIndex('by_game', (q) => q.eq('gameId', gameId))
      .paginate({ cursor, numItems: GUEST_MOVES_PAGE });
    for (const row of page.page) {
      const event = row.seq === 0 ? renamePlayerInEvent(row.event, source, target) : row.event;
      if (row.actor === source || event !== row.event) {
        await ctx.db.patch(row._id, {
          actor: row.actor === source ? target : row.actor,
          event,
        });
      }
    }
    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.guestMove.moveGuestMoves, {
        gameId,
        source,
        target,
        cursor: page.continueCursor,
      });
    }
    return null;
  },
});

/**
 * Moves up to `GUEST_ROW_PAGE` invites the guest sent, then those it
 * answered, and runs again while there may be more. Each moved row leaves
 * its range, so every run starts at the front.
 */
export const moveGuestInvites = internalMutation({
  args: { source: v.string(), target: v.string() },
  returns: v.null(),
  handler: async (ctx, { source, target }) => {
    if (!(await isSavedAccount(ctx, target))) {
      // The account went: the guest's invites go as a deleted player's.
      await ctx.scheduler.runAfter(0, internal.account.deleteSentInvites, { from: source });
      return null;
    }
    const sent = await ctx.db
      .query('invites')
      .withIndex('by_from', (q) => q.eq('from', source))
      .take(GUEST_ROW_PAGE);
    for (const invite of sent) await ctx.db.patch(invite._id, { from: target });
    const answered = await ctx.db
      .query('invites')
      .withIndex('by_answered', (q) => q.eq('answeredBy', source))
      .take(GUEST_ROW_PAGE - sent.length);
    for (const invite of answered) await ctx.db.patch(invite._id, { answeredBy: target });
    if (sent.length + answered.length === GUEST_ROW_PAGE) {
      await ctx.scheduler.runAfter(0, internal.guestMove.moveGuestInvites, { source, target });
    }
    return null;
  },
});

/**
 * Moves up to `GUEST_ROW_PAGE` blocks and reports of the guest, and runs
 * again while there may be more. Each row moves to the account, or is
 * deleted when it would be between the two or a second row of one pair.
 * Either way it leaves its range.
 */
export const moveGuestSafety = internalMutation({
  args: { source: v.string(), target: v.string() },
  returns: v.null(),
  handler: async (ctx, { source, target }) => {
    if (!(await isSavedAccount(ctx, target))) {
      await ctx.scheduler.runAfter(0, internal.safety.deleteSafetyRows, { playerId: source });
      return null;
    }
    let left = GUEST_ROW_PAGE;

    const blocksBy = await ctx.db
      .query('blocks')
      .withIndex('by_blocker', (q) => q.eq('blockerId', source))
      .take(left);
    for (const row of blocksBy) {
      const same =
        row.blockedId === target || (await blockRow(ctx, target, row.blockedId)) !== null;
      if (same) await ctx.db.delete(row._id);
      else await ctx.db.patch(row._id, { blockerId: target });
    }
    left -= blocksBy.length;

    const blocksOf = await ctx.db
      .query('blocks')
      .withIndex('by_blocked', (q) => q.eq('blockedId', source))
      .take(left);
    for (const row of blocksOf) {
      const same =
        row.blockerId === target || (await blockRow(ctx, row.blockerId, target)) !== null;
      if (same) await ctx.db.delete(row._id);
      else await ctx.db.patch(row._id, { blockedId: target });
    }
    left -= blocksOf.length;

    const reportsBy = await ctx.db
      .query('reports')
      .withIndex('by_reporter', (q) => q.eq('reporterId', source))
      .take(left);
    for (const row of reportsBy) {
      const same =
        row.reportedId === target || (await reportRow(ctx, target, row.reportedId)) !== null;
      if (same) await ctx.db.delete(row._id);
      else await ctx.db.patch(row._id, { reporterId: target });
    }
    left -= reportsBy.length;

    const reportsAbout = await ctx.db
      .query('reports')
      .withIndex('by_reported', (q) => q.eq('reportedId', source))
      .take(left);
    for (const row of reportsAbout) {
      const same =
        row.reporterId === target || (await reportRow(ctx, row.reporterId, target)) !== null;
      if (same) await ctx.db.delete(row._id);
      else await ctx.db.patch(row._id, { reportedId: target });
    }
    left -= reportsAbout.length;

    if (left === 0) {
      await ctx.scheduler.runAfter(0, internal.guestMove.moveGuestSafety, { source, target });
    }
    return null;
  },
});

async function blockRow(ctx: QueryCtx, blockerId: string, blockedId: string) {
  return await ctx.db
    .query('blocks')
    .withIndex('by_blocker', (q) => q.eq('blockerId', blockerId).eq('blockedId', blockedId))
    .first();
}

async function reportRow(ctx: QueryCtx, reporterId: string, reportedId: string) {
  return await ctx.db
    .query('reports')
    .withIndex('by_pair', (q) => q.eq('reporterId', reporterId).eq('reportedId', reportedId))
    .first();
}

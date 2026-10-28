/**
 * Delete my account (#302). App stores ask for this in the app.
 *
 * `deleteMyAccount` is one transaction: if any step throws, nothing is
 * deleted. For the signed-in caller (`existingPlayer`) it:
 *
 * 1. resigns each active game, through the same save as `resign`
 *    (`resignAs`): the other player wins, and the push rules hold;
 * 2. keeps each finished game for the other player, with the caller's id
 *    in it (`gameOnDelete` in `model/account.ts`);
 * 3. deletes every open invite the caller sent, and every push token;
 * 4. deletes the Better Auth user, its sessions and its accounts, with
 *    Better Auth's own delete (`internalAdapter.deleteUser`) on the
 *    component's tables;
 * 5. schedules `deleteSentInvites`, which deletes the caller's other
 *    invites (accepted, declined, cancelled, expired) in pages (#306).
 *
 * The caller's token stays valid until it expires, so the call first
 * checks that the Better Auth user still exists (`existingPlayer`): a
 * second call gets `NOT_SIGNED_IN`, and so do the calls that make rows
 * under the caller's id. See "Delete an account" in
 * `docs/architecture/online-game-service.md`.
 */

import { v } from 'convex/values';

import { internal } from './_generated/api';
import type { Doc } from './_generated/dataModel';
import { internalMutation, mutation } from './_generated/server';
import type { MutationCtx } from './_generated/server';
import { createAuth } from './auth';
import { existingPlayer } from './caller';
import { resignAs } from './games';
import { openInvitesOf } from './invites';
import { gameOnDelete } from './model/account';

/**
 * How many invites one run of `deleteSentInvites` deletes: one write
 * each, far below Convex's limit of 16,000 writes per transaction.
 */
export const INVITE_DELETE_PAGE = 200;

/** Every active game of `playerId`, on both sides' indexes. */
async function activeGamesOf(ctx: MutationCtx, playerId: string): Promise<Doc<'games'>[]> {
  const [asWhite, asBlack] = await Promise.all([
    ctx.db
      .query('games')
      .withIndex('by_white', (q) => q.eq('players.white', playerId).eq('status', 'active'))
      .collect(),
    ctx.db
      .query('games')
      .withIndex('by_black', (q) => q.eq('players.black', playerId).eq('status', 'active'))
      .collect(),
  ]);
  return [...asWhite, ...asBlack];
}

/**
 * Deletes the caller's account and data (see the top of this file).
 * Takes no player id. Without a sign-in, or once the account is deleted,
 * it throws `NOT_SIGNED_IN`.
 */
export const deleteMyAccount = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    // A token outlives its user (it is valid until it expires), so a
    // valid token is not enough: the user must still exist.
    const callerId = await existingPlayer(ctx);

    // Finished games stay as they are (`keep`); only active ones change.
    for (const game of await activeGamesOf(ctx, callerId)) {
      if (gameOnDelete(game, callerId) === 'resign') await resignAs(ctx, game._id, callerId);
    }

    // The open invites, now, so nobody can accept one once the user is
    // gone. The cap keeps them few (`MAX_OPEN_INVITES`). An open invite's
    // scheduled `expireInvite` then finds no row and does nothing. The
    // closed ones are never pruned, so they can be many:
    // `deleteSentInvites` deletes them below, in pages.
    for (const invite of await openInvitesOf(ctx, callerId, Date.now())) {
      await ctx.db.delete(invite._id);
    }

    const tokens = await ctx.db
      .query('pushTokens')
      .withIndex('by_player', (q) => q.eq('playerId', callerId))
      .collect();
    for (const token of tokens) await ctx.db.delete(token._id);

    // Better Auth's own delete: the user's sessions, its accounts (Apple,
    // Google, …), then the user, with Better Auth's hooks, through the
    // component adapter. The `/delete-user` route is not used: it needs a
    // request with a fresh session, and it is off, so no client can
    // delete a user without the steps above.
    const { internalAdapter } = await createAuth(ctx).$context;
    await internalAdapter.deleteUser(callerId);

    // It runs after this transaction, when the user is gone, so no new
    // invite can come in (`createInvite` checks `existingPlayer`).
    await ctx.scheduler.runAfter(0, internal.account.deleteSentInvites, { from: callerId });
    return null;
  },
});

/**
 * Deletes up to `INVITE_DELETE_PAGE` invites that `from` sent, and runs
 * again while there may be more. Scheduled by `deleteMyAccount`. Nobody
 * can accept these invites: they are closed, or their time is up.
 */
export const deleteSentInvites = internalMutation({
  args: { from: v.string() },
  returns: v.null(),
  handler: async (ctx, { from }) => {
    const page = await ctx.db
      .query('invites')
      .withIndex('by_from', (q) => q.eq('from', from))
      .take(INVITE_DELETE_PAGE);
    for (const invite of page) await ctx.db.delete(invite._id);
    if (page.length === INVITE_DELETE_PAGE) {
      await ctx.scheduler.runAfter(0, internal.account.deleteSentInvites, { from });
    }
    return null;
  },
});

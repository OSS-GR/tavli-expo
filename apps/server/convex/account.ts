/**
 * Delete my account (#302). App stores ask for this in the app.
 *
 * `deleteMyAccount` is one transaction: if any step throws, nothing is
 * deleted. For the signed-in caller (`signedInPlayer`) it:
 *
 * 1. resigns each active game, through the same save as `resign`
 *    (`resignAs`): the other player wins, and the push rules hold;
 * 2. keeps each finished game for the other player, with the caller's id
 *    in it (`gameOnDelete` in `model/account.ts`);
 * 3. deletes every invite the caller sent, and every push token;
 * 4. deletes the Better Auth user, its sessions and its accounts, with
 *    Better Auth's own delete (`internalAdapter.deleteUser`) on the
 *    component's tables.
 *
 * The caller's token stays valid until it expires, so the call first
 * checks that the Better Auth user still exists: a second call gets
 * `NOT_SIGNED_IN`. See "Delete an account" in
 * `docs/architecture/online-game-service.md`.
 */

import { ConvexError, v } from 'convex/values';

import type { GameTransportErrorCode } from '@tavli/contracts';

import type { Doc } from './_generated/dataModel';
import { mutation } from './_generated/server';
import type { MutationCtx } from './_generated/server';
import { authComponent, createAuth } from './auth';
import { signedInPlayer } from './caller';
import { resignAs } from './games';
import { gameOnDelete } from './model/account';

function fail(code: GameTransportErrorCode, message: string): never {
  // A plain object literal, so it fits Convex's `Value` type.
  const data: { code: GameTransportErrorCode; message: string } = { code, message };
  throw new ConvexError(data);
}

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
    const callerId = await signedInPlayer(ctx);
    // A token outlives its user (it is valid until it expires), so a
    // valid token is not enough: the user must still exist.
    const user = await authComponent.getAnyUserById(ctx, callerId);
    if (user === null) fail('NOT_SIGNED_IN', 'this account does not exist');

    // Finished games stay as they are (`keep`); only active ones change.
    for (const game of await activeGamesOf(ctx, callerId)) {
      if (gameOnDelete(game, callerId) === 'resign') await resignAs(ctx, game._id, callerId);
    }

    // Every invite the caller sent, open or not. An open invite's
    // scheduled `expireInvite` then finds no row and does nothing.
    const invites = await ctx.db
      .query('invites')
      .withIndex('by_from', (q) => q.eq('from', callerId))
      .collect();
    for (const invite of invites) await ctx.db.delete(invite._id);

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
    return null;
  },
});

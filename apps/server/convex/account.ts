/**
 * Delete my account (#302). App stores ask for this in the app.
 *
 * `deleteMyAccount` is one transaction: if any step throws, nothing is
 * deleted. For the signed-in caller (`existingPlayer`) it:
 *
 * 1. resigns up to `GAME_RESIGN_PAGE` active games, through the same save
 *    as `resign` (`resignAs`): the other player wins, and the push rules
 *    hold. When there may be more, it schedules `resignActiveGames`,
 *    which resigns the rest in pages after the call (#309);
 * 2. keeps each finished game for the other player, with the caller's id
 *    in it (`gameOnDelete` in `model/account.ts`);
 * 3. deletes every open invite the caller sent, every push token, and
 *    the caller's sign-in key claims (`authKeys`, #397); moves the
 *    caller's Apple tokens to the revoke queue, and schedules the revoke
 *    (`appleTokens.ts`, #398); ends the caller's friendships, both rows
 *    (`deleteFriendsOf`, #406); deletes the caller's Play ranked seek
 *    (`deleteSeeksOf`, #531);
 * 4. deletes the Better Auth user, its sessions and its accounts, with
 *    Better Auth's own delete (`internalAdapter.deleteUser`) on the
 *    component's tables;
 * 5. schedules `deleteSentInvites`, which deletes the caller's other
 *    invites (accepted, declined, cancelled, expired) in pages (#306),
 *    and `deleteSafetyRows`, which deletes the caller's blocks both ways
 *    and the reports by and about the caller in pages (#320), and
 *    `deleteFriendRows`: the friend requests both ways, the friend link,
 *    the search log and the friend invites to the caller (#406).
 *
 * The caller's token stays valid until it expires, so the call first
 * checks that the Better Auth user still exists (`existingPlayer`): a
 * second call gets `NOT_SIGNED_IN`, and so do the calls that make rows
 * under the caller's id. See "Delete an account" in
 * `docs/architecture/online-game-service.md`.
 *
 * A delete request by email (#447) uses the owner's internal tools, run
 * from the Convex dashboard: `findAccountForOwner` (the user id from a
 * username or a guest name) and `deleteAccountForOwner` (the same steps
 * for that id). Never make them public.
 */

import { v } from 'convex/values';

import { usernameKey } from '@tavli/online';

import { internal } from './_generated/api';
import { internalMutation, internalQuery, mutation } from './_generated/server';
import type { MutationCtx } from './_generated/server';
import { revokeAppleTokensOf } from './appleTokens';
import { authComponent, createAuth } from './auth';
import { deleteKeysOf } from './authKeys';
import { existingPlayer } from './caller';
import { deleteFriendsOf } from './friends';
import { resignAs } from './games';
import { openInvitesOf } from './invites';
import { deleteSeeksOf } from './matchmaking';
import { gameOnDelete } from './model/account';
import { deletePlayerNameOf } from './playerNames';
import { deleteRatingOf } from './ratings';

/**
 * How many invites one run of `deleteSentInvites` deletes: one write
 * each, far below Convex's limit of 16,000 writes per transaction.
 */
export const INVITE_DELETE_PAGE = 200;

/**
 * How many active games one run resigns (#309). Nothing caps a player's
 * active games: each accepted invite starts one. One resign reads the
 * game, writes it and one `moves` row, and runs the engine once. So 25
 * of them make about 50 writes, far below Convex's limit of 16,000 per
 * transaction. The run time (Convex allows 1 second) is an estimate, not
 * measured: 25 engine resigns and JSON reads should take far less.
 */
export const GAME_RESIGN_PAGE = 25;

/**
 * `playerId` resigns up to `GAME_RESIGN_PAGE` active games: the white
 * side's index first, then the black side's (`by_white`, `by_black`).
 * Each query starts again at the first active game, so a game that a
 * turn timer ended in between is just skipped. Returns `true` when the
 * page was full, so there may be more.
 */
async function resignPage(ctx: MutationCtx, playerId: string): Promise<boolean> {
  let resigned = 0;
  for (const index of ['by_white', 'by_black'] as const) {
    const field = index === 'by_white' ? 'players.white' : 'players.black';
    const games = await ctx.db
      .query('games')
      .withIndex(index, (q) => q.eq(field, playerId).eq('status', 'active'))
      .take(GAME_RESIGN_PAGE - resigned);
    for (const game of games) {
      if (gameOnDelete(game, playerId) !== 'resign') continue;
      // A match that ends by an account delete is never rated (#407).
      await resignAs(ctx, game._id, playerId, false);
      resigned += 1;
    }
    if (resigned === GAME_RESIGN_PAGE) return true;
  }
  return false;
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
    await deleteAccountOf(ctx, await existingPlayer(ctx));
    return null;
  },
});

/**
 * The owner's tool for a delete request by email (#447): runs the same
 * steps as `deleteMyAccount` (`deleteAccountOf`, with the same pages
 * after the call) for `userId`. Internal: run it from the Convex
 * dashboard (Functions → `account:deleteAccountForOwner` → Run). Find the
 * id first with `findAccountForOwner`. Throws when the account does not
 * exist (a second run, or a wrong id), and deletes nothing then.
 */
export const deleteAccountForOwner = internalMutation({
  args: { userId: v.string() },
  returns: v.null(),
  handler: async (ctx, { userId }) => {
    if ((await authComponent.getAnyUserById(ctx, userId)) === null) {
      throw new Error('no account has this user id');
    }
    await deleteAccountOf(ctx, userId);
    return null;
  },
});

/** At most this many accounts from one guest number lookup (#447). */
export const OWNER_LOOKUP_LIMIT = 50;

/**
 * The four digits of a guest name as the person writes it: "Guest 4821",
 * "Επισκέπτης 4821" or "4821". `null` when there are not exactly four.
 */
export function guestNumberIn(text: string): string | null {
  const digits = text.match(/\d+/g) ?? [];
  const only = digits.length === 1 ? digits[0] : undefined;
  return only !== undefined && /^[1-9]\d{3}$/.test(only) ? only : null;
}

/**
 * The owner's lookup for a delete request by email (#447): the accounts
 * with this `username` (the same key as the uniqueness check, so case,
 * accents and look-alikes match) or this guest name (not unique: up to
 * `OWNER_LOOKUP_LIMIT` accounts). Give exactly one. Returns only each
 * user id and whether the account is saved (not a guest), nothing else.
 * Internal: run it from the Convex dashboard. Never log what it returns.
 */
export const findAccountForOwner = internalQuery({
  args: { username: v.optional(v.string()), guestName: v.optional(v.string()) },
  returns: v.array(v.object({ userId: v.string(), saved: v.boolean() })),
  handler: async (ctx, { username, guestName }) => {
    if ((username === undefined) === (guestName === undefined)) {
      throw new Error('give a username or a guest name, not both');
    }
    let rows;
    if (username !== undefined) {
      const key = usernameKey(username);
      rows = await ctx.db
        .query('playerNames')
        .withIndex('by_username_key', (q) => q.eq('usernameKey', key))
        .take(OWNER_LOOKUP_LIMIT);
    } else {
      const number = guestNumberIn(guestName ?? '');
      if (number === null) throw new Error('a guest name has four digits, like "Guest 4821"');
      rows = await ctx.db
        .query('playerNames')
        .withIndex('by_guest_number', (q) => q.eq('guestNumber', number))
        .take(OWNER_LOOKUP_LIMIT);
    }
    const found: { userId: string; saved: boolean }[] = [];
    for (const row of rows) {
      const user = await authComponent.getAnyUserById(ctx, row.playerId);
      if (user === null) continue;
      found.push({ userId: row.playerId, saved: user.isAnonymous !== true });
    }
    return found;
  },
});

/**
 * The steps of `deleteMyAccount` for `callerId`, a user who exists. Also
 * run when Apple says the person's last key ended (`endAppleKey`) and by
 * the owner's `deleteAccountForOwner` (#447).
 */
export async function deleteAccountOf(ctx: MutationCtx, callerId: string): Promise<void> {
  // Finished games stay as they are (`keep`); only active ones change.
  // The first page now, so most players see all their games end in
  // this call; the rest go in `resignActiveGames`, below.
  const moreGames = await resignPage(ctx, callerId);

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

  // The friendships (#406), both rows, so the friends see them end at
  // once. `MAX_FRIENDS` caps them. The requests, the link, the search log
  // and the friend invites go in `deleteFriendRows`, below, in pages.
  await deleteFriendsOf(ctx, callerId);

  // The rating (#407): off the boards at once. The pair counts go in
  // `deleteRatedPairs`, below, in pages.
  await deleteRatingOf(ctx, callerId);

  // The Play ranked seek (#531): one row at most, so no match can start
  // with the caller from now on.
  await deleteSeeksOf(ctx, callerId);

  // The sign-in key claims (#397), so the Apple id is free again.
  await deleteKeysOf(ctx, callerId);

  // The guest number (#400) and the username (#405): the other players no
  // longer see a name, and the username is free for others at once.
  await deletePlayerNameOf(ctx, callerId);

  // Apple asks us to revoke its token (#398). The tokens go to a queue
  // that holds no user id; the revoke runs after this transaction, so
  // it never holds up or undoes the delete.
  await revokeAppleTokensOf(ctx, callerId);

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

  // Blocks both ways and reports by and about the caller (#320), in pages:
  // others may block or report a player without a cap. No new row can
  // name the caller now: both calls need the account to exist.
  await ctx.scheduler.runAfter(0, internal.safety.deleteSafetyRows, { playerId: callerId });

  // The rest of the friend rows (#406): declined requests have no cap.
  // No new row can name the caller now: every friends call needs the
  // account to exist, as the caller and as the other player.
  await ctx.scheduler.runAfter(0, internal.friends.deleteFriendRows, { playerId: callerId });

  // The pair counts of the ratings (#407): one per player met, no cap.
  await ctx.scheduler.runAfter(0, internal.ratings.deleteRatedPairs, { playerId: callerId });

  // The other active games, after this transaction. No new game can
  // start with the caller from now on: a game starts only from
  // `acceptInvite` or a Play ranked match, the caller's open invites and
  // seek are gone (above), and the caller can no longer accept an invite
  // or seek again (`existingPlayer` / the saved check finds no user).
  // So the pages only shrink the set of active games. Until they run,
  // a game can stay active for a moment; its turn timer (`checkTimeout`)
  // still works, as it reads no user.
  if (moreGames) {
    await ctx.scheduler.runAfter(0, internal.account.resignActiveGames, { playerId: callerId });
  }
}

/**
 * Resigns up to `GAME_RESIGN_PAGE` active games of `playerId`, a deleted
 * account, and runs again while there may be more (#309). Scheduled by
 * `deleteMyAccount`. A run whose page was not full saw every active game
 * left, so none is missed.
 */
export const resignActiveGames = internalMutation({
  args: { playerId: v.string() },
  returns: v.null(),
  handler: async (ctx, { playerId }) => {
    if (await resignPage(ctx, playerId)) {
      await ctx.scheduler.runAfter(0, internal.account.resignActiveGames, { playerId });
    }
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

/**
 * Sign out of all phones (#446): ends every session of `userId` and
 * deletes every push token of it, in one transaction. Called only by the
 * `/sign-out-everywhere` route (`keyPlugin.ts`), which checks the session
 * and refuses a guest.
 *
 * The sessions go first, with Better Auth's own delete
 * (`internalAdapter.deleteUserSessions`), then the push tokens, so no
 * other phone gets a "your turn" push from now on. Both are in the same
 * transaction, so a phone cannot add a token in between; after it,
 * `registerPushToken` refuses a token whose session is gone
 * (`existingPlayer`). The account, its keys, games and invites stay.
 *
 * Another phone's Convex token still works until it expires (15
 * minutes): it can still read its lists and play its games, but it
 * cannot make a row under the player's id (`existingPlayer`), and it
 * gets no new token. See "Sign out of all phones" in
 * `docs/architecture/online-game-service.md`.
 */
export const endSessionsOf = internalMutation({
  args: { userId: v.string() },
  returns: v.null(),
  handler: async (ctx, { userId }) => {
    const { internalAdapter } = await createAuth(ctx).$context;
    await internalAdapter.deleteUserSessions(userId);
    // `MAX_PUSH_TOKENS_PER_PLAYER` caps them, so `.collect()` is fine.
    const tokens = await ctx.db
      .query('pushTokens')
      .withIndex('by_player', (q) => q.eq('playerId', userId))
      .collect();
    for (const token of tokens) await ctx.db.delete(token._id);
    return null;
  },
});

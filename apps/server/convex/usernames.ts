/**
 * Usernames (#405, ADR-0008): one per saved account, shown to the other
 * players instead of the guest name.
 *
 * - `getMyUsername`: the caller's username and what the username step
 *   still needs (the terms, the age check).
 * - `setMyUsername`: picks or changes it. Only a saved account (a Better
 *   Auth user that is not anonymous: it has a sign-in key). The rules, the
 *   block list, the terms, the age check and the 30 days are
 *   `planUsername` in `@tavli/online`, which the in-memory server runs
 *   too: never copy a check here. This file adds only the database: the
 *   key must be free (`by_username_key`). Two players who pick the same
 *   name at once both read that index range, so Convex runs one of the two
 *   again, and it gets `TAKEN`.
 * - `clearUsername` (internal, the owner's tool, #320): renames or clears
 *   a bad name. Run it from the Convex dashboard.
 *
 * The username lives in the caller's `playerNames` row, next to the guest
 * number, so `deleteAccountOf` deletes it with the row
 * (`deletePlayerNameOf`) and the name is free at once. Never send a
 * username to analytics or the logs.
 */

import { ConvexError, v } from 'convex/values';

import type { MyUsername, UsernameErrorCode } from '@tavli/contracts';
import {
  checkUsername,
  myUsernameOf,
  pickGuestNumber,
  planUsername,
  usernameKey,
} from '@tavli/online';

import type { Id } from './_generated/dataModel';
import { internalMutation, mutation, query } from './_generated/server';
import type { MutationCtx, QueryCtx } from './_generated/server';
import { authComponent } from './auth';
import { signedInPlayer } from './caller';
import { createCryptoRng } from './model/cryptoRng';
import { nameRowOf } from './playerNames';

/** Throws a `ConvexError` with `UsernameErrorData`. */
function fail(code: UsernameErrorCode, message: string): never {
  const data: { code: UsernameErrorCode; message: string } = { code, message };
  throw new ConvexError(data);
}

/**
 * The caller and whether their account is saved. Throws `NOT_SIGNED_IN`
 * with no token, or when the Better Auth user is gone (a token outlives
 * its user, #306).
 */
async function caller(ctx: QueryCtx): Promise<{ playerId: string; saved: boolean }> {
  const playerId = await signedInPlayer(ctx);
  const user = await authComponent.getAnyUserById(ctx, playerId);
  if (user === null) fail('NOT_SIGNED_IN', 'this account does not exist');
  return { playerId, saved: user.isAnonymous !== true };
}

/** The player who holds `key`, or `null` when it is free. */
async function holderOf(ctx: QueryCtx, key: string): Promise<string | null> {
  const row = await ctx.db
    .query('playerNames')
    .withIndex('by_username_key', (q) => q.eq('usernameKey', key))
    .first();
  return row?.playerId ?? null;
}

/** The caller's username and what the username step still needs. */
export const getMyUsername = query({
  args: {},
  handler: async (ctx): Promise<MyUsername> => {
    const { playerId, saved } = await caller(ctx);
    return myUsernameOf(await nameRowOf(ctx, playerId), saved, Date.now());
  },
});

/** Picks or changes the caller's username (see the top of this file). */
export const setMyUsername = mutation({
  args: {
    name: v.string(),
    acceptTerms: v.optional(v.string()),
    ageChecked: v.optional(v.boolean()),
  },
  handler: async (ctx, request): Promise<MyUsername> => {
    const { playerId, saved } = await caller(ctx);
    const row = await nameRowOf(ctx, playerId);
    const now = Date.now();
    const plan = planUsername({ record: row, saved, request, now });
    if (!plan.ok) fail(plan.code, plan.message);
    if (plan.key !== null) {
      const holder = await holderOf(ctx, plan.key);
      if (holder !== null && holder !== playerId) fail('TAKEN', 'another player has this name');
    }
    let id: Id<'playerNames'>;
    if (row === null) {
      // A saved player may pick a name before any invite or game: the row
      // gets its guest number now, like `ensureGuestNumber`.
      id = await ctx.db.insert('playerNames', {
        playerId,
        guestNumber: pickGuestNumber(createCryptoRng()),
        ...plan.patch,
      });
    } else {
      id = row._id;
      await ctx.db.patch(id, plan.patch);
    }
    return myUsernameOf(await ctx.db.get(id), saved, now);
  },
});

/**
 * The owner's tool (#320): gives `playerId` the username `name`, or
 * clears it with no `name`. The player may pick or change the name again
 * at once (the 30 days start over). A new name must follow the rules
 * (`checkUsername`) and be free; the block list is the owner's call.
 */
export const clearUsername = internalMutation({
  args: { playerId: v.string(), name: v.optional(v.string()) },
  handler: async (ctx: MutationCtx, { playerId, name }): Promise<null> => {
    const row = await nameRowOf(ctx, playerId);
    if (row === null) throw new Error('this player has no name row');
    if (name === undefined) {
      await ctx.db.patch(row._id, {
        username: undefined,
        usernameKey: undefined,
        usernameChangedAt: undefined,
      });
      return null;
    }
    const check = checkUsername(name);
    if (!check.ok) throw new Error(`the name is not valid (${check.problem})`);
    const key = usernameKey(check.name);
    const holder = await holderOf(ctx, key);
    if (holder !== null && holder !== playerId) throw new Error('another player has this name');
    await ctx.db.patch(row._id, {
      username: check.name,
      usernameKey: key,
      usernameChangedAt: undefined,
    });
    return null;
  },
});

/**
 * Sign-in keys and nonces (#397): the parts that must be one transaction.
 *
 * Better Auth writes each row through its component, one call at a time,
 * so "is this Apple id free?" and "save it" could interleave with another
 * request. These mutations do each check and write in one transaction:
 *
 * - `claimKey`: the first user to claim an Apple id owns it. Better Auth
 *   calls it before it makes an `account` row (`auth.ts`,
 *   `databaseHooks.account.create.before`), on sign-in and on save. A
 *   claim with no `account` row behind it after `CLAIM_GRACE_MS` is stale
 *   (that write failed, or a remove failed halfway) and goes to the next
 *   user who claims the key.
 * - `releaseKey`: drops the claim when the key is removed (`removeKey`).
 * - `useKeyNonce`: a nonce works once (`model/keyNonce.ts`).
 *
 * All are internal: only the Better Auth routes (`http.ts`) call them.
 * `deleteKeysOf` runs in `deleteMyAccount`.
 */

import { v } from 'convex/values';

import { components } from './_generated/api';
import { internalMutation } from './_generated/server';
import type { MutationCtx } from './_generated/server';

/** Old nonce rows `useKeyNonce` deletes per call, so the table stays small. */
export const OLD_NONCES_PER_USE = 10;

/**
 * How long a claim stays its owner's with no `account` row behind it.
 * Better Auth writes that row right after the claim, so a younger claim
 * may still be on its way; an older one is stale.
 */
export const CLAIM_GRACE_MS = 60 * 1000;

/**
 * Claims `(providerId, accountId)` for `userId` at `now` (epoch ms).
 * Returns the owner: the same `userId` when the key was free, was
 * already theirs or held a stale claim, else the other user's id (and
 * writes nothing).
 */
export const claimKey = internalMutation({
  args: { providerId: v.string(), accountId: v.string(), userId: v.string(), now: v.number() },
  returns: v.string(),
  handler: async (ctx, { providerId, accountId, userId, now }) => {
    const owner = await ctx.db
      .query('authKeys')
      .withIndex('by_key', (q) => q.eq('providerId', providerId).eq('accountId', accountId))
      .unique();
    if (owner === null) {
      await ctx.db.insert('authKeys', { providerId, accountId, userId, claimedAt: now });
      return userId;
    }
    if (owner.userId === userId || now - owner.claimedAt < CLAIM_GRACE_MS) return owner.userId;
    // An old claim: it holds only when an `account` row has the key.
    const account: unknown = await ctx.runQuery(components.betterAuth.adapter.findOne, {
      model: 'account',
      where: [
        { field: 'providerId', value: providerId },
        { field: 'accountId', value: accountId },
      ],
    });
    if (account !== null) return owner.userId;
    await ctx.db.patch(owner._id, { userId, claimedAt: now });
    return userId;
  },
});

/** Drops `userId`'s claim on `(providerId, accountId)`. Another user's claim stays. */
export const releaseKey = internalMutation({
  args: { providerId: v.string(), accountId: v.string(), userId: v.string() },
  returns: v.null(),
  handler: async (ctx, { providerId, accountId, userId }) => {
    const owner = await ctx.db
      .query('authKeys')
      .withIndex('by_key', (q) => q.eq('providerId', providerId).eq('accountId', accountId))
      .unique();
    if (owner !== null && owner.userId === userId) await ctx.db.delete(owner._id);
    return null;
  },
});

/**
 * Marks `nonce` used. Returns `false` when it was used before. Also
 * deletes up to `OLD_NONCES_PER_USE` rows whose nonce ran out by `now`.
 */
export const useKeyNonce = internalMutation({
  args: { nonce: v.string(), expiresAt: v.number(), now: v.number() },
  returns: v.boolean(),
  handler: async (ctx, { nonce, expiresAt, now }) => {
    const old = await ctx.db
      .query('usedKeyNonces')
      .withIndex('by_expires', (q) => q.lte('expiresAt', now))
      .take(OLD_NONCES_PER_USE);
    for (const row of old) await ctx.db.delete(row._id);
    const used = await ctx.db
      .query('usedKeyNonces')
      .withIndex('by_nonce', (q) => q.eq('nonce', nonce))
      .first();
    if (used !== null) return false;
    await ctx.db.insert('usedKeyNonces', { nonce, expiresAt });
    return true;
  },
});

/**
 * Deletes every key claim of `userId` (account deletion). A user has at
 * most one key per provider, so these are few.
 */
export async function deleteKeysOf(ctx: MutationCtx, userId: string): Promise<void> {
  const keys = await ctx.db
    .query('authKeys')
    .withIndex('by_user', (q) => q.eq('userId', userId))
    .collect();
  for (const key of keys) await ctx.db.delete(key._id);
}

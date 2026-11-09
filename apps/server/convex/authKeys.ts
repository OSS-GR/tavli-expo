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
 *   user who claims the key. A user holds at most one key per provider:
 *   `/key/save` checks it too, but two saves at once would both pass.
 * - `releaseKey`: drops the claim when the key is removed (`removeKey`),
 *   and revokes its Apple token (`appleTokens.ts`, #398).
 * - `useKeyNonce`: a nonce works once (`model/keyNonce.ts`).
 *
 * All are internal: only the Better Auth routes (`http.ts`) call them.
 * `deleteKeysOf` runs in `deleteMyAccount`.
 */

import { v } from 'convex/values';

import { components } from './_generated/api';
import type { Doc } from './_generated/dataModel';
import { internalMutation } from './_generated/server';
import type { MutationCtx } from './_generated/server';
import { revokeAppleTokensOf } from './appleTokens';

/** Old nonce rows `useKeyNonce` deletes per call, so the table stays small. */
export const OLD_NONCES_PER_USE = 10;

/**
 * How long a claim stays its owner's with no `account` row behind it.
 * Better Auth writes that row right after the claim, so a younger claim
 * may still be on its way; an older one is stale.
 */
export const CLAIM_GRACE_MS = 60 * 1000;

/** What `claimKey` found. */
export const CLAIM_RESULTS = ['claimed', 'belongs-to-other', 'provider-taken'] as const;

export type ClaimResult = (typeof CLAIM_RESULTS)[number];

/**
 * True while `claim` holds: it is younger than `CLAIM_GRACE_MS` at `now`,
 * or an `account` row has its key.
 */
async function holds(ctx: MutationCtx, claim: Doc<'authKeys'>, now: number): Promise<boolean> {
  if (now - claim.claimedAt < CLAIM_GRACE_MS) return true;
  const account: unknown = await ctx.runQuery(components.betterAuth.adapter.findOne, {
    model: 'account',
    where: [
      { field: 'providerId', value: claim.providerId },
      { field: 'accountId', value: claim.accountId },
    ],
  });
  return account !== null;
}

/**
 * Claims `(providerId, accountId)` for `userId` at `now` (epoch ms).
 * - `claimed`: the key is `userId`'s now (it was free, theirs already, or
 *   held a stale claim).
 * - `belongs-to-other`: another user holds it. Nothing is written.
 * - `provider-taken`: `userId` holds another key of this provider (one
 *   Apple id per account). Nothing is written. A stale claim of theirs
 *   does not count, and is deleted.
 */
export const claimKey = internalMutation({
  args: { providerId: v.string(), accountId: v.string(), userId: v.string(), now: v.number() },
  returns: v.union(...CLAIM_RESULTS.map((result) => v.literal(result))),
  handler: async (ctx, { providerId, accountId, userId, now }): Promise<ClaimResult> => {
    const owner = await ctx.db
      .query('authKeys')
      .withIndex('by_key', (q) => q.eq('providerId', providerId).eq('accountId', accountId))
      .unique();
    if (owner !== null && owner.userId === userId) return 'claimed';
    if (owner !== null && (await holds(ctx, owner, now))) return 'belongs-to-other';
    const mine = await ctx.db
      .query('authKeys')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .collect();
    for (const other of mine) {
      if (other.providerId !== providerId) continue;
      if (await holds(ctx, other, now)) return 'provider-taken';
      await ctx.db.delete(other._id);
    }
    if (owner === null) {
      await ctx.db.insert('authKeys', { providerId, accountId, userId, claimedAt: now });
    } else {
      await ctx.db.patch(owner._id, { userId, claimedAt: now });
    }
    return 'claimed';
  },
});

/** Drops `userId`'s claim on `(providerId, accountId)`. Another user's claim stays. */
export async function releaseClaim(
  ctx: MutationCtx,
  { providerId, accountId, userId }: { providerId: string; accountId: string; userId: string },
): Promise<void> {
  const owner = await ctx.db
    .query('authKeys')
    .withIndex('by_key', (q) => q.eq('providerId', providerId).eq('accountId', accountId))
    .unique();
  if (owner !== null && owner.userId === userId) await ctx.db.delete(owner._id);
}

/**
 * The key was removed (`/key/remove`): drops the claim, and revokes the
 * key's Apple token (#398).
 */
export const releaseKey = internalMutation({
  args: { providerId: v.string(), accountId: v.string(), userId: v.string() },
  returns: v.null(),
  handler: async (ctx, key) => {
    await releaseClaim(ctx, key);
    if (key.providerId === 'apple') await revokeAppleTokensOf(ctx, key.userId, key.accountId);
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

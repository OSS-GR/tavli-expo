/**
 * Email sign-in codes (#399): the parts that must be one transaction.
 * The pure rules are in `model/emailCode.ts`; the routes are in
 * `keyPlugin.ts`.
 *
 * - `startEmailCode`: checks the send limits, logs the send and keeps the
 *   new code (hashed), all at once, so two requests at the same moment
 *   cannot both slip under a limit. A new code replaces the address's
 *   last one.
 * - `useEmailCode`: checks a code and counts a wrong try in the same
 *   transaction, so guesses sent in parallel get no extra tries.
 *
 * Both clear a few old rows each time, so the tables stay small with no
 * scheduled job. All are internal: only the Better Auth routes call them.
 */

import { v } from 'convex/values';

import { EMAIL_CODE_TRIES } from '@tavli/contracts';

import { internalMutation } from './_generated/server';
import type { MutationCtx } from './_generated/server';
import {
  ADDRESS_LIMITS,
  ALL_SENDS,
  CALLER_LIMITS,
  DAY,
  SEND_LOG_MS,
  sendWait,
} from './model/emailCode';
import { sameText } from './model/keyNonce';

/** Old rows each call deletes. */
export const OLD_ROWS_PER_CALL = 10;

/** The send times of one log bucket that still count at `now`. */
async function sendTimes(ctx: MutationCtx, bucket: string, now: number): Promise<number[]> {
  const rows = await ctx.db
    .query('emailCodeSends')
    .withIndex('by_bucket', (q) => q.eq('bucket', bucket).gt('at', now - SEND_LOG_MS))
    .collect();
  return rows.map((row) => row.at);
}

async function dropOldRows(ctx: MutationCtx, now: number): Promise<void> {
  const sends = await ctx.db
    .query('emailCodeSends')
    .withIndex('by_at', (q) => q.lte('at', now - SEND_LOG_MS))
    .take(OLD_ROWS_PER_CALL);
  for (const row of sends) await ctx.db.delete(row._id);
  const codes = await ctx.db
    .query('emailCodes')
    .withIndex('by_expires', (q) => q.lte('expiresAt', now))
    .take(OLD_ROWS_PER_CALL);
  for (const row of codes) await ctx.db.delete(row._id);
}

export const startEmailCode = internalMutation({
  args: {
    /** `addressKey` of the address. */
    address: v.string(),
    /** `callerKey` of the caller, or `null` when the request names none. */
    caller: v.union(v.string(), v.null()),
    /** `codeKey` of the new code. */
    codeHash: v.string(),
    expiresAt: v.number(),
    now: v.number(),
    /** The server-wide cap a day (`codesPerDay`). */
    perDay: v.number(),
  },
  handler: async (ctx, args): Promise<{ ok: true } | { ok: false; retryAfterMs: number }> => {
    const { now } = args;
    await dropOldRows(ctx, now);
    const buckets: { bucket: string; limits: readonly { windowMs: number; max: number }[] }[] = [
      { bucket: `address:${args.address}`, limits: ADDRESS_LIMITS },
      { bucket: ALL_SENDS, limits: [{ windowMs: DAY, max: args.perDay }] },
    ];
    if (args.caller !== null)
      buckets.push({ bucket: `caller:${args.caller}`, limits: CALLER_LIMITS });
    let wait = 0;
    for (const { bucket, limits } of buckets) {
      wait = Math.max(wait, sendWait(await sendTimes(ctx, bucket, now), limits, now));
    }
    if (wait > 0) return { ok: false, retryAfterMs: wait };

    for (const { bucket } of buckets) await ctx.db.insert('emailCodeSends', { bucket, at: now });
    const old = await ctx.db
      .query('emailCodes')
      .withIndex('by_address', (q) => q.eq('address', args.address))
      .collect();
    for (const row of old) await ctx.db.delete(row._id);
    await ctx.db.insert('emailCodes', {
      address: args.address,
      codeHash: args.codeHash,
      expiresAt: args.expiresAt,
      tries: 0,
    });
    return { ok: true };
  },
});

/** What `useEmailCode` found. */
export type EmailCodeUse =
  /** The right code: it is used up now. */
  | 'ok'
  /** A wrong code; the code still takes more tries. */
  | 'wrong'
  /** No live code: none sent, run out, used, or this was the last wrong try. */
  | 'dead';

export const useEmailCode = internalMutation({
  args: { address: v.string(), codeHash: v.string(), now: v.number() },
  handler: async (ctx, { address, codeHash, now }): Promise<EmailCodeUse> => {
    const row = await ctx.db
      .query('emailCodes')
      .withIndex('by_address', (q) => q.eq('address', address))
      .first();
    if (row === null) return 'dead';
    if (row.expiresAt <= now) {
      await ctx.db.delete(row._id);
      return 'dead';
    }
    if (sameText(row.codeHash, codeHash)) {
      await ctx.db.delete(row._id);
      return 'ok';
    }
    const tries = row.tries + 1;
    if (tries >= EMAIL_CODE_TRIES) {
      await ctx.db.delete(row._id);
      return 'dead';
    }
    await ctx.db.patch(row._id, { tries });
    return 'wrong';
  },
});

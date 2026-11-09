/**
 * Email sign-in codes (#399): the parts that must be one transaction.
 * The pure rules are in `model/emailCode.ts`; the routes are in
 * `keyPlugin.ts`.
 *
 * - `startEmailCode`: checks the send limits, logs the send and keeps the
 *   new code (hashed) with its ticket, all at once, so two requests at the
 *   same moment cannot both slip under a limit. An address may have more
 *   than one live code (one per send, at most `ADDRESS_LIMITS`): a new
 *   send never ends another phone's code.
 * - `cancelEmailCode`: takes a send back when the mail did not go out, so
 *   a mail failure costs neither the old code nor the send limits.
 * - `useEmailCode`: finds the code by its ticket, checks it and counts a
 *   wrong try in the same transaction, so guesses sent in parallel get no
 *   extra tries. A try without the ticket reaches no code.
 *
 * Both clear a few old rows each time, so the tables stay small with no
 * scheduled job. All are internal: only the Better Auth routes call them.
 */

import { v } from 'convex/values';

import { EMAIL_CODE_TRIES } from '@tavli/contracts';

import type { Id } from './_generated/dataModel';
import { internalMutation } from './_generated/server';
import type { MutationCtx } from './_generated/server';
import {
  ADDRESS_LIMITS,
  CALLER_LIMITS,
  DAY,
  NEW_ADDRESS_SENDS,
  SEND_LOG_MS,
  sendWait,
  type SendLimit,
} from './model/emailCode';
import { sameText } from './model/keyNonce';

/** Old rows each call deletes. */
export const OLD_ROWS_PER_CALL = 10;

/**
 * The newest send times of one log bucket that still count at `now`: as
 * many as the largest limit, which is all `sendWait` needs.
 */
async function sendTimes(
  ctx: MutationCtx,
  bucket: string,
  limits: readonly SendLimit[],
  now: number,
): Promise<number[]> {
  const rows = await ctx.db
    .query('emailCodeSends')
    .withIndex('by_bucket', (q) => q.eq('bucket', bucket).gt('at', now - SEND_LOG_MS))
    .order('desc')
    .take(Math.max(...limits.map((limit) => limit.max)));
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
    /** `ticketKey` of the new code's ticket. */
    ticket: v.string(),
    /** Whether the address is an email key already: then the day cap does not count. */
    known: v.boolean(),
    expiresAt: v.number(),
    now: v.number(),
    /** The day cap for new addresses (`codesPerDay`). */
    perDay: v.number(),
  },
  handler: async (ctx, args): Promise<EmailCodeStart> => {
    const { now } = args;
    await dropOldRows(ctx, now);
    const buckets: { bucket: string; limits: readonly SendLimit[] }[] = [
      { bucket: `address:${args.address}`, limits: ADDRESS_LIMITS },
    ];
    if (!args.known) {
      buckets.push({ bucket: NEW_ADDRESS_SENDS, limits: [{ windowMs: DAY, max: args.perDay }] });
    }
    if (args.caller !== null)
      buckets.push({ bucket: `caller:${args.caller}`, limits: CALLER_LIMITS });
    let wait = 0;
    for (const { bucket, limits } of buckets) {
      wait = Math.max(wait, sendWait(await sendTimes(ctx, bucket, limits, now), limits, now));
    }
    if (wait > 0) return { ok: false, retryAfterMs: wait };

    const sends: Id<'emailCodeSends'>[] = [];
    for (const { bucket } of buckets) {
      sends.push(await ctx.db.insert('emailCodeSends', { bucket, at: now }));
    }
    const code = await ctx.db.insert('emailCodes', {
      ticket: args.ticket,
      address: args.address,
      codeHash: args.codeHash,
      expiresAt: args.expiresAt,
      tries: 0,
    });
    return { ok: true, code, sends };
  },
});

/** What `startEmailCode` gives: the new rows, so a failed mail can take them back. */
export type EmailCodeStart =
  | { ok: true; code: Id<'emailCodes'>; sends: Id<'emailCodeSends'>[] }
  | { ok: false; retryAfterMs: number };

/** Takes a send back: its code and its send log rows. */
export const cancelEmailCode = internalMutation({
  args: { code: v.id('emailCodes'), sends: v.array(v.id('emailCodeSends')) },
  returns: v.null(),
  handler: async (ctx, { code, sends }) => {
    if ((await ctx.db.get(code)) !== null) await ctx.db.delete(code);
    for (const id of sends) {
      if ((await ctx.db.get(id)) !== null) await ctx.db.delete(id);
    }
    return null;
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
  args: { ticket: v.string(), address: v.string(), codeHash: v.string(), now: v.number() },
  handler: async (ctx, { ticket, address, codeHash, now }): Promise<EmailCodeUse> => {
    const row = await ctx.db
      .query('emailCodes')
      .withIndex('by_ticket', (q) => q.eq('ticket', ticket))
      .unique();
    // No code for this ticket, or the ticket of another address: nothing to count.
    if (row === null || !sameText(row.address, address)) return 'dead';
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

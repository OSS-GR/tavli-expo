/**
 * Block and report (#320, App Store guideline 1.2): usernames (#405) are
 * content that players write.
 *
 * - `blockPlayer`, `unblockPlayer`, `listMyBlocks`: a block hides the
 *   blocked player's name from the blocker (`getGame`, `listMyGames`,
 *   `getInvite` show `null`), and `acceptInvite` refuses an invite between
 *   the two (`BLOCKED`, both ways). Running games go on.
 * - `reportPlayer`: a reason from `REPORT_REASONS` and the reported
 *   player's username at that moment, in the `reports` table. It blocks
 *   too. One report per pair while the owner keeps it; at most
 *   `MAX_REPORTS_PER_DAY` per reporter in 24 hours.
 * - The owner reads `reports` in the Convex dashboard and deletes each
 *   row there after the review. A report has no end date: it stays until
 *   the owner deletes it, or until the account delete of either player.
 *
 * A player may block or report only someone they met: a game between the
 * two (`games.by_pair`) or an invite one answered from the other
 * (`invites.by_answer`), and only while that account exists. The checks
 * are in `@tavli/online` (`safety.ts`), which the in-memory server runs
 * too: never copy them here. This file adds the database.
 *
 * The account delete (`deleteAccountOf`) schedules `deleteSafetyRows`:
 * the caller's blocks both ways and the reports by and about them, in
 * pages. Never send ids, names or reasons to analytics or the logs.
 */

import { ConvexError, v } from 'convex/values';

import { MAX_BLOCKS, MAX_REPORTS_PER_DAY } from '@tavli/contracts';
import type { BlockedPlayer, PlayerName, SafetyErrorCode } from '@tavli/contracts';
import {
  SafetyError,
  checkBlockCap,
  checkMet,
  checkReason,
  checkReportCap,
  checkTarget,
  reportWindowStart,
} from '@tavli/online';

import { internal } from './_generated/api';
import { internalMutation, mutation, query } from './_generated/server';
import type { MutationCtx, QueryCtx } from './_generated/server';
import { authComponent } from './auth';
import { existingPlayer, signedInPlayer } from './caller';
import { nameOf, nameRowOf } from './playerNames';

/** Throws a `ConvexError` with `SafetyErrorData`, so clients get the code. */
function fail(code: SafetyErrorCode, message: string): never {
  // A plain object literal, so it fits Convex's `Value` type.
  const data: { code: SafetyErrorCode; message: string } = { code, message };
  throw new ConvexError(data);
}

/** Runs `step`; a `SafetyError` becomes a `ConvexError`. */
function guarded<T>(step: () => T): T {
  try {
    return step();
  } catch (error) {
    if (error instanceof SafetyError) fail(error.code, error.message);
    throw error;
  }
}

/** The block of `blockedId` by `blockerId`, or `null`. */
async function blockRow(ctx: QueryCtx, blockerId: string, blockedId: string) {
  return await ctx.db
    .query('blocks')
    .withIndex('by_blocker', (q) => q.eq('blockerId', blockerId).eq('blockedId', blockedId))
    .first();
}

/** `blockerId` blocks `blockedId`. */
export async function blocks(ctx: QueryCtx, blockerId: string, blockedId: string) {
  return (await blockRow(ctx, blockerId, blockedId)) !== null;
}

/** One of the two blocks the other (`acceptInvite`). */
export async function eitherBlocks(ctx: QueryCtx, a: string, b: string): Promise<boolean> {
  const [ab, ba] = await Promise.all([blocks(ctx, a, b), blocks(ctx, b, a)]);
  return ab || ba;
}

/** The name `viewerId` sees for `playerId`: `null` when the viewer blocks them. */
export async function nameSeenBy(
  ctx: QueryCtx,
  viewerId: string,
  playerId: string,
): Promise<PlayerName | null> {
  if (viewerId !== playerId && (await blocks(ctx, viewerId, playerId))) return null;
  return await nameOf(ctx, playerId);
}

/** A game between `white` and `black`, in this order of sides. */
async function gameBetween(ctx: QueryCtx, white: string, black: string): Promise<boolean> {
  const game = await ctx.db
    .query('games')
    .withIndex('by_pair', (q) => q.eq('players.white', white).eq('players.black', black))
    .first();
  return game !== null;
}

/** An invite from `from` that `answeredBy` accepted or declined. */
async function answeredInvite(ctx: QueryCtx, from: string, answeredBy: string): Promise<boolean> {
  const invite = await ctx.db
    .query('invites')
    .withIndex('by_answer', (q) => q.eq('from', from).eq('answeredBy', answeredBy))
    .first();
  return invite !== null;
}

/**
 * The two met (`checkMet`): a game, or an invite one answered from the
 * other. And `playerId` still has an account: finished games outlive it.
 * Five indexed lookups at most.
 */
async function met(ctx: QueryCtx, callerId: string, playerId: string): Promise<boolean> {
  if ((await authComponent.getAnyUserById(ctx, playerId)) === null) return false;
  const found = await Promise.all([
    gameBetween(ctx, callerId, playerId),
    gameBetween(ctx, playerId, callerId),
    answeredInvite(ctx, callerId, playerId),
    answeredInvite(ctx, playerId, callerId),
  ]);
  return found.some(Boolean);
}

/** How many players `blockerId` blocks, counted up to `MAX_BLOCKS`. */
async function blockCount(ctx: QueryCtx, blockerId: string): Promise<number> {
  const rows = await ctx.db
    .query('blocks')
    .withIndex('by_blocker', (q) => q.eq('blockerId', blockerId))
    .take(MAX_BLOCKS);
  return rows.length;
}

/** Saves the block, after the checks. A block that is there already changes nothing. */
async function addBlock(ctx: MutationCtx, callerId: string, playerId: string): Promise<void> {
  if (await blocks(ctx, callerId, playerId)) return;
  const count = await blockCount(ctx, callerId);
  guarded(() => checkBlockCap(count));
  await ctx.db.insert('blocks', {
    blockerId: callerId,
    blockedId: playerId,
    createdAt: Date.now(),
  });
}

/** The caller blocks `playerId` (see the top of this file). */
export const blockPlayer = mutation({
  args: { playerId: v.string() },
  returns: v.null(),
  handler: async (ctx, { playerId }) => {
    const callerId = await existingPlayer(ctx);
    guarded(() => checkTarget(callerId, playerId));
    const known = await met(ctx, callerId, playerId);
    guarded(() => checkMet(known));
    await addBlock(ctx, callerId, playerId);
    return null;
  },
});

/** The caller's block of `playerId` ends. No block: no change. */
export const unblockPlayer = mutation({
  args: { playerId: v.string() },
  returns: v.null(),
  handler: async (ctx, { playerId }) => {
    const callerId = await signedInPlayer(ctx);
    const row = await blockRow(ctx, callerId, playerId);
    if (row !== null) await ctx.db.delete(row._id);
    return null;
  },
});

/** The players the caller blocks, newest block first, with their names now. */
export const listMyBlocks = query({
  args: {},
  handler: async (ctx): Promise<BlockedPlayer[]> => {
    const callerId = await signedInPlayer(ctx);
    // `MAX_BLOCKS` caps the rows: `addBlock` checks it.
    const rows = await ctx.db
      .query('blocks')
      .withIndex('by_blocker', (q) => q.eq('blockerId', callerId))
      .take(MAX_BLOCKS);
    const listed = await Promise.all(
      rows.map(async (row) => ({
        playerId: row.blockedId,
        name: await nameOf(ctx, row.blockedId),
        blockedAt: row.createdAt,
      })),
    );
    return listed.sort((a, b) => b.blockedAt - a.blockedAt);
  },
});

/**
 * The caller reports `playerId`, and blocks them. A second report of the
 * same player adds no row while the first is kept. `reason` is checked by
 * `checkReason`, so a wrong one gets `BAD_REQUEST`, not a validator error.
 */
export const reportPlayer = mutation({
  args: { playerId: v.string(), reason: v.string() },
  returns: v.null(),
  handler: async (ctx, request) => {
    const callerId = await existingPlayer(ctx);
    const reason = guarded(() => checkReason(request.reason));
    const { playerId } = request;
    guarded(() => checkTarget(callerId, playerId));
    const known = await met(ctx, callerId, playerId);
    guarded(() => checkMet(known));
    const kept = await ctx.db
      .query('reports')
      .withIndex('by_pair', (q) => q.eq('reporterId', callerId).eq('reportedId', playerId))
      .first();
    if (kept === null) {
      const now = Date.now();
      const recent = await ctx.db
        .query('reports')
        .withIndex('by_reporter', (q) =>
          q.eq('reporterId', callerId).gt('createdAt', reportWindowStart(now)),
        )
        .take(MAX_REPORTS_PER_DAY);
      guarded(() => checkReportCap(recent.length));
      const username = (await nameRowOf(ctx, playerId))?.username;
      await ctx.db.insert('reports', {
        reporterId: callerId,
        reportedId: playerId,
        reason,
        ...(username === undefined ? {} : { username }),
        createdAt: now,
      });
    }
    // A full block list does not stop the report.
    if ((await blockCount(ctx, callerId)) < MAX_BLOCKS) await addBlock(ctx, callerId, playerId);
    return null;
  },
});

/**
 * How many rows one run of `deleteSafetyRows` deletes: one write each,
 * far below Convex's limit of 16,000 writes per transaction.
 */
export const SAFETY_DELETE_PAGE = 200;

/** The ranges `deleteSafetyRows` empties, in order. */
const SAFETY_RANGES = ['blocksBy', 'blocksOf', 'reportsBy', 'reportsAbout'] as const;

/** Up to `limit` rows of one range of `playerId`. */
async function rangePage(
  ctx: MutationCtx,
  range: (typeof SAFETY_RANGES)[number],
  playerId: string,
  limit: number,
) {
  switch (range) {
    case 'blocksBy':
      return await ctx.db
        .query('blocks')
        .withIndex('by_blocker', (q) => q.eq('blockerId', playerId))
        .take(limit);
    case 'blocksOf':
      return await ctx.db
        .query('blocks')
        .withIndex('by_blocked', (q) => q.eq('blockedId', playerId))
        .take(limit);
    case 'reportsBy':
      return await ctx.db
        .query('reports')
        .withIndex('by_reporter', (q) => q.eq('reporterId', playerId))
        .take(limit);
    case 'reportsAbout':
      return await ctx.db
        .query('reports')
        .withIndex('by_reported', (q) => q.eq('reportedId', playerId))
        .take(limit);
  }
}

/**
 * Deletes up to `SAFETY_DELETE_PAGE` blocks and reports of `playerId`, a
 * deleted account, and runs again while there may be more. Scheduled by
 * `deleteAccountOf`. No new row can name the player once the account is
 * gone: `blockPlayer` and `reportPlayer` need it to exist, both as the
 * caller and as the other player.
 */
export const deleteSafetyRows = internalMutation({
  args: { playerId: v.string() },
  returns: v.null(),
  handler: async (ctx, { playerId }) => {
    let left = SAFETY_DELETE_PAGE;
    for (const range of SAFETY_RANGES) {
      const rows = await rangePage(ctx, range, playerId, left);
      for (const row of rows) await ctx.db.delete(row._id);
      left -= rows.length;
      if (left === 0) {
        await ctx.scheduler.runAfter(0, internal.safety.deleteSafetyRows, { playerId });
        return null;
      }
    }
    return null;
  },
});

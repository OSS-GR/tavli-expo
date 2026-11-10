/**
 * The friend rows (#406) that other files read or change: `safety.ts`
 * (a block ends a friendship; a friend or a request counts as "met") and
 * `games.ts` (a match that ends between friends goes into their record).
 * The public friend functions are in `friends.ts`. This file imports no
 * other function file, so `games.ts` and `safety.ts` can import it
 * without a cycle.
 */

import { recordAfter } from '@tavli/online';
import type { FriendRequestRecord } from '@tavli/online';
import type { PerPlayer, PlayerId } from '@tavli/engine';

import type { Doc } from './_generated/dataModel';
import type { MutationCtx, QueryCtx } from './_generated/server';

/** The row of `playerId`'s friendship with `friendId`, or `null`. */
export async function friendRow(
  ctx: QueryCtx,
  playerId: string,
  friendId: string,
): Promise<Doc<'friends'> | null> {
  return await ctx.db
    .query('friends')
    .withIndex('by_pair', (q) => q.eq('playerId', playerId).eq('friendId', friendId))
    .first();
}

/** The two are friends. */
export async function isFriend(ctx: QueryCtx, a: string, b: string): Promise<boolean> {
  return (await friendRow(ctx, a, b)) !== null;
}

/** The request from `fromId` to `toId`, or `null`. */
export async function requestRow(
  ctx: QueryCtx,
  fromId: string,
  toId: string,
): Promise<Doc<'friendRequests'> | null> {
  return await ctx.db
    .query('friendRequests')
    .withIndex('by_pair', (q) => q.eq('fromId', fromId).eq('toId', toId))
    .first();
}

/** A request row as `@tavli/online` reads it. */
export function requestRecord(row: Doc<'friendRequests'> | null): FriendRequestRecord | null {
  if (row === null) return null;
  return { status: row.status, createdAt: row.createdAt, declinedAt: row.declinedAt };
}

/**
 * Ends the friendship of `a` and `b` (both rows) and deletes the requests
 * between them, both ways. Nothing there: no change. At most four rows.
 */
export async function endFriendship(ctx: MutationCtx, a: string, b: string): Promise<void> {
  const rows = await Promise.all([
    friendRow(ctx, a, b),
    friendRow(ctx, b, a),
    requestRow(ctx, a, b),
    requestRow(ctx, b, a),
  ]);
  for (const row of rows) if (row !== null) await ctx.db.delete(row._id);
}

/**
 * The two met through friends: they are friends, or one asked the other.
 * For `met` in `safety.ts` (block, report, and a request by id).
 */
export async function metAsFriends(ctx: QueryCtx, a: string, b: string): Promise<boolean> {
  const found = await Promise.all([
    friendRow(ctx, a, b),
    requestRow(ctx, a, b),
    requestRow(ctx, b, a),
  ]);
  return found.some((row) => row !== null);
}

/**
 * Adds a match that just ended to the record of its two players, when
 * they are friends (`games.ts`, in the save that ended it). `winner` is
 * the side that won the match.
 */
export async function recordFriendMatch(
  ctx: MutationCtx,
  players: PerPlayer<string>,
  winner: PlayerId,
): Promise<void> {
  const winnerId = players[winner];
  const loserId = winner === 'white' ? players.black : players.white;
  const [won, lost] = await Promise.all([
    friendRow(ctx, winnerId, loserId),
    friendRow(ctx, loserId, winnerId),
  ]);
  if (won !== null) await ctx.db.patch(won._id, recordAfter(won, true));
  if (lost !== null) await ctx.db.patch(lost._id, recordAfter(lost, false));
}

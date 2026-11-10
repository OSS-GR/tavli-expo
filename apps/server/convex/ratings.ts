/**
 * Ratings and leaderboards (#407, ADR-0008 item 9): the `Ratings` port of
 * `@tavli/contracts` on Convex. See "Ratings" in
 * `docs/architecture/online-game-service.md`.
 *
 * - The math, the pair count and the board rules are in `@tavli/online`
 *   (`ratings.ts`), which the in-memory server runs too: never copy them
 *   here. This file adds the database.
 * - `rateMatch` runs in the save that ends a match (`save` in
 *   `games.ts`): both players must have a saved account then, and the
 *   pair must be under `RATED_MATCHES_PER_PAIR_PER_DAY` that UTC day
 *   (`ratedPairs`). A match that ends by an account delete is never rated
 *   (`resignAs(…, false)`).
 * - Only saved players have a `ratings` row: a guest has none, so the
 *   guest move (#403) has nothing to move here.
 * - The global board reads `by_board` best first and keeps the rows with
 *   a username. The rows the caller blocked go (#320).
 *
 * Every public function reads the caller from the sign-in and needs a
 * saved account. `deleteAccountOf` deletes the caller's row at once and
 * schedules `deleteRatedPairs` for the pair counts, in pages. Never send
 * ids, names or ratings to analytics or the logs.
 */

import { ConvexError, v } from 'convex/values';

import { GLOBAL_BOARD_ROWS, MAX_BLOCKS, MAX_FRIENDS } from '@tavli/contracts';
import type { BoardRow, MyRating, PlayerName, RatingsErrorCode } from '@tavli/contracts';
import {
  NEW_RATING,
  RatingsError,
  afterRatedMatch,
  checkRatingsSaved,
  friendsBoardRows,
  globalBoardRows,
  isBoardable,
  nameFrom,
  pairOf,
  planRatedMatch,
  shownRating,
} from '@tavli/online';
import type { BoardPlayer, RatingRecord } from '@tavli/online';
import type { PerPlayer, PlayerId } from '@tavli/engine';

import { internal } from './_generated/api';
import type { Doc } from './_generated/dataModel';
import { internalMutation, mutation, query } from './_generated/server';
import type { MutationCtx, QueryCtx } from './_generated/server';
import { authComponent } from './auth';
import { signedInPlayer } from './caller';
import { nameRowOf } from './playerNames';

/** How many rows of the board index the global board reads at most. */
export const GLOBAL_BOARD_READ = GLOBAL_BOARD_ROWS + MAX_BLOCKS + 50;

/** How many pair rows one run of `deleteRatedPairs` deletes. */
export const RATED_PAIR_DELETE_PAGE = 200;

const myRatingValue = v.object({
  rating: v.number(),
  matches: v.number(),
  shown: v.boolean(),
  listed: v.boolean(),
});

const playerName = v.union(
  v.object({ kind: v.literal('guest'), number: v.string() }),
  v.object({ kind: v.literal('username'), name: v.string() }),
);

const boardRow = v.object({
  playerId: v.string(),
  name: v.union(playerName, v.null()),
  rating: v.number(),
  matches: v.number(),
  rank: v.number(),
  me: v.boolean(),
});

/** Throws a `ConvexError` with `RatingsErrorData`, so clients get the code. */
function fail(code: RatingsErrorCode, message: string): never {
  const data: { code: RatingsErrorCode; message: string } = { code, message };
  throw new ConvexError(data);
}

/** Runs `step`; a `RatingsError` becomes a `ConvexError`. */
function guarded<T>(step: () => T): T {
  try {
    return step();
  } catch (error) {
    if (error instanceof RatingsError) fail(error.code, error.message);
    throw error;
  }
}

/**
 * The caller, who must have a saved account. `NOT_SIGNED_IN` with no
 * token, or when the Better Auth user is gone; `NOT_SAVED` for a guest.
 */
async function savedCaller(ctx: QueryCtx): Promise<string> {
  let playerId: string;
  try {
    playerId = await signedInPlayer(ctx);
  } catch {
    fail('NOT_SIGNED_IN', 'sign in first');
  }
  const user = await authComponent.getAnyUserById(ctx, playerId);
  if (user === null) fail('NOT_SIGNED_IN', 'this account does not exist');
  guarded(() => checkRatingsSaved(user.isAnonymous !== true));
  return playerId;
}

async function isSavedPlayer(ctx: QueryCtx, playerId: string): Promise<boolean> {
  const user = await authComponent.getAnyUserById(ctx, playerId);
  return user !== null && user.isAnonymous !== true;
}

/** The rating row of `playerId`, or `null` (no rated match, "Show me" never changed). */
export async function ratingRow(ctx: QueryCtx, playerId: string): Promise<Doc<'ratings'> | null> {
  return await ctx.db
    .query('ratings')
    .withIndex('by_player', (q) => q.eq('playerId', playerId))
    .first();
}

/** The row's record and "Show me", or a new player's. */
function recordOf(row: Doc<'ratings'> | null): RatingRecord & { readonly shown: boolean } {
  if (row === null) return { ...NEW_RATING, shown: true };
  return { rating: row.rating, experience: row.experience, matches: row.matches, shown: row.shown };
}

/** Saves `record` for `playerId` (`row`: their row, if any). */
async function writeRating(
  ctx: MutationCtx,
  playerId: string,
  row: Doc<'ratings'> | null,
  record: RatingRecord & { readonly shown: boolean },
): Promise<void> {
  const fields = { ...record, boardable: isBoardable(record) };
  if (row === null) await ctx.db.insert('ratings', { playerId, ...fields });
  else await ctx.db.patch(row._id, fields);
}

async function pairRow(ctx: QueryCtx, a: string, b: string) {
  const [first, second] = pairOf(a, b);
  return await ctx.db
    .query('ratedPairs')
    .withIndex('by_pair', (q) => q.eq('a', first).eq('b', second))
    .first();
}

/**
 * A match between `players` just ended with `winner` (`games.ts`, in the
 * save that ended it): rates it when both players have a saved account
 * and the pair is under its count for the UTC day of `now`.
 */
export async function rateMatch(
  ctx: MutationCtx,
  players: PerPlayer<string>,
  winner: PlayerId,
  length: number,
  now: number,
): Promise<void> {
  const winnerId = players[winner];
  const loserId = winner === 'white' ? players.black : players.white;
  const [winnerSaved, loserSaved, pair] = await Promise.all([
    isSavedPlayer(ctx, winnerId),
    isSavedPlayer(ctx, loserId),
    pairRow(ctx, winnerId, loserId),
  ]);
  const plan = planRatedMatch({
    saved: winnerSaved && loserSaved,
    pair: pair === null ? null : { day: pair.day, count: pair.count },
    now,
  });
  if (!plan.rated) return;
  if (pair === null) {
    const [a, b] = pairOf(winnerId, loserId);
    await ctx.db.insert('ratedPairs', { a, b, ...plan.pair });
  } else {
    await ctx.db.patch(pair._id, plan.pair);
  }
  const [wonRow, lostRow] = await Promise.all([ratingRow(ctx, winnerId), ratingRow(ctx, loserId)]);
  const won = recordOf(wonRow);
  const lost = recordOf(lostRow);
  const next = afterRatedMatch(won, lost, length);
  await writeRating(ctx, winnerId, wonRow, { ...next.winner, shown: won.shown });
  await writeRating(ctx, loserId, lostRow, { ...next.loser, shown: lost.shown });
}

/** The username of `playerId` as a name, or `null` with none. */
async function usernameOf(ctx: QueryCtx, playerId: string): Promise<PlayerName | null> {
  const row = await nameRowOf(ctx, playerId);
  return row?.username === undefined ? null : nameFrom(row);
}

/** The caller's rating, also before the first rated match. */
export const myRating = query({
  args: {},
  returns: myRatingValue,
  handler: async (ctx): Promise<MyRating> => {
    const playerId = await savedCaller(ctx);
    const record = recordOf(await ratingRow(ctx, playerId));
    return {
      rating: shownRating(record.rating),
      matches: record.matches,
      shown: record.shown,
      listed: isBoardable(record) && (await usernameOf(ctx, playerId)) !== null,
    };
  },
});

/** The caller and their friends with a rated match, best first. */
export const friendsBoard = query({
  args: {},
  returns: v.array(boardRow),
  handler: async (ctx): Promise<BoardRow[]> => {
    const playerId = await savedCaller(ctx);
    const friends = await ctx.db
      .query('friends')
      .withIndex('by_player', (q) => q.eq('playerId', playerId))
      .take(MAX_FRIENDS);
    const ids = [playerId, ...friends.map((row) => row.friendId)];
    const players = await Promise.all(
      ids.map(async (id): Promise<BoardPlayer | null> => {
        const row = await ratingRow(ctx, id);
        if (id !== playerId && (row === null || row.matches === 0)) return null;
        const { rating, matches } = recordOf(row);
        return { playerId: id, name: nameFrom(await nameRowOf(ctx, id)), rating, matches };
      }),
    );
    return friendsBoardRows(
      players.filter((player) => player !== null),
      playerId,
    );
  },
});

/**
 * The top `GLOBAL_BOARD_ROWS` listed players, best first. Reads at most
 * `GLOBAL_BOARD_READ` rows of `by_board`: enough for the rows with no
 * username and the players the caller blocked (`MAX_BLOCKS`).
 */
export const globalBoard = query({
  args: {},
  returns: v.array(boardRow),
  handler: async (ctx): Promise<BoardRow[]> => {
    const playerId = await savedCaller(ctx);
    const blocked = new Set(
      (
        await ctx.db
          .query('blocks')
          .withIndex('by_blocker', (q) => q.eq('blockerId', playerId))
          .take(MAX_BLOCKS)
      ).map((row) => row.blockedId),
    );
    const top: BoardPlayer[] = [];
    let visible = 0;
    let read = 0;
    for await (const row of ctx.db
      .query('ratings')
      .withIndex('by_board', (q) => q.eq('boardable', true))
      .order('desc')) {
      read += 1;
      const name = await usernameOf(ctx, row.playerId);
      if (name !== null) {
        top.push({ playerId: row.playerId, name, rating: row.rating, matches: row.matches });
        if (!blocked.has(row.playerId)) visible += 1;
      }
      if (visible === GLOBAL_BOARD_ROWS || read === GLOBAL_BOARD_READ) break;
    }
    return globalBoardRows(top, playerId, (id) => blocked.has(id));
  },
});

/** Turns "Show me on the global board" on or off. */
export const setShowOnBoard = mutation({
  args: { shown: v.boolean() },
  returns: v.null(),
  handler: async (ctx, { shown }) => {
    const playerId = await savedCaller(ctx);
    const row = await ratingRow(ctx, playerId);
    await writeRating(ctx, playerId, row, { ...recordOf(row), shown });
    return null;
  },
});

/** Deletes the rating row of `playerId` (account delete). The pair counts go in `deleteRatedPairs`. */
export async function deleteRatingOf(ctx: MutationCtx, playerId: string): Promise<void> {
  const row = await ratingRow(ctx, playerId);
  if (row !== null) await ctx.db.delete(row._id);
}

/**
 * Deletes the pair counts that name `playerId`, `RATED_PAIR_DELETE_PAGE`
 * rows a run, then runs again while rows are left. Scheduled by the
 * account delete, when the user is gone, so no new row can name them.
 */
export const deleteRatedPairs = internalMutation({
  args: { playerId: v.string() },
  returns: v.null(),
  handler: async (ctx, { playerId }) => {
    const first = await ctx.db
      .query('ratedPairs')
      .withIndex('by_pair', (q) => q.eq('a', playerId))
      .take(RATED_PAIR_DELETE_PAGE);
    const second = await ctx.db
      .query('ratedPairs')
      .withIndex('by_b', (q) => q.eq('b', playerId))
      .take(RATED_PAIR_DELETE_PAGE - first.length);
    const rows = [...first, ...second];
    for (const row of rows) await ctx.db.delete(row._id);
    if (rows.length === RATED_PAIR_DELETE_PAGE) {
      await ctx.scheduler.runAfter(0, internal.ratings.deleteRatedPairs, { playerId });
    }
    return null;
  },
});

/**
 * Play ranked matching (#531, ADR-0009): the `Matchmaking` port of
 * `@tavli/contracts` on Convex. See "Play ranked" in
 * `docs/architecture/online-game-service.md`.
 *
 * - The rules (the range, which seeks pair, the best pair first, the
 *   checks order, what a new seek does) are in `@tavli/online`
 *   (`matchmaking.ts`), which the in-memory server runs too: never copy
 *   them here. This file adds the database and the scheduler.
 * - A seek is one row of `seeks` per player. `seek` saves it and runs the
 *   matching of its game at once (`matchGame`). While it waits and its
 *   range still grows, `matchTick` runs the matching again every
 *   `MATCH_TICK_MS`; it stops once the range is at its widest, and with
 *   no seek nothing runs (no cron). New seeks run the matching too.
 * - A match starts the game through `insertGame` (the one helper that
 *   starts games) with `RANKED_TURN_TIME_MINUTES`, `RANKED_TARGET_POINTS`
 *   and `ranked: true`, and turns both rows `matched`, in the same
 *   mutation. Turn pushes follow the save path, as for every game.
 * - A waiting row ends at `createdAt + SEEK_TTL_MS` (`expireSeek`); a
 *   matched row goes `MATCHED_SEEK_KEEP_MS` after the match
 *   (`forgetSeek`). A row that is replaced or cancelled before its job
 *   runs is gone, so the job does nothing.
 *
 * Every public function reads the caller from the sign-in and needs a
 * saved account that exists. The account delete (`deleteAccountOf`)
 * deletes the caller's seek (`deleteSeeksOf`), so no match can start with
 * a deleted player. Never send ids, names or ratings to analytics or the
 * logs.
 */

import { ConvexError, v } from 'convex/values';

import {
  MATCHED_SEEK_KEEP_MS,
  RANKED_GAMES,
  RANKED_TARGET_POINTS,
  RANKED_TURN_TIME_MINUTES,
  SEEK_RANGE_GROW_MS,
  SEEK_TTL_MS,
} from '@tavli/contracts';
import type { LookingCounts, MatchmakingErrorCode, MySeek, RankedGame } from '@tavli/contracts';
import {
  MatchmakingError,
  NEW_RATING,
  checkRankedChoice,
  checkSeekSaved,
  countLooking,
  isMatchedSeekDone,
  isSeekExpired,
  liveSince,
  matchedPlayers,
  matchedSeek,
  mayPair,
  pickPairs,
  planSeek,
  shownRating,
  waitingSeek,
} from '@tavli/online';
import type { SeekRecord } from '@tavli/online';

import { internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import { internalMutation, mutation, query } from './_generated/server';
import type { MutationCtx, QueryCtx } from './_generated/server';
import { authComponent } from './auth';
import { signedInPlayer } from './caller';
import { insertGame } from './games';
import { pairRow, ratingRow } from './ratings';
import { blocks, nameSeenBy } from './safety';
import { rankedGame } from './schema';

/** How often the matching of a waiting seek runs again while its range grows. */
export const MATCH_TICK_MS = 5 * 1000;

/**
 * How many waiting seeks of one game the matching reads at most, oldest
 * first. With more players waiting for one game, the newer seeks join
 * the matching only as older ones leave (matched, cancelled or expired).
 * Fine at our scale; raise it (with `PAIR_CHECKS_PER_RUN` in mind) or
 * read by rating band when one game has more players waiting.
 */
export const MATCH_READ = 100;

/** How many waiting seeks of one game `lookingCounts` reads at most. */
export const LOOKING_READ = 100;

const playerName = v.union(
  v.object({ kind: v.literal('guest'), number: v.string() }),
  v.object({ kind: v.literal('username'), name: v.string() }),
);

const seekPlayer = v.object({ name: v.union(playerName, v.null()), rating: v.number() });

const mySeekValue = v.union(
  v.object({ kind: v.literal('none') }),
  v.object({
    kind: v.literal('waiting'),
    game: rankedGame,
    since: v.number(),
    rating: v.number(),
  }),
  v.object({
    kind: v.literal('matched'),
    game: rankedGame,
    gameId: v.string(),
    me: seekPlayer,
    opponent: seekPlayer,
  }),
);

const lookingCountsValue = v.object({
  portes: v.number(),
  plakoto: v.number(),
  fevga: v.number(),
  tavli: v.number(),
});

/** Throws a `ConvexError` with `MatchmakingErrorData`, so clients get the code. */
function fail(code: MatchmakingErrorCode, message: string): never {
  const data: { code: MatchmakingErrorCode; message: string } = { code, message };
  throw new ConvexError(data);
}

/** Runs `step`; a `MatchmakingError` becomes a `ConvexError`. */
function guarded<T>(step: () => T): T {
  try {
    return step();
  } catch (error) {
    if (error instanceof MatchmakingError) fail(error.code, error.message);
    throw error;
  }
}

/**
 * The caller, who must have a saved account that exists. `NOT_SIGNED_IN`
 * with no token, or when the Better Auth user is gone (a token outlives
 * its user, #306); `NOT_SAVED` for a guest.
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
  guarded(() => checkSeekSaved(user.isAnonymous !== true));
  return playerId;
}

/** The seek row of `playerId`, or `null`. */
async function seekRow(ctx: QueryCtx, playerId: string): Promise<Doc<'seeks'> | null> {
  return await ctx.db
    .query('seeks')
    .withIndex('by_player', (q) => q.eq('playerId', playerId))
    .first();
}

function recordOf(row: Doc<'seeks'>): SeekRecord & { readonly id: Id<'seeks'> } {
  return {
    id: row._id,
    playerId: row.playerId,
    game: row.game,
    rating: row.rating,
    createdAt: row.createdAt,
  };
}

/** Up to `limit` live waiting seeks of `game` at `now`, oldest first. */
async function waitingSeeks(ctx: QueryCtx, game: RankedGame, now: number, limit: number) {
  return await ctx.db
    .query('seeks')
    .withIndex('by_game', (q) =>
      q.eq('status', 'waiting').eq('game', game).gt('createdAt', liveSince(now)),
    )
    .take(limit);
}

/** `a` and `b` may play: no block either way, and under the pair's rated matches today. */
async function allowed(ctx: QueryCtx, a: string, b: string, now: number): Promise<boolean> {
  const [ab, ba, pair] = await Promise.all([
    blocks(ctx, a, b),
    blocks(ctx, b, a),
    pairRow(ctx, a, b),
  ]);
  return mayPair({
    blocked: ab || ba,
    pair: pair === null ? null : { day: pair.day, count: pair.count },
    now,
  });
}

/**
 * Matches the waiting seeks of `game` at `now`: `pickPairs` from
 * `@tavli/online`, then for each pair a ranked game through `insertGame`
 * and both rows `matched`, in this mutation.
 */
async function matchSeeks(ctx: MutationCtx, game: RankedGame, now: number): Promise<void> {
  const seeks = (await waitingSeeks(ctx, game, now, MATCH_READ)).map(recordOf);
  const pairs = await pickPairs(seeks, now, (a, b) => allowed(ctx, a.playerId, b.playerId, now));
  for (const [older, newer] of pairs) {
    const players = matchedPlayers(older, newer);
    const gameId = await insertGame(ctx, {
      // The newer seek starts the game, so the push goes to White, who
      // waited longer and may have left the app: the opening waits for
      // White's die first (`turnPushSide` never pushes the caller).
      callerId: players.black,
      players,
      choice: game,
      targetPoints: RANKED_TARGET_POINTS,
      turnTimeMinutes: RANKED_TURN_TIME_MINUTES,
      ranked: true,
    });
    for (const seek of [older, newer]) {
      await ctx.db.patch(seek.id, { status: 'matched', gameId, matchedAt: now });
      await ctx.scheduler.runAfter(MATCHED_SEEK_KEEP_MS, internal.matchmaking.forgetSeek, {
        seekId: seek.id,
      });
    }
  }
}

/** Runs the matching again after `MATCH_TICK_MS` while the seek waits and its range grows. */
async function tickLater(ctx: MutationCtx, seekId: Id<'seeks'>, now: number): Promise<void> {
  const row = await ctx.db.get(seekId);
  if (row === null || row.status !== 'waiting') return;
  if (now - row.createdAt >= SEEK_RANGE_GROW_MS) return;
  await ctx.scheduler.runAfter(MATCH_TICK_MS, internal.matchmaking.matchTick, { seekId });
}

/**
 * Asks for a ranked match of `game` (one of `RANKED_GAMES`). A waiting
 * seek of the same game stays; any other seek of the caller is replaced.
 * The matching of the game runs at once.
 */
export const seek = mutation({
  args: { game: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const playerId = await savedCaller(ctx);
    const game = guarded(() => checkRankedChoice(args.game));
    const now = Date.now();
    const row = await seekRow(ctx, playerId);
    const plan = planSeek(
      row === null ? null : { game: row.game, status: row.status, createdAt: row.createdAt },
      game,
      now,
    );
    if (plan === 'keep') return null;
    if (row !== null) await ctx.db.delete(row._id);
    const rating = (await ratingRow(ctx, playerId))?.rating ?? NEW_RATING.rating;
    const seekId = await ctx.db.insert('seeks', {
      playerId,
      game,
      rating,
      createdAt: now,
      status: 'waiting',
    });
    await ctx.scheduler.runAfter(SEEK_TTL_MS, internal.matchmaking.expireSeek, { seekId });
    await matchSeeks(ctx, game, now);
    await tickLater(ctx, seekId, now);
    return null;
  },
});

/**
 * Ends the caller's waiting seek. A matched seek stays until `forgetSeek`,
 * so a cancel that lands just after a match still shows the match (#532).
 * No seek: nothing happens.
 */
export const cancelSeek = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const playerId = await savedCaller(ctx);
    const row = await seekRow(ctx, playerId);
    if (row !== null && row.status === 'waiting') await ctx.db.delete(row._id);
    return null;
  },
});

/** A player of a matched seek as `viewerId` sees them: no name when the viewer blocks them. */
async function seekPlayerOf(ctx: QueryCtx, viewerId: string, playerId: string) {
  const rating = (await ratingRow(ctx, playerId))?.rating ?? NEW_RATING.rating;
  return { name: await nameSeenBy(ctx, viewerId, playerId), rating: shownRating(rating) };
}

/** The caller's seek: none, waiting, or matched with the game and both players. */
export const mySeek = query({
  args: {},
  returns: mySeekValue,
  handler: async (ctx): Promise<MySeek> => {
    const playerId = await savedCaller(ctx);
    const row = await seekRow(ctx, playerId);
    // A waiting seek counts as ended at its time, also before `expireSeek` runs.
    const now = Date.now();
    if (row === null) return { kind: 'none' };
    if (row.status === 'waiting') {
      return isSeekExpired(row, now) ? { kind: 'none' } : waitingSeek(recordOf(row), shownRating);
    }
    const game = row.gameId === undefined ? null : await ctx.db.get(row.gameId);
    if (game === null) return { kind: 'none' };
    const opponentId = game.players.white === playerId ? game.players.black : game.players.white;
    const [me, opponent] = await Promise.all([
      seekPlayerOf(ctx, playerId, playerId),
      seekPlayerOf(ctx, playerId, opponentId),
    ]);
    return matchedSeek(row.game, game._id, me, opponent);
  },
});

/** How many other players wait for each ranked game now. */
export const lookingCounts = query({
  args: {},
  returns: lookingCountsValue,
  handler: async (ctx): Promise<LookingCounts> => {
    const playerId = await savedCaller(ctx);
    const now = Date.now();
    const rows = await Promise.all(
      RANKED_GAMES.map((game) => waitingSeeks(ctx, game, now, LOOKING_READ)),
    );
    return countLooking(rows.flat().map(recordOf), playerId, now);
  },
});

/**
 * Runs the matching of `game` now. The scheduled `matchTick` runs it; so
 * can the owner from the dashboard, and tests.
 */
export const matchGame = internalMutation({
  args: { game: rankedGame },
  returns: v.null(),
  handler: async (ctx, { game }) => {
    await matchSeeks(ctx, game, Date.now());
    return null;
  },
});

/**
 * The matching job of one waiting seek: runs the matching of its game
 * with the ranges of now, then again after `MATCH_TICK_MS` while the seek
 * waits and its range still grows.
 */
export const matchTick = internalMutation({
  args: { seekId: v.id('seeks') },
  returns: v.null(),
  handler: async (ctx, { seekId }) => {
    const row = await ctx.db.get(seekId);
    const now = Date.now();
    if (row === null || row.status !== 'waiting' || isSeekExpired(row, now)) return null;
    await matchSeeks(ctx, row.game, now);
    await tickLater(ctx, seekId, now);
    return null;
  },
});

/** Ends a waiting seek with no match at its time. */
export const expireSeek = internalMutation({
  args: { seekId: v.id('seeks') },
  returns: v.null(),
  handler: async (ctx, { seekId }) => {
    const row = await ctx.db.get(seekId);
    if (row?.status === 'waiting' && isSeekExpired(row, Date.now())) {
      await ctx.db.delete(row._id);
    }
    return null;
  },
});

/** Forgets a matched seek after `MATCHED_SEEK_KEEP_MS`; the game goes on. */
export const forgetSeek = internalMutation({
  args: { seekId: v.id('seeks') },
  returns: v.null(),
  handler: async (ctx, { seekId }) => {
    const row = await ctx.db.get(seekId);
    if (
      row?.status === 'matched' &&
      row.matchedAt !== undefined &&
      isMatchedSeekDone(row.matchedAt, Date.now())
    ) {
      await ctx.db.delete(row._id);
    }
    return null;
  },
});

/**
 * Deletes the seek of `playerId` (account delete, guest move). One row
 * per player; a few at most if two seeks ever raced.
 */
export async function deleteSeeksOf(ctx: MutationCtx, playerId: string): Promise<void> {
  const rows = await ctx.db
    .query('seeks')
    .withIndex('by_player', (q) => q.eq('playerId', playerId))
    .take(10);
  for (const row of rows) await ctx.db.delete(row._id);
}

/**
 * Friends (#406, ADR-0008 item 8): the `Friends` port of
 * `@tavli/contracts` on Convex. See "Friends" in
 * `docs/architecture/online-game-service.md`.
 *
 * - A saved player (a Better Auth user that is not anonymous) adds a
 *   friend by friend link (a random token, never the id), by exact
 *   username (`FRIEND_SEARCHES_PER_HOUR` searches an hour), or from the
 *   players they met (`recentPlayers`, `sendFriendRequest`). A guest gets
 *   `NOT_SAVED`; only `openFriendLink` is open to guests.
 * - A request must be accepted. The caps, the wait after a decline and
 *   the order of the checks are `planRequest` in `@tavli/online`, which
 *   the in-memory server runs too: never copy a check here. This file
 *   adds the database.
 * - A block (`safety.ts`) ends the friendship and the requests, and hides
 *   each player from the other here: search and link say "not found",
 *   recent players leave them out.
 * - `inviteFriend` makes an invite only that friend can read and answer
 *   (`invites.to`, `insertInvite`), and schedules a push to them.
 * - The record against each friend is on the `friends` row: counted from
 *   the finished games when the two become friends, then one more per
 *   match that ends (`recordFriendMatch` in `games.ts`).
 *
 * The server does no contact matching: no call takes a phone number or
 * an email. Every public function reads the caller from the sign-in.
 * `deleteAccountOf` deletes the friend rows at once and schedules
 * `deleteFriendRows` for the rest, in pages. Never send ids, names or
 * tokens to analytics or the logs.
 */

import { ConvexError, v } from 'convex/values';

import {
  FRIEND_SEARCHES_PER_HOUR,
  FRIEND_STATUSES,
  MAX_FRIENDS,
  MAX_INCOMING_FRIEND_REQUESTS,
  MAX_OPEN_FRIEND_REQUESTS,
  MAX_RECENT_PLAYERS,
  normalizeFriendToken,
} from '@tavli/contracts';
import type {
  FoundPlayer,
  Friend,
  FriendRequest,
  FriendRequests,
  FriendStatus,
  FriendsErrorCode,
  InviteView,
  RecentPlayer,
} from '@tavli/contracts';
import {
  FriendsError,
  checkFriendTarget,
  checkFriends,
  checkOpenRequest,
  checkSaved,
  checkSearchCap,
  friendStatusOf,
  isInviteExpired,
  pickFriendToken,
  planRequest,
  recentOpponents,
  recordOf,
  searchWindowStart,
  toInviteView,
  usernameKey,
} from '@tavli/online';
import type { RequestRoute } from '@tavli/online';

import { internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import { internalMutation, mutation, query } from './_generated/server';
import type { MutationCtx, QueryCtx } from './_generated/server';
import { authComponent } from './auth';
import { signedInPlayer } from './caller';
import { endFriendship, friendRow, isFriend, requestRecord, requestRow } from './friendEdges';
import { insertInvite, toInviteRecord } from './invites';
import { createCryptoRng } from './model/cryptoRng';
import { nameOf } from './playerNames';
import { scheduleFriendInvitePush } from './push';
import { blocks, met } from './safety';
import { gameChoice, gameTurnTimeMinutes } from './schema';

/** How many of the caller's newest games of each side and status `recentPlayers` reads. */
export const RECENT_GAMES_PER_RANGE = 40;

/**
 * How many games of each side order `makeFriends` counts for the first
 * record: up to twice this many matches before the friendship.
 */
export const RECORD_GAMES_READ = 500;

/** How many old search rows one search deletes. */
const SEARCH_PRUNE = 50;

/** The most friend invites `listFriendInvites` returns. */
export const MAX_LISTED_FRIEND_INVITES = 50;

/** How many rows one run of `deleteFriendRows` deletes. */
export const FRIEND_DELETE_PAGE = 200;

const friendStatus = v.union(...FRIEND_STATUSES.map((status) => v.literal(status)));

/** Throws a `ConvexError` with `FriendsErrorData`, so clients get the code. */
function fail(code: FriendsErrorCode, message: string): never {
  // A plain object literal, so it fits Convex's `Value` type.
  const data: { code: FriendsErrorCode; message: string } = { code, message };
  throw new ConvexError(data);
}

/** Runs `step`; a `FriendsError` becomes a `ConvexError`. */
async function guarded<T>(step: () => Promise<T> | T): Promise<T> {
  try {
    return await step();
  } catch (error) {
    if (error instanceof FriendsError) fail(error.code, error.message);
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Who calls, and who is there

/**
 * The caller and whether their account is saved. `NOT_SIGNED_IN` with no
 * token, or when the Better Auth user is gone (a token outlives its user).
 */
async function currentUser(ctx: QueryCtx): Promise<{ playerId: string; saved: boolean }> {
  const playerId = await signedInPlayer(ctx);
  const user = await authComponent.getAnyUserById(ctx, playerId);
  if (user === null) fail('NOT_SIGNED_IN', 'this account does not exist');
  return { playerId, saved: user.isAnonymous !== true };
}

/** The caller, who must have a saved account (`NOT_SAVED`). */
async function savedCaller(ctx: QueryCtx): Promise<string> {
  const { playerId, saved } = await currentUser(ctx);
  await guarded(() => checkSaved(saved));
  return playerId;
}

/** `playerId` has a saved account that exists. */
async function isSavedPlayer(ctx: QueryCtx, playerId: string): Promise<boolean> {
  const user = await authComponent.getAnyUserById(ctx, playerId);
  return user !== null && user.isAnonymous !== true;
}

/** A block either way between the two. */
async function blockedEither(ctx: QueryCtx, a: string, b: string): Promise<boolean> {
  const [ab, ba] = await Promise.all([blocks(ctx, a, b), blocks(ctx, b, a)]);
  return ab || ba;
}

/** Where `callerId` stands with `playerId`. */
async function statusBetween(ctx: QueryCtx, callerId: string, playerId: string) {
  const [friends, mine, theirs] = await Promise.all([
    isFriend(ctx, callerId, playerId),
    requestRow(ctx, callerId, playerId),
    requestRow(ctx, playerId, callerId),
  ]);
  return friendStatusOf({
    self: callerId === playerId,
    friends,
    mine: requestRecord(mine),
    theirs: requestRecord(theirs),
  });
}

/** What the caller may see of a player found by link or username: `null` with a block. */
async function found(
  ctx: QueryCtx,
  callerId: string,
  playerId: string | null,
): Promise<FoundPlayer | null> {
  if (playerId === null || (await blockedEither(ctx, callerId, playerId))) return null;
  const [name, status] = await Promise.all([
    nameOf(ctx, playerId),
    statusBetween(ctx, callerId, playerId),
  ]);
  return { name, status };
}

/** The saved player with this exact username (`usernameKey`), or `null`. */
async function holderOfUsername(ctx: QueryCtx, text: string): Promise<string | null> {
  const key = usernameKey(text.trim());
  if (key === '') return null;
  const row = await ctx.db
    .query('playerNames')
    .withIndex('by_username_key', (q) => q.eq('usernameKey', key))
    .first();
  if (row === null || !(await isSavedPlayer(ctx, row.playerId))) return null;
  return row.playerId;
}

async function linkByToken(ctx: QueryCtx, token: string): Promise<Doc<'friendLinks'> | null> {
  return await ctx.db
    .query('friendLinks')
    .withIndex('by_token', (q) => q.eq('token', token))
    .first();
}

async function linkOf(ctx: QueryCtx, playerId: string): Promise<Doc<'friendLinks'> | null> {
  return await ctx.db
    .query('friendLinks')
    .withIndex('by_player', (q) => q.eq('playerId', playerId))
    .first();
}

/** The owner of the link with `text` (any case), if their account exists. */
async function ownerOfToken(ctx: QueryCtx, text: string): Promise<string | null> {
  const token = normalizeFriendToken(text);
  if (token === null) return null;
  const link = await linkByToken(ctx, token);
  if (link === null) return null;
  const user = await authComponent.getAnyUserById(ctx, link.playerId);
  return user === null ? null : link.playerId;
}

/** A new link for `playerId`, with a token no other link has. */
async function newLink(ctx: MutationCtx, playerId: string): Promise<string> {
  const token = await pickFriendToken(
    createCryptoRng(),
    async (candidate) => (await linkByToken(ctx, candidate)) !== null,
  );
  await ctx.db.insert('friendLinks', { playerId, token, createdAt: Date.now() });
  return token;
}

// ---------------------------------------------------------------------------
// Counts for the caps (each read stops at its cap)

async function friendCount(ctx: QueryCtx, playerId: string): Promise<number> {
  const rows = await ctx.db
    .query('friends')
    .withIndex('by_player', (q) => q.eq('playerId', playerId))
    .take(MAX_FRIENDS);
  return rows.length;
}

async function openSentCount(ctx: QueryCtx, playerId: string): Promise<number> {
  const rows = await ctx.db
    .query('friendRequests')
    .withIndex('by_from', (q) => q.eq('fromId', playerId).eq('status', 'open'))
    .take(MAX_OPEN_FRIEND_REQUESTS);
  return rows.length;
}

async function openReceivedCount(ctx: QueryCtx, playerId: string): Promise<number> {
  const rows = await ctx.db
    .query('friendRequests')
    .withIndex('by_to', (q) => q.eq('toId', playerId).eq('status', 'open'))
    .take(MAX_INCOMING_FRIEND_REQUESTS);
  return rows.length;
}

/**
 * Counts one username search of `playerId` now, after the cap check
 * (`TOO_MANY_SEARCHES`). Deletes some rows older than the window. Saves
 * only the time, never the name.
 */
async function countSearch(ctx: MutationCtx, playerId: string): Promise<void> {
  const now = Date.now();
  const since = searchWindowStart(now);
  const recent = await ctx.db
    .query('friendSearches')
    .withIndex('by_player', (q) => q.eq('playerId', playerId).gt('at', since))
    // `checkSearchCap` needs to know only whether the caller is at the cap.
    .take(FRIEND_SEARCHES_PER_HOUR);
  await guarded(() => checkSearchCap(recent.length));
  const old = await ctx.db
    .query('friendSearches')
    .withIndex('by_player', (q) => q.eq('playerId', playerId).lte('at', since))
    .take(SEARCH_PRUNE);
  for (const row of old) await ctx.db.delete(row._id);
  await ctx.db.insert('friendSearches', { playerId, at: now });
}

// ---------------------------------------------------------------------------
// Requests

/**
 * Makes `a` and `b` friends: one row each way, with the record from
 * their finished games (`RECORD_GAMES_READ` per side order at most), and
 * deletes the requests between them.
 */
async function makeFriends(ctx: MutationCtx, a: string, b: string): Promise<void> {
  const games = await Promise.all([
    ctx.db
      .query('games')
      .withIndex('by_pair', (q) => q.eq('players.white', a).eq('players.black', b))
      .take(RECORD_GAMES_READ),
    ctx.db
      .query('games')
      .withIndex('by_pair', (q) => q.eq('players.white', b).eq('players.black', a))
      .take(RECORD_GAMES_READ),
  ]);
  const record = recordOf(games.flat(), a, b);
  const since = Date.now();
  await ctx.db.insert('friends', { playerId: a, friendId: b, since, ...record });
  await ctx.db.insert('friends', {
    playerId: b,
    friendId: a,
    since,
    wins: record.losses,
    losses: record.wins,
  });
  for (const row of await Promise.all([requestRow(ctx, a, b), requestRow(ctx, b, a)])) {
    if (row !== null) await ctx.db.delete(row._id);
  }
}

/**
 * A request from `callerId` to `playerId` (`null`: no such player), after
 * `planRequest`. Throws `FriendsError`. Like `request` in the in-memory
 * server.
 */
async function askFriend(
  ctx: MutationCtx,
  callerId: string,
  playerId: string | null,
  route: RequestRoute,
): Promise<FriendStatus> {
  if (playerId === null) throw new FriendsError('NOT_FOUND', 'no such player');
  const self = callerId === playerId;
  const [
    savedTarget,
    known,
    callerBlocks,
    targetBlocks,
    friends,
    mine,
    theirs,
    openSent,
    openReceived,
    callerFriends,
    targetFriends,
  ] = await Promise.all([
    self ? true : isSavedPlayer(ctx, playerId),
    route !== 'met' || self ? true : met(ctx, callerId, playerId),
    blocks(ctx, callerId, playerId),
    blocks(ctx, playerId, callerId),
    isFriend(ctx, callerId, playerId),
    requestRow(ctx, callerId, playerId),
    requestRow(ctx, playerId, callerId),
    openSentCount(ctx, callerId),
    openReceivedCount(ctx, playerId),
    friendCount(ctx, callerId),
    friendCount(ctx, playerId),
  ]);
  const now = Date.now();
  const plan = planRequest({
    route,
    self,
    savedTarget,
    met: known,
    callerBlocks,
    targetBlocks,
    friends,
    mine: requestRecord(mine),
    theirs: requestRecord(theirs),
    openSent,
    openReceived,
    callerFriends,
    targetFriends,
    now,
  });
  if (plan.kind === 'status') return plan.status;
  if (plan.kind === 'accept') {
    await makeFriends(ctx, callerId, playerId);
    return 'friends';
  }
  // Sent again after a decline: the same row, open again.
  const row = { status: 'open' as const, createdAt: now, declinedAt: null };
  if (mine === null)
    await ctx.db.insert('friendRequests', { fromId: callerId, toId: playerId, ...row });
  else await ctx.db.patch(mine._id, row);
  return 'sent';
}

/** The open requests to (`to`) or from (`from`) `playerId`, newest first, with names. */
async function openRequests(
  ctx: QueryCtx,
  playerId: string,
  side: 'from' | 'to',
): Promise<FriendRequest[]> {
  const rows =
    side === 'from'
      ? await ctx.db
          .query('friendRequests')
          .withIndex('by_from', (q) => q.eq('fromId', playerId).eq('status', 'open'))
          .order('desc')
          .take(MAX_OPEN_FRIEND_REQUESTS)
      : await ctx.db
          .query('friendRequests')
          .withIndex('by_to', (q) => q.eq('toId', playerId).eq('status', 'open'))
          .order('desc')
          .take(MAX_INCOMING_FRIEND_REQUESTS);
  return await Promise.all(
    rows.map(async (row) => {
      const other = side === 'from' ? row.toId : row.fromId;
      return { playerId: other, name: await nameOf(ctx, other), sentAt: row.createdAt };
    }),
  );
}

// ---------------------------------------------------------------------------
// The public functions

/** The caller's friends, newest friendship first, with the record against each. */
export const listFriends = query({
  args: {},
  handler: async (ctx): Promise<Friend[]> => {
    const playerId = await savedCaller(ctx);
    const rows = await ctx.db
      .query('friends')
      .withIndex('by_player', (q) => q.eq('playerId', playerId))
      .order('desc')
      .take(MAX_FRIENDS);
    return await Promise.all(
      rows.map(async (row) => ({
        playerId: row.friendId,
        name: await nameOf(ctx, row.friendId),
        since: row.since,
        record: { wins: row.wins, losses: row.losses },
      })),
    );
  },
});

/** The caller's open requests, both ways, newest first. */
export const listFriendRequests = query({
  args: {},
  handler: async (ctx): Promise<FriendRequests> => {
    const playerId = await savedCaller(ctx);
    const [incoming, outgoing] = await Promise.all([
      openRequests(ctx, playerId, 'to'),
      openRequests(ctx, playerId, 'from'),
    ]);
    return { incoming, outgoing };
  },
});

/** Up to `MAX_RECENT_PLAYERS` saved players of the caller's newest games, with no block. */
export const recentPlayers = query({
  args: {},
  handler: async (ctx): Promise<RecentPlayer[]> => {
    const playerId = await savedCaller(ctx);
    const ranges = await Promise.all(
      (['by_white', 'by_black'] as const).flatMap((index) =>
        (['active', 'finished'] as const).map(async (status) => {
          const field = index === 'by_white' ? 'players.white' : 'players.black';
          return await ctx.db
            .query('games')
            .withIndex(index, (q) => q.eq(field, playerId).eq('status', status))
            .order('desc')
            .take(RECENT_GAMES_PER_RANGE);
        }),
      ),
    );
    const games = ranges
      .flat()
      .map((game) => ({ players: game.players, updatedAt: game.updatedAt ?? game._creationTime }));
    const listed: RecentPlayer[] = [];
    for (const { playerId: other, playedAt } of recentOpponents(games, playerId)) {
      if (listed.length === MAX_RECENT_PLAYERS) break;
      const [saved, blocked] = await Promise.all([
        isSavedPlayer(ctx, other),
        blockedEither(ctx, playerId, other),
      ]);
      if (!saved || blocked) continue;
      const [name, status] = await Promise.all([
        nameOf(ctx, other),
        statusBetween(ctx, playerId, other),
      ]);
      listed.push({ playerId: other, name, status, playedAt });
    }
    return listed;
  },
});

/**
 * The player with this exact username, or `null` (also for a block either
 * way). A mutation: it counts one search (`TOO_MANY_SEARCHES` past the cap).
 */
export const findPlayer = mutation({
  args: { username: v.string() },
  handler: async (ctx, { username }): Promise<FoundPlayer | null> => {
    const playerId = await savedCaller(ctx);
    await countSearch(ctx, playerId);
    return await found(ctx, playerId, await holderOfUsername(ctx, username));
  },
});

/** The caller's friend link token: made on the first call, then the same. */
export const myFriendLink = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    const playerId = await savedCaller(ctx);
    const link = await linkOf(ctx, playerId);
    return link?.token ?? (await newLink(ctx, playerId));
  },
});

/** A new token for the caller's link. The old one stops working at once. */
export const resetFriendLink = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    const playerId = await savedCaller(ctx);
    const link = await linkOf(ctx, playerId);
    if (link !== null) await ctx.db.delete(link._id);
    return await newLink(ctx, playerId);
  },
});

/** The owner of the link, or `null` (no such token, gone, or a block). A guest may call it. */
export const openFriendLink = query({
  args: { token: v.string() },
  handler: async (ctx, { token }): Promise<FoundPlayer | null> => {
    const { playerId } = await currentUser(ctx);
    return await found(ctx, playerId, await ownerOfToken(ctx, token));
  },
});

/** Asks the owner of the link. `NOT_FOUND` where `openFriendLink` gives `null`. */
export const requestByLink = mutation({
  args: { token: v.string() },
  returns: friendStatus,
  handler: async (ctx, { token }) => {
    const playerId = await savedCaller(ctx);
    const owner = await ownerOfToken(ctx, token);
    return await guarded(async () => {
      if (owner !== null && owner !== playerId && (await blockedEither(ctx, playerId, owner))) {
        throw new FriendsError('NOT_FOUND', 'no such player');
      }
      return await askFriend(ctx, playerId, owner, 'link');
    });
  },
});

/**
 * Asks the player with this exact username. It counts one search, and
 * the search must stay counted when the request fails (a throw would undo
 * it), so a failed request comes back as a value: `{ ok: false, code,
 * message }`. The adapter turns it into a rejection.
 */
export const requestByUsername = mutation({
  args: { username: v.string() },
  returns: v.union(
    v.object({ ok: v.literal(true), status: friendStatus }),
    v.object({ ok: v.literal(false), code: v.string(), message: v.string() }),
  ),
  handler: async (ctx, { username }) => {
    const playerId = await savedCaller(ctx);
    await countSearch(ctx, playerId);
    try {
      const status = await askFriend(
        ctx,
        playerId,
        await holderOfUsername(ctx, username),
        'username',
      );
      return { ok: true as const, status };
    } catch (error) {
      if (error instanceof FriendsError) {
        return { ok: false as const, code: error.code, message: error.message };
      }
      throw error;
    }
  },
});

/** Asks a player the caller met. `NOT_FOUND` for anyone else, `BLOCKED` when the caller blocks them. */
export const sendFriendRequest = mutation({
  args: { playerId: v.string() },
  returns: friendStatus,
  handler: async (ctx, { playerId: other }) => {
    const playerId = await savedCaller(ctx);
    return await guarded(async () => {
      checkFriendTarget(playerId, other);
      return await askFriend(ctx, playerId, other, 'met');
    });
  },
});

/** Accepts the open request from `playerId`. No such request: `NOT_FOUND`. */
export const acceptFriendRequest = mutation({
  args: { playerId: v.string() },
  returns: v.null(),
  handler: async (ctx, { playerId: other }) => {
    const playerId = await savedCaller(ctx);
    const theirs = await requestRow(ctx, other, playerId);
    await guarded(async () => {
      checkOpenRequest(requestRecord(theirs));
      const [savedTarget, callerBlocks, targetBlocks, friends, callerFriends, targetFriends] =
        await Promise.all([
          isSavedPlayer(ctx, other),
          blocks(ctx, playerId, other),
          blocks(ctx, other, playerId),
          isFriend(ctx, playerId, other),
          friendCount(ctx, playerId),
          friendCount(ctx, other),
        ]);
      const plan = planRequest({
        route: 'met',
        self: false,
        savedTarget,
        met: true,
        callerBlocks,
        targetBlocks,
        friends,
        mine: null,
        theirs: requestRecord(theirs),
        openSent: 0,
        openReceived: 0,
        callerFriends,
        targetFriends,
        now: Date.now(),
      });
      if (plan.kind === 'accept') await makeFriends(ctx, playerId, other);
    });
    return null;
  },
});

/** Declines the open request from `playerId`. They wait before they ask again. No request: no change. */
export const declineFriendRequest = mutation({
  args: { playerId: v.string() },
  returns: v.null(),
  handler: async (ctx, { playerId: other }) => {
    const playerId = await savedCaller(ctx);
    const theirs = await requestRow(ctx, other, playerId);
    if (theirs?.status === 'open') {
      await ctx.db.patch(theirs._id, { status: 'declined', declinedAt: Date.now() });
    }
    return null;
  },
});

/** Takes back the caller's open request to `playerId`. No request: no change. */
export const cancelFriendRequest = mutation({
  args: { playerId: v.string() },
  returns: v.null(),
  handler: async (ctx, { playerId: other }) => {
    const playerId = await savedCaller(ctx);
    const mine = await requestRow(ctx, playerId, other);
    if (mine?.status === 'open') await ctx.db.delete(mine._id);
    return null;
  },
});

/** Ends the friendship, both ways. Not friends: no change. */
export const removeFriend = mutation({
  args: { playerId: v.string() },
  returns: v.null(),
  handler: async (ctx, { playerId: other }) => {
    const playerId = await savedCaller(ctx);
    if ((await friendRow(ctx, playerId, other)) !== null) {
      await endFriendship(ctx, playerId, other);
    }
    return null;
  },
});

/**
 * Invites a friend to a game: an invite with `to` (`insertInvite`), so
 * only that friend can read and answer it, and a push to them
 * (`scheduleFriendInvitePush`). Returns the code. `NOT_FRIENDS`,
 * `TOO_MANY_INVITES` (the invite cap) or `BAD_REQUEST` (the game).
 */
export const inviteFriend = mutation({
  args: {
    playerId: v.string(),
    choice: gameChoice,
    targetPoints: v.number(),
    turnTimeMinutes: gameTurnTimeMinutes,
  },
  returns: v.string(),
  handler: async (ctx, { playerId: other, choice, targetPoints, turnTimeMinutes }) => {
    const playerId = await savedCaller(ctx);
    const friends = await isFriend(ctx, playerId, other);
    await guarded(() => checkFriends(friends));
    const game = { choice, targetPoints, turnTimeMinutes };
    const { inviteId, code } = await insertInvite(ctx, playerId, game, other);
    await scheduleFriendInvitePush(ctx, inviteId, other);
    return code;
  },
});

/** The open friend invites to the caller, newest first (`MAX_LISTED_FRIEND_INVITES` at most). */
export const listFriendInvites = query({
  args: {},
  handler: async (ctx): Promise<InviteView[]> => {
    const playerId = await savedCaller(ctx);
    const now = Date.now();
    const rows = await ctx.db
      .query('invites')
      .withIndex('by_to', (q) => q.eq('to', playerId).eq('status', 'open').gt('expiresAt', now))
      .order('desc')
      .take(MAX_LISTED_FRIEND_INVITES);
    const listed: InviteView[] = [];
    for (const row of rows) {
      const invite = toInviteRecord(row);
      if (isInviteExpired(invite, now) || (await blockedEither(ctx, playerId, row.from))) continue;
      listed.push(toInviteView(invite, now, await nameOf(ctx, row.from)));
    }
    return listed;
  },
});

// ---------------------------------------------------------------------------
// Account delete

/**
 * Deletes both rows of every friendship of `playerId`, in the account
 * delete's transaction (`deleteAccountOf`): the friends see the friend
 * gone at once. `MAX_FRIENDS` caps them, so this is at most 400 writes.
 */
export async function deleteFriendsOf(ctx: MutationCtx, playerId: string): Promise<void> {
  const rows = await ctx.db
    .query('friends')
    .withIndex('by_player', (q) => q.eq('playerId', playerId))
    .take(MAX_FRIENDS);
  for (const row of rows) await endFriendship(ctx, playerId, row.friendId);
}

/** The tables `deleteFriendRows` deletes from. */
type FriendTable = 'friends' | 'friendRequests' | 'friendLinks' | 'friendSearches' | 'invites';

/** The ranges `deleteFriendRows` empties, in order. */
const FRIEND_RANGES = [
  'friendsOf',
  'friendsWith',
  'requestsFrom',
  'requestsTo',
  'links',
  'searches',
  'invitesTo',
] as const;

/** Up to `limit` rows of one range of `playerId`. */
async function friendRangePage(
  ctx: MutationCtx,
  range: (typeof FRIEND_RANGES)[number],
  playerId: string,
  limit: number,
): Promise<{ _id: Id<FriendTable> }[]> {
  switch (range) {
    case 'friendsOf':
      return await ctx.db
        .query('friends')
        .withIndex('by_player', (q) => q.eq('playerId', playerId))
        .take(limit);
    case 'friendsWith':
      return await ctx.db
        .query('friends')
        .withIndex('by_friend', (q) => q.eq('friendId', playerId))
        .take(limit);
    case 'requestsFrom':
      return await ctx.db
        .query('friendRequests')
        .withIndex('by_from', (q) => q.eq('fromId', playerId))
        .take(limit);
    case 'requestsTo':
      return await ctx.db
        .query('friendRequests')
        .withIndex('by_to', (q) => q.eq('toId', playerId))
        .take(limit);
    case 'links':
      return await ctx.db
        .query('friendLinks')
        .withIndex('by_player', (q) => q.eq('playerId', playerId))
        .take(limit);
    case 'searches':
      return await ctx.db
        .query('friendSearches')
        .withIndex('by_player', (q) => q.eq('playerId', playerId))
        .take(limit);
    case 'invitesTo':
      return await ctx.db
        .query('invites')
        .withIndex('by_to', (q) => q.eq('to', playerId))
        .take(limit);
  }
}

/**
 * Deletes up to `FRIEND_DELETE_PAGE` friend rows of `playerId`, a deleted
 * account: friendships, requests both ways (declined ones have no cap),
 * the link, the search log and the friend invites to them. Runs again
 * while there may be more. Scheduled by `deleteAccountOf`. No new row can
 * name the player once the account is gone: every call needs a saved
 * account that exists, as the caller and as the other player.
 */
export const deleteFriendRows = internalMutation({
  args: { playerId: v.string() },
  returns: v.null(),
  handler: async (ctx, { playerId }) => {
    let left = FRIEND_DELETE_PAGE;
    for (const range of FRIEND_RANGES) {
      const rows = await friendRangePage(ctx, range, playerId, left);
      for (const row of rows) await ctx.db.delete(row._id);
      left -= rows.length;
      if (left === 0) {
        await ctx.scheduler.runAfter(0, internal.friends.deleteFriendRows, { playerId });
        return null;
      }
    }
    return null;
  },
});

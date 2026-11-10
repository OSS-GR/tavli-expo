/**
 * Game invites by code (#252, owner answer Q10).
 *
 * A player makes an invite and shares its code. A friend accepts it, and
 * the server starts the game in the same transaction. The friend can also
 * decline it, the inviter can cancel it, and it expires after
 * `INVITE_TIME_MS` (24 hours).
 *
 * The checks live in `@tavli/online` (`invites.ts`, pure, `now` as an argument).
 * Each mutation is one Convex transaction: if anything throws, nothing
 * is saved.
 *
 * Expiry: `createInvite` schedules `expireInvite` at `expiresAt`, as
 * `checkTimeout` does for turns. The calls check the time too, so an
 * invite is closed at `expiresAt` also when the scheduler is late.
 *
 * Friend invites (#406): `inviteFriend` (`friends.ts`) saves an invite
 * with `to`, through the same `insertInvite`. Only `from` and `to` may
 * read or answer it (`inviteVisibleTo`, `checkAddressee`): anyone else
 * gets `null` or `INVITE_NOT_FOUND`, as for no invite.
 *
 * Cap (#275): one player may have at most `MAX_OPEN_INVITES` (10) open
 * invites whose time is not up. `createInvite` counts them on the
 * `by_from` index; each one is a row and a scheduled `expireInvite`.
 *
 * The caller is the signed-in user (#131), as in `games.ts`: every
 * public function reads the player id from `ctx.auth` (`signedInPlayer`).
 * Without a sign-in a call gets `NOT_SIGNED_IN`, also `getInvite`. The
 * calls that save the caller's id (`createInvite`, `acceptInvite`,
 * `declineInvite`) also check that the account still exists
 * (`existingPlayer`, #306).
 */

import { ConvexError, v } from 'convex/values';

import { normalizeInviteCode } from '@tavli/contracts';
import type { InviteErrorCode, InviteView, NewInvite } from '@tavli/contracts';
import {
  InviteError,
  MAX_OPEN_INVITES,
  checkAddressee,
  checkAnswer,
  checkCancel,
  checkInviteCap,
  checkNotBlocked,
  inviteSeenBy,
  inviteVisibleTo,
  countOpenInvites,
  isInviteExpired,
  newInvite,
  pickInviteCode,
  toInviteView,
} from '@tavli/online';
import type { InviteRecord } from '@tavli/online';

import { internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import { internalMutation, mutation, query } from './_generated/server';
import type { MutationCtx, QueryCtx } from './_generated/server';
import { existingPlayer, signedInPlayer } from './caller';
import { insertGame } from './games';
import { createCryptoRng } from './model/cryptoRng';
import { ensureGuestNumber, nameOf } from './playerNames';
import { blocks, nameSeenBy } from './safety';
import { gameChoice, gameTurnTimeMinutes } from './schema';

/** Maps a Convex invite row to `InviteRecord`, defaulting `turnTimeMinutes` (#183). */
export function toInviteRecord(doc: Doc<'invites'>): InviteRecord {
  return {
    code: doc.code,
    from: doc.from,
    choice: doc.choice,
    targetPoints: doc.targetPoints,
    turnTimeMinutes: doc.turnTimeMinutes,
    status: doc.status,
    expiresAt: doc.expiresAt,
    gameId: doc.gameId,
    ...(doc.to === undefined ? {} : { to: doc.to }),
  };
}

/** Throws a `ConvexError` with `InviteErrorData`, so clients get the code. */
function fail(code: InviteErrorCode, message: string): never {
  // A plain object literal, so it fits Convex's `Value` type.
  const data: { code: InviteErrorCode; message: string } = { code, message };
  throw new ConvexError(data);
}

/** Runs `step`; an `InviteError` becomes a `ConvexError`. */
function guarded<T>(step: () => T): T {
  try {
    return step();
  } catch (error) {
    if (error instanceof InviteError) fail(error.code, error.message);
    throw error;
  }
}

async function findByCode(ctx: QueryCtx, code: string): Promise<Doc<'invites'> | null> {
  return await ctx.db
    .query('invites')
    .withIndex('by_code', (q) => q.eq('code', code))
    .unique();
}

/**
 * The open invites of `from` whose time is not up at `now`: at most
 * `limit`, newest first. One index range (`by_from`), so the call reads
 * no other rows. `createInvite` checks the cap on this range, so it never
 * holds more than `MAX_OPEN_INVITES`. `deleteMyAccount` uses it too.
 */
export async function openInvitesOf(
  ctx: QueryCtx,
  from: string,
  now: number,
  limit?: number,
): Promise<Doc<'invites'>[]> {
  const range = ctx.db
    .query('invites')
    .withIndex('by_from', (q) => q.eq('from', from).eq('status', 'open').gt('expiresAt', now))
    .order('desc');
  return limit === undefined ? await range.collect() : await range.take(limit);
}

/** Loads the invite of `text` (any case). Rejects a malformed or unknown code. */
async function load(ctx: MutationCtx, text: string): Promise<Doc<'invites'>> {
  const code = normalizeInviteCode(text);
  if (code === null) fail('BAD_REQUEST', 'an invite code has 8 letters and digits');
  const invite = await findByCode(ctx, code);
  if (invite === null) fail('INVITE_NOT_FOUND', 'no invite has this code');
  return invite;
}

/**
 * Saves a new open invite from `callerId`, after the cap check (#275),
 * and schedules its `expireInvite`. `to`: a friend invite (#406,
 * `inviteFriend` in `friends.ts`), for that player only. Returns the row
 * id and the code. `TOO_MANY_INVITES` and `BAD_REQUEST` are codes of the
 * friends port too, so `inviteFriend` passes them on as they are.
 */
export async function insertInvite(
  ctx: MutationCtx,
  callerId: string,
  game: NewInvite,
  to?: string,
): Promise<{ inviteId: Id<'invites'>; code: string }> {
  const now = Date.now();
  // Reading at most the cap is enough to know if the caller is at it.
  const open = await openInvitesOf(ctx, callerId, now, MAX_OPEN_INVITES);
  guarded(() => checkInviteCap(countOpenInvites(open, callerId, now)));
  const code = await pickInviteCode(
    createCryptoRng(),
    async (candidate) => (await findByCode(ctx, candidate)) !== null,
  );
  const { choice, targetPoints, turnTimeMinutes } = game;
  const options = { from: callerId, choice, targetPoints, turnTimeMinutes };
  const invite = guarded(() =>
    newInvite(to === undefined ? options : { ...options, to }, code, now),
  );
  // The invite names the inviter (#400).
  await ensureGuestNumber(ctx, callerId);
  const inviteId = await ctx.db.insert('invites', { ...invite, gameId: null, answeredBy: null });
  await ctx.scheduler.runAt(invite.expiresAt, internal.invites.expireInvite, { inviteId });
  return { inviteId, code };
}

/**
 * Makes an open invite from the caller. It expires in 24 hours. Returns
 * the code (8 capital letters and digits). A caller who already has
 * `MAX_OPEN_INVITES` (10) open invites gets `TOO_MANY_INVITES` (#275).
 */
export const createInvite = mutation({
  args: {
    choice: gameChoice,
    targetPoints: v.number(),
    /** A per-turn time limit in minutes, or `null` for the 24-hour default (#183). */
    turnTimeMinutes: gameTurnTimeMinutes,
  },
  returns: v.string(),
  handler: async (ctx, game) => {
    const callerId = await existingPlayer(ctx);
    return (await insertInvite(ctx, callerId, game)).code;
  },
});

/**
 * The invite with this code (any case), or `null` when there is none.
 * Any signed-in user with the code may read it: the code is the secret.
 * A caller who blocks the inviter sees no name, and a caller the inviter
 * blocks sees an open invite as expired (#320, `inviteSeenBy`). A friend
 * invite (#406) is `null` for anyone but its two players.
 */
export const getInvite = query({
  args: { code: v.string() },
  handler: async (ctx, { code: text }): Promise<InviteView | null> => {
    const callerId = await signedInPlayer(ctx);
    const code = normalizeInviteCode(text);
    if (code === null) return null;
    const invite = await findByCode(ctx, code);
    // A friend invite is for its two players only (#406).
    if (invite === null || !inviteVisibleTo(toInviteRecord(invite), callerId)) return null;
    const [fromName, hidden] = await Promise.all([
      nameSeenBy(ctx, callerId, invite.from),
      blocks(ctx, invite.from, callerId),
    ]);
    return inviteSeenBy(toInviteView(toInviteRecord(invite), Date.now(), fromName), hidden);
  },
});

/**
 * The caller accepts the invite. In one transaction: checks the invite
 * (open, not expired, not your own, no block between the two: #320,
 * `checkNotBlocked`), creates the game (the inviter plays white; the
 * opening roll decides who starts), and marks the invite
 * `accepted` with the game id. Returns the game id.
 */
export const acceptInvite = mutation({
  args: { code: v.string() },
  returns: v.id('games'),
  handler: async (ctx, { code }) => {
    const callerId = await existingPlayer(ctx);
    const doc = await load(ctx, code);
    const invite = toInviteRecord(doc);
    guarded(() => checkAddressee(invite, callerId));
    guarded(() => checkAnswer(invite, callerId, Date.now()));
    const [byCaller, byInviter] = await Promise.all([
      blocks(ctx, callerId, invite.from),
      blocks(ctx, invite.from, callerId),
    ]);
    guarded(() => checkNotBlocked({ byCaller, byInviter }));
    const gameId: Id<'games'> = await insertGame(ctx, {
      callerId,
      players: { white: invite.from, black: callerId },
      choice: invite.choice,
      targetPoints: invite.targetPoints,
      turnTimeMinutes: invite.turnTimeMinutes,
    });
    await ctx.db.patch(doc._id, { status: 'accepted', gameId, answeredBy: callerId });
    return gameId;
  },
});

/**
 * The caller (not the inviter) says no to the invite. A caller the
 * inviter blocks gets `INVITE_EXPIRED`, as `getInvite` shows it (#320).
 */
export const declineInvite = mutation({
  args: { code: v.string() },
  returns: v.null(),
  handler: async (ctx, { code }) => {
    const callerId = await existingPlayer(ctx);
    const doc = await load(ctx, code);
    const invite = toInviteRecord(doc);
    guarded(() => checkAddressee(invite, callerId));
    guarded(() => checkAnswer(invite, callerId, Date.now()));
    const byInviter = await blocks(ctx, invite.from, callerId);
    guarded(() => checkNotBlocked({ byCaller: false, byInviter }));
    await ctx.db.patch(doc._id, { status: 'declined', answeredBy: callerId });
    return null;
  },
});

/** The inviter takes the invite back. */
export const cancelInvite = mutation({
  args: { code: v.string() },
  returns: v.null(),
  handler: async (ctx, { code }) => {
    const callerId = await signedInPlayer(ctx);
    const doc = await load(ctx, code);
    const invite = toInviteRecord(doc);
    guarded(() => checkCancel(invite, callerId, Date.now()));
    await ctx.db.patch(doc._id, { status: 'cancelled' });
    return null;
  },
});

/** The open invites the caller sent, newest first. Invites whose time is up are left out. */
export const listMyInvites = query({
  args: {},
  handler: async (ctx): Promise<InviteView[]> => {
    const callerId = await signedInPlayer(ctx);
    const now = Date.now();
    const open = (await openInvitesOf(ctx, callerId, now)).map(toInviteRecord);
    // All from the caller: one name.
    const fromName = await nameOf(ctx, callerId);
    return open
      .filter((invite) => !isInviteExpired(invite, now))
      .map((invite) => toInviteView(invite, now, fromName));
  },
});

/**
 * Runs at `expiresAt` (scheduled by `createInvite`). Marks the invite
 * `expired` if it is still open. An invite that was accepted, declined or
 * cancelled stays as it is.
 */
export const expireInvite = internalMutation({
  args: { inviteId: v.id('invites') },
  returns: v.null(),
  handler: async (ctx, { inviteId }) => {
    const doc = await ctx.db.get(inviteId);
    if (doc === null || doc.status !== 'open') return null;
    const invite = toInviteRecord(doc);
    if (!isInviteExpired(invite, Date.now())) {
      // Too early (the scheduler ran before the time): check again then.
      await ctx.scheduler.runAt(invite.expiresAt, internal.invites.expireInvite, { inviteId });
      return null;
    }
    await ctx.db.patch(inviteId, { status: 'expired' });
    return null;
  },
});

/**
 * Game invites by code (#252, owner answer Q10).
 *
 * A player makes an invite and shares its code. A friend accepts it, and
 * the server starts the game in the same transaction. The friend can also
 * decline it, the inviter can cancel it, and it expires after
 * `INVITE_TIME_MS` (24 hours).
 *
 * The checks live in `model/invites.ts` (pure, `now` as an argument).
 * Each mutation is one Convex transaction: if anything throws, nothing
 * is saved.
 *
 * Expiry: `createInvite` schedules `expireInvite` at `expiresAt`, as
 * `checkTimeout` does for turns. The calls check the time too, so an
 * invite is closed at `expiresAt` also when the scheduler is late.
 *
 * The caller is the signed-in user (#131), as in `games.ts`: every
 * public function reads the player id from `ctx.auth` (`signedInPlayer`).
 * Without a sign-in a call gets `NOT_SIGNED_IN`, also `getInvite`.
 */

import { ConvexError, v } from 'convex/values';

import { normalizeInviteCode } from '@tavli/contracts';
import type { InviteErrorCode, InviteView } from '@tavli/contracts';

import { internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import { internalMutation, mutation, query } from './_generated/server';
import type { MutationCtx, QueryCtx } from './_generated/server';
import { signedInPlayer } from './caller';
import { insertGame } from './games';
import { createCryptoRng } from './model/cryptoRng';
import {
  InviteError,
  checkAnswer,
  checkCancel,
  isInviteExpired,
  newInvite,
  pickInviteCode,
  toInviteView,
} from './model/invites';
import { gameChoice, gamePace } from './schema';

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

/** Loads the invite of `text` (any case). Rejects a malformed or unknown code. */
async function load(ctx: MutationCtx, text: string): Promise<Doc<'invites'>> {
  const code = normalizeInviteCode(text);
  if (code === null) fail('BAD_REQUEST', 'an invite code has 8 letters and digits');
  const invite = await findByCode(ctx, code);
  if (invite === null) fail('INVITE_NOT_FOUND', 'no invite has this code');
  return invite;
}

/**
 * Makes an open invite from the caller. It expires in 24 hours. Returns
 * the code (8 capital letters and digits).
 */
export const createInvite = mutation({
  args: {
    choice: gameChoice,
    targetPoints: v.number(),
    /** `live` (1 minute per turn) or `async` (24 hours per turn). */
    pace: gamePace,
  },
  returns: v.string(),
  handler: async (ctx, { choice, targetPoints, pace }) => {
    const callerId = await signedInPlayer(ctx);
    const code = await pickInviteCode(
      createCryptoRng(),
      async (candidate) => (await findByCode(ctx, candidate)) !== null,
    );
    const options = { from: callerId, choice, targetPoints, pace };
    const invite = guarded(() => newInvite(options, code, Date.now()));
    const inviteId = await ctx.db.insert('invites', { ...invite, gameId: null, answeredBy: null });
    await ctx.scheduler.runAt(invite.expiresAt, internal.invites.expireInvite, { inviteId });
    return code;
  },
});

/**
 * The invite with this code (any case), or `null` when there is none.
 * Any signed-in user with the code may read it: the code is the secret.
 */
export const getInvite = query({
  args: { code: v.string() },
  handler: async (ctx, { code: text }): Promise<InviteView | null> => {
    await signedInPlayer(ctx);
    const code = normalizeInviteCode(text);
    if (code === null) return null;
    const invite = await findByCode(ctx, code);
    return invite === null ? null : toInviteView(invite, Date.now());
  },
});

/**
 * The caller accepts the invite. In one transaction: checks the invite
 * (open, not expired, not your own), creates the game (the inviter plays
 * white; the opening roll decides who starts), and marks the invite
 * `accepted` with the game id. Returns the game id.
 */
export const acceptInvite = mutation({
  args: { code: v.string() },
  returns: v.id('games'),
  handler: async (ctx, { code }) => {
    const callerId = await signedInPlayer(ctx);
    const invite = await load(ctx, code);
    guarded(() => checkAnswer(invite, callerId, Date.now()));
    const gameId: Id<'games'> = await insertGame(ctx, {
      callerId,
      players: { white: invite.from, black: callerId },
      choice: invite.choice,
      targetPoints: invite.targetPoints,
      pace: invite.pace,
    });
    await ctx.db.patch(invite._id, { status: 'accepted', gameId, answeredBy: callerId });
    return gameId;
  },
});

/** The caller (not the inviter) says no to the invite. */
export const declineInvite = mutation({
  args: { code: v.string() },
  returns: v.null(),
  handler: async (ctx, { code }) => {
    const callerId = await signedInPlayer(ctx);
    const invite = await load(ctx, code);
    guarded(() => checkAnswer(invite, callerId, Date.now()));
    await ctx.db.patch(invite._id, { status: 'declined', answeredBy: callerId });
    return null;
  },
});

/** The inviter takes the invite back. */
export const cancelInvite = mutation({
  args: { code: v.string() },
  returns: v.null(),
  handler: async (ctx, { code }) => {
    const callerId = await signedInPlayer(ctx);
    const invite = await load(ctx, code);
    guarded(() => checkCancel(invite, callerId, Date.now()));
    await ctx.db.patch(invite._id, { status: 'cancelled' });
    return null;
  },
});

/** The open invites the caller sent, newest first. Invites whose time is up are left out. */
export const listMyInvites = query({
  args: {},
  handler: async (ctx): Promise<InviteView[]> => {
    const callerId = await signedInPlayer(ctx);
    const now = Date.now();
    const open = await ctx.db
      .query('invites')
      .withIndex('by_from', (q) => q.eq('from', callerId).eq('status', 'open'))
      .order('desc')
      .collect();
    return open
      .filter((invite) => !isInviteExpired(invite, now))
      .map((invite) => toInviteView(invite, now));
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
    const invite = await ctx.db.get(inviteId);
    if (invite === null || invite.status !== 'open') return null;
    if (!isInviteExpired(invite, Date.now())) {
      // Too early (the scheduler ran before the time): check again then.
      await ctx.scheduler.runAt(invite.expiresAt, internal.invites.expireInvite, { inviteId });
      return null;
    }
    await ctx.db.patch(inviteId, { status: 'expired' });
    return null;
  },
});

/**
 * Who calls (#131): the signed-in user, from `ctx.auth`.
 *
 * Every public query and mutation (`games.ts`, `invites.ts`, `push.ts`,
 * `account.ts`) gets the player id here. No call takes a player id as an
 * argument. The one exception is `updatePolicy` (`appUpdate.ts`, #390):
 * an old build must learn it is too old with no session, and that query
 * reads only env vars, nothing about players.
 *
 * The player id is the token's `subject`. Better Auth sets it to the
 * user's id in its component tables, so it stays the same for a user,
 * across sessions and token refreshes. We do not use `tokenIdentifier`
 * (issuer + subject): the issuer is the deployment's site URL, and a new
 * site URL (for example a custom domain) would change every player id.
 * There is one token issuer (`auth.config.ts`). If a second one is ever
 * added, two issuers could give the same subject: then move to
 * `tokenIdentifier` and migrate the stored ids.
 */

import { ConvexError } from 'convex/values';
import type { Auth } from 'convex/server';
import type { GenericCtx } from '@convex-dev/better-auth';

import type { GameTransportErrorCode, InviteErrorCode } from '@tavli/contracts';
import { SERVER_ACTOR } from '@tavli/online';

import { components } from './_generated/api';
import type { DataModel } from './_generated/dataModel';
import { authComponent } from './auth';

/** A code that is a game error code and an invite error code. */
type SharedCode = GameTransportErrorCode & InviteErrorCode;

/**
 * Throws a `ConvexError` whose data fits both `GameTransportErrorData` and
 * `InviteErrorData`, so every function can use it.
 */
function fail(code: SharedCode, message: string): never {
  // A plain object literal, so it fits Convex's `Value` type.
  const data: { code: SharedCode; message: string } = { code, message };
  throw new ConvexError(data);
}

/**
 * The player id of the signed-in caller. Throws `NOT_SIGNED_IN` when the
 * call has no valid token, and `BAD_REQUEST` for an id no player may have
 * (empty, or the `SERVER_ACTOR` id of the move log).
 */
export async function signedInPlayer(ctx: { readonly auth: Auth }): Promise<string> {
  const identity = await ctx.auth.getUserIdentity();
  if (identity === null) fail('NOT_SIGNED_IN', 'sign in first');
  const id = identity.subject;
  if (id.trim() === '') fail('BAD_REQUEST', 'the player id is empty');
  // The move log marks server events with SERVER_ACTOR, so no player may use that id.
  if (id === SERVER_ACTOR) fail('BAD_REQUEST', `"${SERVER_ACTOR}" is not a valid player id`);
  return id;
}

/**
 * Like `signedInPlayer`, and the caller's Better Auth user must still
 * exist (#306). A token stays valid until it expires (15 minutes), also
 * after `deleteMyAccount` deleted its user. Then this throws
 * `NOT_SIGNED_IN`. The same when the token's session ended (#446: Sign
 * out of all phones deletes every session): a token from our server
 * always names its session (`sessionId`). A test identity with no
 * `sessionId` skips that check.
 *
 * It costs one or two reads of the Better Auth component (indexed lookups),
 * so only the calls that save the caller's id in a row use it:
 * `createInvite`, `acceptInvite`, `declineInvite`, `registerPushToken`
 * and `deleteMyAccount`. Queries and game calls skip it: after a delete
 * the caller has no active game, so a game call can change nothing (see
 * "Delete an account" in `docs/architecture/online-game-service.md`).
 */
export async function existingPlayer(
  ctx: GenericCtx<DataModel> & { readonly auth: Auth },
): Promise<string> {
  const id = await signedInPlayer(ctx);
  const user = await authComponent.getAnyUserById(ctx, id);
  if (user === null) fail('NOT_SIGNED_IN', 'this account does not exist');
  const identity = await ctx.auth.getUserIdentity();
  const sessionId = identity?.['sessionId'];
  if (typeof sessionId === 'string' && !(await sessionLives(ctx, sessionId, id))) {
    fail('NOT_SIGNED_IN', 'this session ended');
  }
  return id;
}

/** True when the Better Auth session `sessionId` of `userId` still exists and has not run out. */
async function sessionLives(
  ctx: GenericCtx<DataModel>,
  sessionId: string,
  userId: string,
): Promise<boolean> {
  const session = (await ctx.runQuery(components.betterAuth.adapter.findOne, {
    model: 'session',
    where: [
      { field: '_id', value: sessionId },
      { field: 'expiresAt', operator: 'gt', value: Date.now() },
    ],
  })) as { userId?: unknown } | null;
  return session !== null && session.userId === userId;
}

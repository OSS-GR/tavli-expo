/**
 * Who calls (#131): the signed-in user, from `ctx.auth`.
 *
 * Every public query and mutation in `games.ts` and `invites.ts` gets the
 * player id here. No call takes a player id as an argument.
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

import type { GameTransportErrorCode, InviteErrorCode } from '@tavli/contracts';
import { SERVER_ACTOR } from '@tavli/online';

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

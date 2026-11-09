/**
 * Sign-in with Better Auth (#131, ADR-0004, ADR-0008).
 *
 * Two kinds of user:
 * - a guest (the anonymous plugin), made only when the player opens
 *   online play;
 * - a saved account: one with a sign-in key. Sign in with Apple (#397)
 *   now; the email code (#399) and Google (#410) come later.
 *
 * A guest saves their account with our `/key/save` route (`keyPlugin.ts`)
 * and keeps the same user id. A phone with no session signs in with
 * Better Auth's `/sign-in/social` and an Apple id token. Both check the
 * token with `verifyKeyIdToken` below: Apple's signature, one of our apps,
 * and a nonce this server made that was not used before.
 *
 * Env vars, set by the owner on each deployment (never in the repo):
 * - `BETTER_AUTH_SECRET`: a long random secret;
 * - `APPLE_SERVICES_ID`: turns Apple on. The other `APPLE_*` vars (team
 *   id, key id, private key) are for the web flow and the revoke (#398).
 * See "Sign in with Apple" in `docs/process/running-the-app.md`.
 */

import { createClient } from '@convex-dev/better-auth';
import type { GenericCtx } from '@convex-dev/better-auth';
import { convex } from '@convex-dev/better-auth/plugins';
import { expo } from '@better-auth/expo';
import { betterAuth } from 'better-auth/minimal';
import { anonymous } from 'better-auth/plugins';
import { createRemoteJWKSet } from 'jose';
import type { JWTVerifyGetKey } from 'jose';

import { components, internal } from './_generated/api';
import type { DataModel } from './_generated/dataModel';
import authConfig from './auth.config';
import { isKeyProviderId, keyError, keyPlugin } from './keyPlugin';
import { APPLE_KEYS_URL, verifyAppleIdToken } from './model/appleIdToken';
import { checkKeyNonce } from './model/keyNonce';

/** The Better Auth component: its tables and the helpers to read them. */
export const authComponent = createClient<DataModel>(components.betterAuth);

/** The app's URL scheme (`app.json`), so a sign-in can return to the app. */
const APP_ORIGINS = ['tavlaki://'];

/** The app's bundle ids, one per variant (`app.config.ts`): Apple's audience on iPhone. */
export const APPLE_BUNDLE_IDS = ['com.tavlaki', 'com.tavlaki.dev', 'com.tavlaki.preview'];

/**
 * Routes no client may call.
 * - A user is deleted only by `deleteMyAccount` (`account.ts`, #302): it
 *   resigns the user's games and deletes the user's invites and push
 *   tokens first. `/delete-anonymous-user` would skip that. (`/delete-user`
 *   is off too, as `user.deleteUser` is not enabled.)
 * - Keys change only through `/key/save` and `/key/remove`
 *   (`keyPlugin.ts`, #397): `/link-social` never checks that a key is
 *   free, and `/unlink-account` does not know our last-key rule.
 */
const DISABLED_PATHS = ['/delete-anonymous-user', '/link-social', '/unlink-account'];

let appleKeys: JWTVerifyGetKey | null = null;

/**
 * Swaps Apple's public keys (tests sign their own tokens). `null` goes
 * back to Apple's keys, fetched from `APPLE_KEYS_URL` on first use.
 */
export function setAppleKeys(keys: JWTVerifyGetKey | null): void {
  appleKeys = keys;
}

function currentAppleKeys(): JWTVerifyGetKey {
  appleKeys ??= createRemoteJWKSet(new URL(APPLE_KEYS_URL));
  return appleKeys;
}

type AuthCtx = GenericCtx<DataModel>;

/**
 * The context for our internal mutations. The Better Auth routes run in
 * an HTTP action (`http.ts`). `account.ts` builds Better Auth in a
 * mutation only to delete a user, which never gets here.
 */
function actionCtx(ctx: AuthCtx) {
  if (!('runMutation' in ctx)) throw new Error('sign-in keys need an action context');
  return ctx;
}

/**
 * Builds Better Auth for one request (the HTTP routes in `http.ts`), or
 * for one mutation (`account.ts` uses its `internalAdapter`).
 */
export function createAuth(ctx: AuthCtx) {
  const servicesId = process.env['APPLE_SERVICES_ID'];

  /**
   * Apple's `verifyIdToken`. Better Auth's own lets a token with no nonce
   * through; this one asks for a nonce from `/key/nonce` and uses it up.
   */
  async function verifyKeyIdToken(
    token: string,
    nonce: string | undefined,
    secret: string,
  ): Promise<boolean> {
    if (servicesId === undefined || nonce === undefined || nonce === '') return false;
    const now = Date.now();
    const expiresAt = await checkKeyNonce(secret, nonce, now);
    if (expiresAt === null) return false;
    const claims = await verifyAppleIdToken(token, {
      audiences: [...APPLE_BUNDLE_IDS, servicesId],
      keys: currentAppleKeys(),
      nonce,
      now,
    });
    if (claims === null) return false;
    return await actionCtx(ctx).runMutation(internal.authKeys.useKeyNonce, {
      nonce,
      expiresAt,
      now,
    });
  }

  return betterAuth({
    trustedOrigins: APP_ORIGINS,
    disabledPaths: DISABLED_PATHS,
    database: authComponent.adapter(ctx),
    account: {
      // A key never joins a user just because the emails match.
      accountLinking: { disableImplicitLinking: true },
      encryptOAuthTokens: true,
    },
    socialProviders:
      servicesId === undefined || servicesId === ''
        ? {}
        : {
            apple: {
              // The web flow (Apple on Android) also needs a client secret
              // made from the key; it comes with #401.
              clientId: servicesId,
              clientSecret: '',
              verifyIdToken: (token, nonce, c) =>
                verifyKeyIdToken(
                  token,
                  nonce,
                  (c as { context: { secret: string } }).context.secret,
                ),
              // No name and no photo: the player picks a username later (#405).
              mapProfileToUser: () => ({ name: '' }),
            },
          },
    databaseHooks: {
      account: {
        create: {
          // Each new key is claimed first, in one transaction (`claimKey`).
          before: async (account) => {
            if (!isKeyProviderId(account.providerId)) return;
            const owner = await actionCtx(ctx).runMutation(internal.authKeys.claimKey, {
              providerId: account.providerId,
              accountId: account.accountId,
              userId: account.userId,
              now: Date.now(),
            });
            if (owner !== account.userId) throw keyError('CONFLICT', 'KEY_BELONGS_TO_OTHER');
          },
        },
      },
    },
    plugins: [
      expo(),
      // A guest is never deleted by a later sign-in: only `deleteMyAccount` deletes.
      anonymous({ disableDeleteAnonymousUser: true }),
      // The Convex token holds the user id (`sub`) and the session id only.
      convex({ authConfig, jwt: { definePayload: () => ({}) } }),
      keyPlugin({
        releaseKey: async (key) => {
          await actionCtx(ctx).runMutation(internal.authKeys.releaseKey, key);
        },
      }),
    ],
  });
}

/**
 * Sign-in with Better Auth (#131, ADR-0004, ADR-0008).
 *
 * Two kinds of user:
 * - a guest (the anonymous plugin), made only when the player opens
 *   online play;
 * - a saved account: one with a sign-in key: Apple (#397) or an email
 *   code (#399); Google (#410) comes later.
 *
 * A guest saves their account with our `/key/save` route (`keyPlugin.ts`)
 * and keeps the same user id. A phone with no session signs in with
 * Better Auth's `/sign-in/social` and an Apple id token. Both check the
 * token with `verifyKeyIdToken` below: Apple's signature, one of our apps,
 * and a nonce this server made that was not used before.
 *
 * Env vars, set by the owner on each deployment (never in the repo):
 * - `BETTER_AUTH_SECRET`: a long random secret;
 * - `APPLE_SERVICES_ID`: turns Apple on;
 * - `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY`: the key that
 *   signs our calls to Apple, to trade a code and to revoke a token
 *   (#398, `model/appleTokens.ts`). Without them no token is kept.
 * - `AHASEND_API_KEY`, `AHASEND_ACCOUNT_ID`, `MAIL_FROM` (and
 *   `MAIL_FROM_NAME`, `AHASEND_SANDBOX`): turn the email code on (`mail.ts`);
 * - `EMAIL_CODES_PER_DAY`: the codes the whole server sends a day (default 30).
 * See "Sign in with Apple" and "Email code" in
 * `docs/process/running-the-app.md`.
 */

import { createClient } from '@convex-dev/better-auth';
import type { GenericCtx } from '@convex-dev/better-auth';
import { convex } from '@convex-dev/better-auth/plugins';
import { expo } from '@better-auth/expo';
import { betterAuth } from 'better-auth/minimal';
import { anonymous } from 'better-auth/plugins';
import { ConvexError } from 'convex/values';
import { createRemoteJWKSet } from 'jose';
import type { JWTVerifyGetKey } from 'jose';

import { components, internal } from './_generated/api';
import type { DataModel } from './_generated/dataModel';
import { appleClientIds, appleTokenClient } from './appleTokens';
import authConfig from './auth.config';
import { isKeyProviderId, keyError, keyPlugin, logKeyRefusal } from './keyPlugin';
import { mailSender } from './mail';
import { APPLE_KEYS_URL, checkAppleIdToken } from './model/appleIdToken';
import { appleKeyConfig, makeAppleClientSecret, subjectOfAppleIdToken } from './model/appleTokens';
import { codesPerDay } from './model/emailCode';
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
/**
 * How long a session lasts with no use, in seconds: a year. Each day the
 * app uses it, the server moves the end a year on (`SESSION_UPDATE_AGE_S`).
 * Better Auth's default is 7 days: a guest with no key who did not play
 * for a week lost the account for good, and Home said only "did not load".
 */
export const SESSION_EXPIRES_IN_S = 365 * 24 * 60 * 60;
/** How old a session gets before a use moves its end on, in seconds. */
export const SESSION_UPDATE_AGE_S = 24 * 60 * 60;

const DISABLED_PATHS = ['/delete-anonymous-user', '/link-social', '/unlink-account'];

let appleKeys: JWTVerifyGetKey | null = null;

/**
 * Swaps Apple's public keys (tests sign their own tokens). `null` goes
 * back to Apple's keys, fetched from `APPLE_KEYS_URL` on first use.
 */
export function setAppleKeys(keys: JWTVerifyGetKey | null): void {
  appleKeys = keys;
}

/** Apple's public keys: for id tokens and for Apple's notices (`appleTokens.ts`). */
export function currentAppleKeys(): JWTVerifyGetKey {
  appleKeys ??= createRemoteJWKSet(new URL(APPLE_KEYS_URL));
  return appleKeys;
}

type AuthCtx = GenericCtx<DataModel>;

/**
 * Trades an Apple authorization code (#398) for its refresh token. `null`
 * when the `APPLE_*` key is missing or bad, when Apple says no, or when
 * the code is for another Apple id than `accountId`. Such a token is
 * dropped, not revoked: a revoke would end that other person's Sign in
 * with Apple for the app.
 */
async function exchangeAppleCode(call: {
  clientId: string;
  code: string;
  accountId: string;
}): Promise<string | null> {
  const key = appleKeyConfig(process.env);
  if (key === null) return null;
  let clientSecret: string;
  try {
    clientSecret = await makeAppleClientSecret(key, call.clientId, Date.now());
  } catch {
    console.error('apple code: APPLE_PRIVATE_KEY is not a valid key');
    return null;
  }
  const traded = await appleTokenClient().exchangeCode({
    clientId: call.clientId,
    clientSecret,
    code: call.code,
  });
  if (traded === null) return null;
  if (subjectOfAppleIdToken(traded.idToken) !== call.accountId) return null;
  return traded.refreshToken;
}

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
   * A refusal logs which check failed (`logKeyRefusal`), never the token,
   * the nonce or Apple's id.
   */
  async function verifyKeyIdToken(
    token: string,
    nonce: string | undefined,
    secret: string,
  ): Promise<boolean> {
    if (servicesId === undefined) return logKeyRefusal('apple-off');
    if (nonce === undefined || nonce === '') return logKeyRefusal('no-nonce');
    const now = Date.now();
    const expiresAt = await checkKeyNonce(secret, nonce, now);
    if (expiresAt === null) {
      // Signed by us but past its time, or not ours at all.
      const ours = (await checkKeyNonce(secret, nonce, 0)) !== null;
      return logKeyRefusal(ours ? 'nonce-expired' : 'nonce-not-ours');
    }
    const checked = await checkAppleIdToken(token, {
      audiences: [...APPLE_BUNDLE_IDS, servicesId],
      keys: currentAppleKeys(),
      nonce,
      now,
    });
    if (!checked.ok) {
      return logKeyRefusal(
        checked.problem,
        checked.audience === undefined ? {} : { audience: checked.audience },
      );
    }
    const fresh = await actionCtx(ctx).runMutation(internal.authKeys.useKeyNonce, {
      nonce,
      expiresAt,
      now,
    });
    return fresh ? true : logKeyRefusal('nonce-used');
  }

  return betterAuth({
    trustedOrigins: APP_ORIGINS,
    disabledPaths: DISABLED_PATHS,
    database: authComponent.adapter(ctx),
    session: { expiresIn: SESSION_EXPIRES_IN_S, updateAge: SESSION_UPDATE_AGE_S },
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
            const claim = await actionCtx(ctx).runMutation(internal.authKeys.claimKey, {
              providerId: account.providerId,
              accountId: account.accountId,
              userId: account.userId,
              now: Date.now(),
            });
            if (claim === 'belongs-to-other') throw keyError('CONFLICT', 'KEY_BELONGS_TO_OTHER');
            if (claim === 'provider-taken') throw keyError('CONFLICT', 'PROVIDER_TAKEN');
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
        appleClientIds,
        exchangeAppleCode,
        saveAppleToken: async (token) =>
          await actionCtx(ctx).runMutation(internal.appleTokens.saveAppleToken, token),
        guestMoveCounts: async (playerId) =>
          await actionCtx(ctx).runQuery(internal.guestMove.guestMoveCounts, { playerId }),
        startGuestMove: async (move) => {
          try {
            await actionCtx(ctx).runMutation(internal.guestMove.startGuestMove, move);
            return true;
          } catch (error) {
            // `startGuestMove` refuses with BAD_REQUEST when a user changed.
            if (error instanceof ConvexError) return false;
            throw error;
          }
        },
        mailSender,
        startEmailCode: async (start) =>
          await actionCtx(ctx).runMutation(internal.emailCodes.startEmailCode, {
            ...start,
            perDay: codesPerDay(process.env),
          }),
        cancelEmailCode: async (rows) => {
          await actionCtx(ctx).runMutation(internal.emailCodes.cancelEmailCode, rows);
        },
        useEmailCode: async (use) =>
          await actionCtx(ctx).runMutation(internal.emailCodes.useEmailCode, use),
      }),
    ],
  });
}

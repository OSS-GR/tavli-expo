/**
 * Our Better Auth plugin for sign-in keys (#397, ADR-0008).
 *
 * A guest saves their account by adding a key (Apple now; Google in
 * #410), and keeps the same user id, games and invites. Better Auth's
 * `/link-social` does not do this safely (it never checks that the key
 * is free, copies no email and keeps `isAnonymous`), so it is off
 * (`auth.ts`) and these routes do it:
 *
 * - `POST /key/nonce`: a one-time nonce for the Apple sheet (no session).
 * - `POST /key/save`: adds a key to the signed-in user. A key that is
 *   another user's gives `KEY_BELONGS_TO_OTHER` and changes nothing.
 * - `GET /key/list`: the signed-in user's keys.
 * - `POST /key/remove`: removes a key, never the last one (`LAST_KEY`).
 *
 * Sign-in with a key on a phone with no session is Better Auth's own
 * `/sign-in/social` with an id token. Both paths check the token with
 * the same `verifyIdToken` (`auth.ts`), and both make the `account` row
 * through the claim in `authKeys.ts`.
 */

import type { BetterAuthPlugin } from 'better-auth';
import { APIError, createAuthEndpoint, sessionMiddleware } from 'better-auth/api';

import { makeKeyNonce, KEY_NONCE_RANDOM_BYTES } from './model/keyNonce';

/** The sign-in key providers. Each needs a social provider in `auth.ts`. */
export const KEY_PROVIDER_IDS = ['apple'] as const;

export type KeyProviderId = (typeof KEY_PROVIDER_IDS)[number];

export function isKeyProviderId(value: unknown): value is KeyProviderId {
  return typeof value === 'string' && (KEY_PROVIDER_IDS as readonly string[]).includes(value);
}

/** The error codes of these routes, beside Better Auth's own. */
export const KEY_ERROR_CODES = {
  KEY_BELONGS_TO_OTHER: 'this key belongs to another account',
  LAST_KEY: 'an account keeps at least one key',
  PROVIDER_TAKEN: 'this account has a key of this kind already',
  INVALID_TOKEN: 'the id token or its nonce is not valid',
  BAD_REQUEST: 'the request is not valid',
} as const;

export type KeyErrorCode = keyof typeof KEY_ERROR_CODES;

type Status = 'BAD_REQUEST' | 'UNAUTHORIZED' | 'CONFLICT';

export function keyError(status: Status, code: KeyErrorCode): APIError {
  return new APIError(status, { code, message: KEY_ERROR_CODES[code] });
}

/** The body of `/key/save`: `{ provider, idToken: { token, nonce } }`. */
function readSaveBody(body: unknown): { provider: KeyProviderId; token: string; nonce: string } {
  const { provider, idToken } = (body ?? {}) as { provider?: unknown; idToken?: unknown };
  const { token, nonce } = (idToken ?? {}) as { token?: unknown; nonce?: unknown };
  if (
    !isKeyProviderId(provider) ||
    typeof token !== 'string' ||
    token === '' ||
    typeof nonce !== 'string' ||
    nonce === ''
  ) {
    throw keyError('BAD_REQUEST', 'BAD_REQUEST');
  }
  return { provider, token, nonce };
}

function readRemoveBody(body: unknown): KeyProviderId {
  const { provider } = (body ?? {}) as { provider?: unknown };
  if (!isKeyProviderId(provider)) throw keyError('BAD_REQUEST', 'BAD_REQUEST');
  return provider;
}

/** The user fields these routes send back: never the email or the name. */
function userOutput(user: { id: string; isAnonymous?: boolean | null }) {
  return { id: user.id, isAnonymous: user.isAnonymous === true };
}

export interface KeyPluginOptions {
  /** Drops a key claim (`releaseKey` in `authKeys.ts`). */
  readonly releaseKey: (key: {
    providerId: string;
    accountId: string;
    userId: string;
  }) => Promise<void>;
}

export function keyPlugin(options: KeyPluginOptions) {
  return {
    id: 'tavlaki-keys',
    endpoints: {
      keyNonce: createAuthEndpoint('/key/nonce', { method: 'POST' }, async (ctx) => {
        const random = crypto.getRandomValues(new Uint8Array(KEY_NONCE_RANDOM_BYTES));
        const nonce = await makeKeyNonce(ctx.context.secret, Date.now(), random);
        return ctx.json({ nonce });
      }),

      saveKey: createAuthEndpoint(
        '/key/save',
        { method: 'POST', use: [sessionMiddleware] },
        async (ctx) => {
          const { provider: providerId, token, nonce } = readSaveBody(ctx.body);
          const provider = ctx.context.socialProviders.find((p) => p.id === providerId);
          // Our own check (`verifyKeyIdToken` in `auth.ts`), the one Better
          // Auth's sign-in also runs first: Apple's signature, our app, our
          // nonce (once). A provider without it is never trusted here.
          const verify = provider?.options?.verifyIdToken;
          if (provider === undefined || verify === undefined) {
            throw keyError('BAD_REQUEST', 'BAD_REQUEST');
          }
          if (!(await verify(token, nonce, ctx))) {
            throw keyError('UNAUTHORIZED', 'INVALID_TOKEN');
          }
          const info = await provider.getUserInfo({ idToken: token });
          if (info === null) throw keyError('UNAUTHORIZED', 'INVALID_TOKEN');
          // The provider's own account id (Apple: `sub`), as its sign-in reads it.
          const subject = await provider.accountSubject({
            tokens: { idToken: token },
            profile: info.data,
          });
          const accountId = String(subject ?? '');
          if (accountId === '') throw keyError('UNAUTHORIZED', 'INVALID_TOKEN');
          const { internalAdapter } = ctx.context;
          const user = ctx.context.session.user;

          const linked = await internalAdapter.findAccountByKey({ providerId, accountId });
          if (linked !== null) {
            if (linked.userId !== user.id) throw keyError('CONFLICT', 'KEY_BELONGS_TO_OTHER');
            // Saved already: nothing to do.
            return ctx.json({ user: userOutput(user) });
          }
          const accounts = await internalAdapter.findAccounts(user.id);
          if (accounts.some((account) => account.providerId === providerId)) {
            throw keyError('CONFLICT', 'PROVIDER_TAKEN');
          }
          // The account hook claims the key first (`claimKey`), in one
          // transaction: if another user got it a moment ago, this throws
          // KEY_BELONGS_TO_OTHER; if a save of another Apple id by this
          // user just passed the check above, PROVIDER_TAKEN.
          await internalAdapter.createAccount({ userId: user.id, providerId, accountId });

          // The key's email, when no other user has it (emails are unique).
          const patch: { isAnonymous: boolean; email?: string; emailVerified?: boolean } = {
            isAnonymous: false,
          };
          const email = info.user.email?.toLowerCase();
          if (email !== undefined && email !== '') {
            const other = await internalAdapter.findUserByEmail(email);
            if (other === null || other.user.id === user.id) {
              patch.email = email;
              patch.emailVerified = info.user.emailVerified === true;
            }
          }
          const updated = await internalAdapter.updateUser(user.id, patch);
          return ctx.json({ user: userOutput({ ...user, ...patch, ...(updated ?? {}) }) });
        },
      ),

      listKeys: createAuthEndpoint(
        '/key/list',
        { method: 'GET', use: [sessionMiddleware] },
        async (ctx) => {
          const accounts = await ctx.context.internalAdapter.findAccounts(
            ctx.context.session.user.id,
          );
          const keys = accounts
            .map((account) => account.providerId)
            .filter(isKeyProviderId)
            .map((provider) => ({ provider }));
          return ctx.json({ keys });
        },
      ),

      removeKey: createAuthEndpoint(
        '/key/remove',
        { method: 'POST', use: [sessionMiddleware] },
        async (ctx) => {
          const providerId = readRemoveBody(ctx.body);
          const { internalAdapter } = ctx.context;
          const userId = ctx.context.session.user.id;
          const keys = (await internalAdapter.findAccounts(userId)).filter((account) =>
            isKeyProviderId(account.providerId),
          );
          const target = keys.find((account) => account.providerId === providerId);
          if (target === undefined) return ctx.json({ removed: false });
          // The email code (#399) will count as a key too.
          if (keys.length <= 1) throw keyError('CONFLICT', 'LAST_KEY');
          await internalAdapter.deleteAccount(target.id);
          await options.releaseKey({ providerId, accountId: target.accountId, userId });
          return ctx.json({ removed: true });
        },
      ),
    },
  } satisfies BetterAuthPlugin;
}

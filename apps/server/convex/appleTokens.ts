/**
 * Apple's refresh tokens and their revoke (#398). Apple asks an app with
 * Sign in with Apple to revoke the token when the account is deleted in
 * the app. The pure parts (client secret, Apple's calls, the notice) are
 * in `model/appleTokens.ts`.
 *
 * - `saveAppleToken`: the `/key/apple-code` route (`keyPlugin.ts`) keeps
 *   the token of an Apple key here, encrypted.
 * - `revokeAppleTokensOf`: account delete and key removal move the
 *   tokens to the `appleRevokes` queue, in their own transaction, and
 *   schedule `revokeAppleToken` with the queue row's id only (never the
 *   token). So the data delete never waits on Apple, and a failed revoke
 *   never undoes it.
 * - `revokeAppleToken`: calls Apple, tries once more after
 *   `REVOKE_RETRY_MS`, then drops the row. The log never holds the
 *   token, the email or the Apple id.
 * - `appleNotifications`: Apple's server-to-server notices (`http.ts`).
 *   When a person stops using Sign in with Apple for the app, or deletes
 *   their Apple account, the key goes; with its last key, the account.
 */

import { symmetricDecrypt } from 'better-auth/crypto';
import { v } from 'convex/values';

import { internal } from './_generated/api';
import type { Doc } from './_generated/dataModel';
import { httpAction, internalAction, internalMutation, internalQuery } from './_generated/server';
import type { MutationCtx } from './_generated/server';
import { deleteAccountOf } from './account';
import { APPLE_BUNDLE_IDS, createAuth, currentAppleKeys } from './auth';
import { releaseClaim } from './authKeys';
import { isKeyProviderId } from './keyPlugin';
import {
  appleKeyConfig,
  createAppleTokenClient,
  endsKey,
  makeAppleClientSecret,
  readAppleNotice,
} from './model/appleTokens';
import type { AppleTokenClient } from './model/appleTokens';

/** How long the second try of a revoke waits. */
export const REVOKE_RETRY_MS = 30 * 1000;

/** Tries per revoke: the first, and one more. */
export const REVOKE_TRIES = 2;

let client: AppleTokenClient | null = null;

/** Swaps Apple's token calls (tests). `null` goes back to Apple's servers. */
export function setAppleTokenClient(next: AppleTokenClient | null): void {
  client = next;
}

export function appleTokenClient(): AppleTokenClient {
  client ??= createAppleTokenClient();
  return client;
}

/** The apps (bundle ids) and the Services ID that may trade a code: Apple's `client_id`. */
export function appleClientIds(): string[] {
  const servicesId = process.env['APPLE_SERVICES_ID']?.trim() ?? '';
  return servicesId === '' ? [...APPLE_BUNDLE_IDS] : [...APPLE_BUNDLE_IDS, servicesId];
}

/**
 * Keeps the token of `userId`'s Apple key `accountId`. A newer token
 * replaces the old one, which is dropped, not revoked: a revoke ends the
 * person's Sign in with Apple for the app, not just that token.
 */
export const saveAppleToken = internalMutation({
  args: {
    userId: v.string(),
    accountId: v.string(),
    clientId: v.string(),
    refreshToken: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const old = await ctx.db
      .query('appleTokens')
      .withIndex('by_account', (q) => q.eq('accountId', args.accountId))
      .collect();
    for (const row of old) await ctx.db.delete(row._id);
    await ctx.db.insert('appleTokens', { ...args, savedAt: Date.now() });
    return null;
  },
});

async function queueRevoke(ctx: MutationCtx, row: Doc<'appleTokens'>): Promise<void> {
  const id = await ctx.db.insert('appleRevokes', {
    clientId: row.clientId,
    refreshToken: row.refreshToken,
    attempts: 0,
  });
  await ctx.db.delete(row._id);
  await ctx.scheduler.runAfter(0, internal.appleTokens.revokeAppleToken, { id });
}

/**
 * Moves `userId`'s Apple tokens (only key `accountId`'s, when given) to
 * the revoke queue. Account delete and key removal call it.
 */
export async function revokeAppleTokensOf(
  ctx: MutationCtx,
  userId: string,
  accountId?: string,
): Promise<void> {
  const rows = await ctx.db
    .query('appleTokens')
    .withIndex('by_user', (q) => q.eq('userId', userId))
    .collect();
  for (const row of rows) {
    if (accountId === undefined || row.accountId === accountId) await queueRevoke(ctx, row);
  }
}

export const revokeRow = internalQuery({
  args: { id: v.id('appleRevokes') },
  handler: async (ctx, { id }) => await ctx.db.get(id),
});

export const dropRevoke = internalMutation({
  args: { id: v.id('appleRevokes') },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    if ((await ctx.db.get(id)) !== null) await ctx.db.delete(id);
    return null;
  },
});

export const retryRevoke = internalMutation({
  args: { id: v.id('appleRevokes'), attempts: v.number() },
  returns: v.null(),
  handler: async (ctx, { id, attempts }) => {
    if ((await ctx.db.get(id)) === null) return null;
    await ctx.db.patch(id, { attempts });
    await ctx.scheduler.runAfter(REVOKE_RETRY_MS, internal.appleTokens.revokeAppleToken, { id });
    return null;
  },
});

/**
 * Revokes one queued token at Apple. Runs after the delete, so the data
 * is gone whatever Apple says. Without the `APPLE_*` key in the env it
 * cannot sign the call: the row goes, with a log line.
 */
export const revokeAppleToken = internalAction({
  args: { id: v.id('appleRevokes') },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const row = await ctx.runQuery(internal.appleTokens.revokeRow, { id });
    if (row === null) return null;
    const key = appleKeyConfig(process.env);
    let revoked = false;
    if (key !== null) {
      try {
        const auth = await createAuth(ctx).$context;
        // Better Auth's own key (`setTokenUtil` encrypted it with it).
        const refreshToken = await symmetricDecrypt({
          key: auth.secretConfig,
          data: row.refreshToken,
        });
        const clientSecret = await makeAppleClientSecret(key, row.clientId, Date.now());
        revoked = await appleTokenClient().revoke({
          clientId: row.clientId,
          clientSecret,
          refreshToken,
        });
      } catch {
        // A bad key or a token we cannot read: the same as Apple saying no.
        revoked = false;
      }
    }
    const attempts = row.attempts + 1;
    if (revoked || key === null || attempts >= REVOKE_TRIES) {
      await ctx.runMutation(internal.appleTokens.dropRevoke, { id });
      // Never the token, the email or the Apple id.
      if (key === null) console.warn('apple revoke skipped: no APPLE_* key in the env');
      else if (!revoked) console.warn('apple revoke failed', { attempts });
      return null;
    }
    await ctx.runMutation(internal.appleTokens.retryRevoke, { id, attempts });
    return null;
  },
});

/** What a notice did: nothing (no such key), nothing (older than the key), the key, or the account. */
export const END_KEY_RESULTS = ['no-key', 'stale', 'key-removed', 'account-deleted'] as const;

export type EndKeyResult = (typeof END_KEY_RESULTS)[number];

/**
 * Apple ended the person's Sign in with Apple for the app (`accountId` is
 * their Apple id): the key goes, and with the last key the account
 * (`deleteAccountOf`). Apple ended the tokens itself, so they are dropped,
 * not revoked. A notice from before the key was made (`eventTime`, epoch
 * ms) is about an older key of the same Apple id, and changes nothing.
 */
export const endAppleKey = internalMutation({
  args: { accountId: v.string(), eventTime: v.optional(v.number()) },
  returns: v.union(...END_KEY_RESULTS.map((result) => v.literal(result))),
  handler: async (ctx, { accountId, eventTime }): Promise<EndKeyResult> => {
    const { internalAdapter } = await createAuth(ctx).$context;
    const account = await internalAdapter.findAccountByKey({ providerId: 'apple', accountId });
    if (account === null) return 'no-key';
    if (eventTime !== undefined && eventTime < new Date(account.createdAt).getTime()) {
      return 'stale';
    }
    const tokens = await ctx.db
      .query('appleTokens')
      .withIndex('by_account', (q) => q.eq('accountId', accountId))
      .collect();
    for (const row of tokens) await ctx.db.delete(row._id);
    const keys = (await internalAdapter.findAccounts(account.userId)).filter((key) =>
      isKeyProviderId(key.providerId),
    );
    if (keys.length > 1) {
      await internalAdapter.deleteAccount(account.id);
      await releaseClaim(ctx, { providerId: 'apple', accountId, userId: account.userId });
      return 'key-removed';
    }
    await deleteAccountOf(ctx, account.userId);
    return 'account-deleted';
  },
});

/**
 * `POST /apple/notifications`: Apple's server-to-server notices (set on
 * the App ID in Apple's developer site). A notice that is not Apple's
 * signed JWT for one of our apps gets 400. Only `consent-revoked` and
 * `account-delete` change anything; the email notices are read for
 * nothing.
 */
export const appleNotifications = httpAction(async (ctx, request) => {
  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    body = null;
  }
  const notice = await readAppleNotice(body, {
    audiences: appleClientIds(),
    keys: currentAppleKeys(),
  });
  if (notice === null) return new Response(null, { status: 400 });
  if (endsKey(notice)) {
    await ctx.runMutation(internal.appleTokens.endAppleKey, {
      accountId: notice.sub,
      ...(notice.eventTime === undefined ? {} : { eventTime: notice.eventTime }),
    });
  }
  return new Response(null, { status: 200 });
});

/**
 * Our Better Auth plugin for sign-in keys (#397, ADR-0008).
 *
 * A guest saves their account by adding a key (Apple or an email code;
 * Google in #410), and keeps the same user id, games and invites. Better Auth's
 * `/link-social` does not do this safely (it never checks that the key
 * is free, copies no email and keeps `isAnonymous`), so it is off
 * (`auth.ts`) and these routes do it:
 *
 * - `POST /key/nonce`: a one-time nonce for the Apple sheet (no session).
 * - `POST /key/email-code`: sends a sign-in code to an address (#399, no
 *   session needed) and gives the phone the code's ticket. The same
 *   answer whether or not the address has an account.
 * - `POST /key/email-sign-in`: the address, its code and the ticket, on a
 *   phone with no session. Signs in to the account that has the email
 *   key, or to a new saved account.
 * - `POST /key/save`: adds a key to the signed-in user (an Apple id token,
 *   or an email code). A key that is
 *   another user's gives `KEY_BELONGS_TO_OTHER` and changes nothing. For
 *   a guest the error also carries a move offer (#403): the guest's
 *   counts and a signed ticket (`model/moveTicket.ts`).
 * - `POST /key/move`: the ticket of that offer. Moves the guest's games
 *   into the key's account (`guestMove.ts`), deletes the guest and signs
 *   the phone in to the account.
 * - `GET /key/list`: the signed-in user's keys.
 * - `POST /key/remove`: removes a key, never the last one (`LAST_KEY`).
 * - `POST /key/apple-code`: the Apple sheet's `authorizationCode`, once
 *   after a sign-in or a save (#398). The server trades it at Apple and
 *   keeps the refresh token, encrypted, so it can revoke it later.
 *
 * Sign-in with Apple on a phone with no session is Better Auth's own
 * `/sign-in/social` with an id token. Both Apple paths check the token
 * with the same `verifyIdToken` (`auth.ts`). Every path makes its
 * `account` row through the claim in `authKeys.ts`. An email key is an
 * `account` row too (provider `email`, the address as its id): an
 * address never joins an account just because the user's email matches.
 */

import type { BetterAuthPlugin } from 'better-auth';
import {
  APIError,
  createAuthEndpoint,
  getSessionFromCtx,
  sessionMiddleware,
} from 'better-auth/api';
import { setSessionCookie } from 'better-auth/cookies';
import { setTokenUtil } from 'better-auth/oauth2';

import { isEmailCode, isEmailCodeLanguage, normalizeEmail } from '@tavli/contracts';
import type { EmailCodeLanguage, GuestMoveCounts, MailSender } from '@tavli/contracts';

import type { EmailCodeStart, EmailCodeUse } from './emailCodes';
import {
  addressKey,
  callerKey,
  callerOf,
  codeExpiresAt,
  codeKey,
  emailCodeMail,
  isCodeTicket,
  makeCodeTicket,
  makeEmailCode,
  ticketKey,
} from './model/emailCode';
import { makeKeyNonce, KEY_NONCE_RANDOM_BYTES } from './model/keyNonce';
import { checkMoveTicket, makeMoveTicket } from './model/moveTicket';

/**
 * The sign-in key providers. Each but `email` needs a social provider in
 * `auth.ts`; `email` is the code of these routes (#399).
 */
export const KEY_PROVIDER_IDS = ['apple', 'email'] as const;

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
  NO_KEY: 'this account has no key of this kind',
  INVALID_CODE: 'the authorization code is not valid',
  BAD_TICKET: 'the move ticket is not valid, or it ran out',
  INVALID_EMAIL: 'the address is not valid',
  EMAIL_OFF: 'email codes are off on this server',
  KEY_OFF: 'this kind of key is off on this server',
  RATE_LIMITED: 'too many codes asked for; try again later',
  MAIL_FAILED: 'the code email could not be sent; try again later',
  WRONG_CODE: 'the code is wrong',
  CODE_EXPIRED: 'the code ran out or was used; ask for a new one',
  SIGNED_IN: 'sign out first; a signed-in user adds the key with /key/save',
} as const;

export type KeyErrorCode = keyof typeof KEY_ERROR_CODES;

type Status =
  | 'BAD_REQUEST'
  | 'UNAUTHORIZED'
  | 'CONFLICT'
  | 'TOO_MANY_REQUESTS'
  | 'BAD_GATEWAY'
  | 'SERVICE_UNAVAILABLE';

export function keyError(status: Status, code: KeyErrorCode): APIError {
  return new APIError(status, { code, message: KEY_ERROR_CODES[code] });
}

/** What `/key/save` proves: an id token, or an email code. */
type SaveBody =
  | { provider: Exclude<KeyProviderId, 'email'>; token: string; nonce: string }
  | ({ provider: 'email' } & EmailBody);

/**
 * The body of `/key/save`: `{ provider, idToken: { token, nonce } }`, or
 * `{ provider: 'email', email, code, ticket }`.
 */
function readSaveBody(body: unknown): SaveBody {
  const { provider, idToken } = (body ?? {}) as { provider?: unknown; idToken?: unknown };
  if (provider === 'email') return { provider, ...readEmailBody(body) };
  const { token, nonce } = (idToken ?? {}) as { token?: unknown; nonce?: unknown };
  if (
    !isKeyProviderId(provider) ||
    provider === 'email' ||
    typeof token !== 'string' ||
    token === '' ||
    typeof nonce !== 'string' ||
    nonce === ''
  ) {
    throw keyError('BAD_REQUEST', 'BAD_REQUEST');
  }
  return { provider, token, nonce };
}

/** The address of a body, normalized; `INVALID_EMAIL` when it is not one. */
function readEmail(email: unknown): string {
  const normal = typeof email === 'string' ? normalizeEmail(email) : null;
  if (normal === null) throw keyError('BAD_REQUEST', 'INVALID_EMAIL');
  return normal;
}

/** The body of `/key/email-code`: `{ email, language }`. */
function readEmailCodeBody(body: unknown): { email: string; language: EmailCodeLanguage } {
  const { email, language } = (body ?? {}) as { email?: unknown; language?: unknown };
  if (!isEmailCodeLanguage(language)) throw keyError('BAD_REQUEST', 'BAD_REQUEST');
  return { email: readEmail(email), language };
}

/** The address, the code and its ticket. `''` stands for a code or ticket of the wrong form. */
interface EmailBody {
  readonly email: string;
  readonly code: string;
  readonly ticket: string;
}

/** The body of `/key/email-sign-in` and of an email `/key/save`. */
function readEmailBody(body: unknown): EmailBody {
  const { email, code, ticket } = (body ?? {}) as {
    email?: unknown;
    code?: unknown;
    ticket?: unknown;
  };
  return {
    email: readEmail(email),
    code: typeof code === 'string' && isEmailCode(code) ? code : '',
    ticket: typeof ticket === 'string' && isCodeTicket(ticket) ? ticket : '',
  };
}

/** The body of `/key/move`: `{ ticket }`. */
function readMoveBody(body: unknown): string {
  const { ticket } = (body ?? {}) as { ticket?: unknown };
  if (typeof ticket !== 'string' || ticket === '' || ticket.length > 2_000) {
    throw keyError('BAD_REQUEST', 'BAD_REQUEST');
  }
  return ticket;
}

function readRemoveBody(body: unknown): KeyProviderId {
  const { provider } = (body ?? {}) as { provider?: unknown };
  if (!isKeyProviderId(provider)) throw keyError('BAD_REQUEST', 'BAD_REQUEST');
  return provider;
}

/** The body of `/key/apple-code`: `{ authorizationCode, clientId }`. */
function readAppleCodeBody(body: unknown): { code: string; clientId: string } {
  const { authorizationCode, clientId } = (body ?? {}) as {
    authorizationCode?: unknown;
    clientId?: unknown;
  };
  if (
    typeof authorizationCode !== 'string' ||
    authorizationCode === '' ||
    typeof clientId !== 'string' ||
    clientId === ''
  ) {
    throw keyError('BAD_REQUEST', 'BAD_REQUEST');
  }
  return { code: authorizationCode, clientId };
}

/** A user email no address can have: for a new email account whose address another user has. */
function placeholderEmail(): string {
  return `email-${crypto.randomUUID()}@users.tavlaki.invalid`;
}

/** A guest: the anonymous plugin's field, which Better Auth's types do not list. */
function isAnonymousUser(user: object): boolean {
  return (user as { isAnonymous?: unknown }).isAnonymous === true;
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
  /** The apps and the Services ID that may send a code (Apple's `client_id`). */
  readonly appleClientIds: () => readonly string[];
  /**
   * Trades an Apple code (`exchangeAppleCode` in `auth.ts`). Returns the
   * refresh token when Apple took the code and its id token is for
   * `accountId`, else `null`.
   */
  readonly exchangeAppleCode: (call: {
    clientId: string;
    code: string;
    accountId: string;
  }) => Promise<string | null>;
  /**
   * Keeps a token, encrypted already (`saveAppleToken` in `appleTokens.ts`).
   * `false` when the key is gone by then: nothing is kept.
   */
  readonly saveAppleToken: (token: {
    userId: string;
    accountId: string;
    clientId: string;
    refreshToken: string;
  }) => Promise<boolean>;
  /** A guest's games in progress and open invites (`guestMoveCounts` in `guestMove.ts`). */
  readonly guestMoveCounts: (playerId: string) => Promise<GuestMoveCounts>;
  /**
   * Moves guest `source` into account `target` and deletes the guest
   * (`startGuestMove` in `guestMove.ts`). `false` when either changed
   * since the ticket: nothing moved.
   */
  readonly startGuestMove: (move: { source: string; target: string }) => Promise<boolean>;
  /** The mail sender (`mail.ts`), or `null` when email codes are off. */
  readonly mailSender: () => MailSender | null;
  /**
   * Checks the send limits, logs the send and keeps the code
   * (`startEmailCode` in `emailCodes.ts`). `ok` gives the new rows.
   */
  readonly startEmailCode: (start: {
    address: string;
    caller: string | null;
    codeHash: string;
    ticket: string;
    known: boolean;
    expiresAt: number;
    now: number;
  }) => Promise<EmailCodeStart>;
  /** Takes a send back when its mail did not go out (`cancelEmailCode`). */
  readonly cancelEmailCode: (
    rows: Omit<Extract<EmailCodeStart, { ok: true }>, 'ok'>,
  ) => Promise<void>;
  /** Checks a code and counts a wrong try (`useEmailCode` in `emailCodes.ts`). */
  readonly useEmailCode: (use: {
    ticket: string;
    address: string;
    codeHash: string;
    now: number;
  }) => Promise<EmailCodeUse>;
}

/** What a proof gives: the key's account id and the email to copy to the user, if any. */
interface ProvenKey {
  readonly accountId: string;
  readonly email?: string;
  readonly emailVerified: boolean;
}

export function keyPlugin(options: KeyPluginOptions) {
  /**
   * Checks the email code of a body and uses it up. A wrong code counts
   * as a try of that ticket's code (`WRONG_CODE`); no live code for the
   * ticket and the address is `CODE_EXPIRED`. A code of the wrong form is
   * `WRONG_CODE` and no try: it cannot be right.
   */
  async function checkEmailCode(secret: string, body: EmailBody): Promise<void> {
    if (body.ticket === '') throw keyError('UNAUTHORIZED', 'CODE_EXPIRED');
    if (body.code === '') throw keyError('UNAUTHORIZED', 'WRONG_CODE');
    const address = await addressKey(secret, body.email);
    const use = await options.useEmailCode({
      ticket: await ticketKey(secret, body.ticket),
      address,
      codeHash: await codeKey(secret, address, body.code),
      now: Date.now(),
    });
    if (use === 'wrong') throw keyError('UNAUTHORIZED', 'WRONG_CODE');
    if (use === 'dead') throw keyError('UNAUTHORIZED', 'CODE_EXPIRED');
  }

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
          const body = readSaveBody(ctx.body);
          const providerId = body.provider;
          const proveIdToken = async (token: string, nonce: string): Promise<ProvenKey> => {
            const provider = ctx.context.socialProviders.find((p) => p.id === providerId);
            // Our own check (`verifyKeyIdToken` in `auth.ts`), the one Better
            // Auth's sign-in also runs first: Apple's signature, our app, our
            // nonce (once). A provider without it is never trusted here.
            // No provider: this kind of key is off here (Apple with no
            // `APPLE_SERVICES_ID`, #462). The app says so, not "no connection".
            if (provider === undefined) throw keyError('SERVICE_UNAVAILABLE', 'KEY_OFF');
            const verify = provider.options?.verifyIdToken;
            if (verify === undefined) throw keyError('BAD_REQUEST', 'BAD_REQUEST');
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
            const email = info.user.email?.toLowerCase();
            return {
              accountId,
              ...(email !== undefined && email !== '' ? { email } : {}),
              emailVerified: info.user.emailVerified === true,
            };
          };
          const { internalAdapter } = ctx.context;
          const user = ctx.context.session.user;
          const accounts = await internalAdapter.findAccounts(user.id);
          let proven: ProvenKey;
          if (body.provider === 'email') {
            // What this user has already needs no code, so a refusal here
            // does not use one up. Whether the address is another user's
            // key is told only after the code proves it.
            const own = accounts.find((account) => account.providerId === 'email');
            if (own?.accountId === body.email) return ctx.json({ user: userOutput(user) });
            if (own !== undefined) throw keyError('CONFLICT', 'PROVIDER_TAKEN');
            // The code proves the address: it is the key's id and the email.
            await checkEmailCode(ctx.context.secret, body);
            proven = { accountId: body.email, email: body.email, emailVerified: true };
          } else {
            proven = await proveIdToken(body.token, body.nonce);
          }
          const { accountId } = proven;

          const linked = await internalAdapter.findAccountByKey({ providerId, accountId });
          if (linked !== null) {
            if (linked.userId === user.id) {
              // Saved already: nothing to do.
              return ctx.json({ user: userOutput(user) });
            }
            // The key proves the person owns that account too. A guest
            // may move its games there (#403): the ticket binds the two
            // ids, so `/key/move` never takes an id from the app.
            const isGuest =
              isAnonymousUser(user) &&
              !accounts.some((account) => isKeyProviderId(account.providerId));
            const owner = await internalAdapter.findUserById(linked.userId);
            if (!isGuest || owner === null || isAnonymousUser(owner)) {
              throw keyError('CONFLICT', 'KEY_BELONGS_TO_OTHER');
            }
            const ticket = await makeMoveTicket(
              ctx.context.secret,
              { source: user.id, target: owner.id },
              Date.now(),
            );
            const counts = await options.guestMoveCounts(user.id);
            throw new APIError('CONFLICT', {
              code: 'KEY_BELONGS_TO_OTHER',
              message: KEY_ERROR_CODES.KEY_BELONGS_TO_OTHER,
              move: { ticket, activeGames: counts.activeGames, openInvites: counts.openInvites },
            });
          }
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
          const { email } = proven;
          if (email !== undefined) {
            const other = await internalAdapter.findUserByEmail(email);
            if (other === null || other.user.id === user.id) {
              patch.email = email;
              patch.emailVerified = proven.emailVerified;
            }
          }
          const updated = await internalAdapter.updateUser(user.id, patch);
          return ctx.json({ user: userOutput({ ...user, ...patch, ...(updated ?? {}) }) });
        },
      ),

      emailCode: createAuthEndpoint('/key/email-code', { method: 'POST' }, async (ctx) => {
        const { email, language } = readEmailCodeBody(ctx.body);
        const sender = options.mailSender();
        if (sender === null) throw keyError('SERVICE_UNAVAILABLE', 'EMAIL_OFF');
        const { secret } = ctx.context;
        // No session is fine: a phone with none signs in with the code.
        const session = await getSessionFromCtx(ctx).catch(() => null);
        const caller = callerOf(ctx.request?.headers ?? ctx.headers, session?.user.id ?? null);
        const random = (bytes: number) => crypto.getRandomValues(new Uint8Array(bytes));
        const code = makeEmailCode(random);
        const ticket = makeCodeTicket(random);
        const address = await addressKey(secret, email);
        const now = Date.now();
        // The answer is the same for any address. The key lookup picks only
        // the limits: a player with an email key is never under the day cap
        // of new addresses, so a flood of sends to strangers cannot lock
        // them out. While that cap is full, only a new address gets
        // RATE_LIMITED.
        const known =
          (await ctx.context.internalAdapter.findAccountByKey({
            providerId: 'email',
            accountId: email,
          })) !== null;
        const started = await options.startEmailCode({
          address,
          caller: caller === null ? null : await callerKey(secret, caller),
          codeHash: await codeKey(secret, address, code),
          ticket: await ticketKey(secret, ticket),
          known,
          expiresAt: codeExpiresAt(now),
          now,
        });
        if (!started.ok) {
          throw new APIError('TOO_MANY_REQUESTS', {
            code: 'RATE_LIMITED',
            message: KEY_ERROR_CODES.RATE_LIMITED,
            retryAfterMs: started.retryAfterMs,
          });
        }
        const sent = await sender.send({ to: email, ...emailCodeMail(code, language) });
        // Never log the address or the code.
        if (!sent.ok && sent.error !== 'Rejected') {
          // The mail did not go out: take the send back, so it costs no
          // limit. Earlier codes of the address still work.
          await options.cancelEmailCode({ code: started.code, sends: started.sends });
          throw keyError('BAD_GATEWAY', 'MAIL_FAILED');
        }
        // `Rejected`: the mail service refuses the address itself (a
        // bounce or a block list). The answer stays the same as for any
        // other address, so no one learns which ones those are; the send
        // still counts.
        return ctx.json({ sent: true, ticket });
      }),

      emailSignIn: createAuthEndpoint('/key/email-sign-in', { method: 'POST' }, async (ctx) => {
        const body = readEmailBody(ctx.body);
        // A signed-in phone adds the key with `/key/save` (a guest keeps its
        // games, or gets the move offer); a sign-in here would leave them.
        if ((await getSessionFromCtx(ctx).catch(() => null)) !== null) {
          throw keyError('CONFLICT', 'SIGNED_IN');
        }
        const { email } = body;
        await checkEmailCode(ctx.context.secret, body);
        const { internalAdapter } = ctx.context;
        const keyOwner = async () => {
          const key = await internalAdapter.findAccountByKey({
            providerId: 'email',
            accountId: email,
          });
          return key === null ? null : internalAdapter.findUserById(key.userId);
        };
        let user = await keyOwner();
        if (user === null) {
          // A new saved account with this email key. A user who has the
          // same address as their email but no email key is someone else
          // to us (ADR-0008: no joins by email), so the new user gets a
          // placeholder email then (emails are unique).
          const free = (await internalAdapter.findUserByEmail(email)) === null;
          const created = await internalAdapter.createUser(
            {
              email: free ? email : placeholderEmail(),
              emailVerified: free,
              name: '',
              isAnonymous: false,
            },
            { method: 'email-otp' },
          );
          try {
            // Claimed first (`claimKey`), like every key.
            await internalAdapter.createAccount({
              userId: created.id,
              providerId: 'email',
              accountId: email,
            });
            user = created;
          } catch (error) {
            // Another sign-in with this address made the account a moment ago.
            await internalAdapter.deleteUser(created.id);
            user = await keyOwner();
            if (user === null) throw error;
          }
        }
        const session = await internalAdapter.createSession(user.id);
        if (session === null) throw keyError('UNAUTHORIZED', 'CODE_EXPIRED');
        await setSessionCookie(ctx, { session, user });
        return ctx.json({ token: session.token, user: userOutput(user) });
      }),

      moveGuest: createAuthEndpoint(
        '/key/move',
        { method: 'POST', use: [sessionMiddleware] },
        async (ctx) => {
          const move = await checkMoveTicket(
            ctx.context.secret,
            readMoveBody(ctx.body),
            Date.now(),
          );
          // A ticket works only for the guest it was made for, signed in.
          if (move === null || move.source !== ctx.context.session.user.id) {
            throw keyError('BAD_REQUEST', 'BAD_TICKET');
          }
          // Checks both users again and deletes the guest with its
          // sessions, so a second call with the same ticket fails above.
          if (!(await options.startGuestMove(move))) throw keyError('BAD_REQUEST', 'BAD_TICKET');
          // The move is done now. If the session below fails, the guest is
          // gone and the phone is signed out: the player signs in again with
          // the key, and the move goes on (its pages are scheduled).
          const { internalAdapter } = ctx.context;
          const owner = await internalAdapter.findUserById(move.target);
          const session = await internalAdapter.createSession(move.target);
          if (owner === null || session === null) throw keyError('BAD_REQUEST', 'BAD_TICKET');
          // The phone is signed in to the account now, as after a sign-in.
          await setSessionCookie(ctx, { session, user: owner });
          return ctx.json({ token: session.token, user: userOutput(owner) });
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
          if (keys.length <= 1) throw keyError('CONFLICT', 'LAST_KEY');
          await internalAdapter.deleteAccount(target.id);
          await options.releaseKey({ providerId, accountId: target.accountId, userId });
          return ctx.json({ removed: true });
        },
      ),

      appleCode: createAuthEndpoint(
        '/key/apple-code',
        { method: 'POST', use: [sessionMiddleware] },
        async (ctx) => {
          const { code, clientId } = readAppleCodeBody(ctx.body);
          if (!options.appleClientIds().includes(clientId)) {
            throw keyError('BAD_REQUEST', 'BAD_REQUEST');
          }
          const userId = ctx.context.session.user.id;
          const key = (await ctx.context.internalAdapter.findAccounts(userId)).find(
            (account) => account.providerId === 'apple',
          );
          if (key === undefined) throw keyError('BAD_REQUEST', 'NO_KEY');
          // The code must be for this user's own Apple id.
          const token = await options.exchangeAppleCode({
            clientId,
            code,
            accountId: key.accountId,
          });
          if (token === null) throw keyError('UNAUTHORIZED', 'INVALID_CODE');
          // Encrypted the way Better Auth keeps OAuth tokens (`encryptOAuthTokens`).
          const refreshToken = await setTokenUtil(token, ctx.context);
          if (typeof refreshToken !== 'string' || refreshToken === '') {
            throw keyError('UNAUTHORIZED', 'INVALID_CODE');
          }
          const saved = await options.saveAppleToken({
            userId,
            accountId: key.accountId,
            clientId,
            refreshToken,
          });
          // The key went while Apple traded the code.
          if (!saved) throw keyError('BAD_REQUEST', 'NO_KEY');
          return ctx.json({ saved: true });
        },
      ),
    },
  } satisfies BetterAuthPlugin;
}

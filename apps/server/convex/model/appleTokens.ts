/**
 * Apple's refresh token and its revoke (#398). Apple asks an app with
 * Sign in with Apple to revoke the user's token when the account is
 * deleted in the app.
 *
 * - The app trades the sheet's `authorizationCode` here once
 *   (`exchangeCode`): Apple gives a refresh token, which the server keeps,
 *   encrypted, while the key stays.
 * - Account delete and key removal revoke it (`revoke`).
 * - Apple tells the server when a person stops using Sign in with Apple
 *   for the app (`readAppleNotice`): the server drops the key then.
 *
 * Each call to Apple signs a client secret with the team's key
 * (`makeAppleClientSecret`). No Convex types here; the network is the
 * `AppleTokenClient`, so tests never reach Apple.
 */

import { SignJWT, decodeJwt, importPKCS8, jwtVerify } from 'jose';
import type { JWTVerifyGetKey } from 'jose';

import { APPLE_ISSUER } from './appleIdToken';

export const APPLE_TOKEN_URL = 'https://appleid.apple.com/auth/token';
export const APPLE_REVOKE_URL = 'https://appleid.apple.com/auth/revoke';

/** How long one call to Apple may take. */
export const APPLE_CALL_TIMEOUT_MS = 10_000;

/** A client secret lives this long; each call makes a new one. */
export const CLIENT_SECRET_TTL_S = 5 * 60;

/** The team's key for Apple's token calls, from the Convex env. */
export interface AppleKeyConfig {
  readonly teamId: string;
  readonly keyId: string;
  /** The `.p8` text (PKCS #8 PEM). */
  readonly privateKey: string;
}

/**
 * The key from `APPLE_TEAM_ID`, `APPLE_KEY_ID` and `APPLE_PRIVATE_KEY`,
 * or `null` when one is missing. A key pasted with `\n` for its line
 * breaks works too.
 */
export function appleKeyConfig(env: Record<string, string | undefined>): AppleKeyConfig | null {
  const teamId = env['APPLE_TEAM_ID']?.trim() ?? '';
  const keyId = env['APPLE_KEY_ID']?.trim() ?? '';
  const privateKey = (env['APPLE_PRIVATE_KEY'] ?? '').replace(/\\n/g, '\n').trim();
  if (teamId === '' || keyId === '' || privateKey === '') return null;
  return { teamId, keyId, privateKey };
}

/**
 * The client secret for one call to Apple: an ES256 JWT from the team
 * (`iss`) for the app (`sub`, the bundle id or the Services ID that got
 * the code), signed with the team's key.
 */
export async function makeAppleClientSecret(
  key: AppleKeyConfig,
  clientId: string,
  now: number,
): Promise<string> {
  const signingKey = await importPKCS8(key.privateKey, 'ES256');
  const iat = Math.floor(now / 1000);
  return await new SignJWT({})
    .setProtectedHeader({ alg: 'ES256', kid: key.keyId })
    .setIssuer(key.teamId)
    .setSubject(clientId)
    .setAudience(APPLE_ISSUER)
    .setIssuedAt(iat)
    .setExpirationTime(iat + CLIENT_SECRET_TTL_S)
    .sign(signingKey);
}

/** What one call to Apple needs besides its own field. */
export interface AppleCall {
  /** The bundle id or the Services ID. */
  readonly clientId: string;
  readonly clientSecret: string;
}

/** Apple's token and revoke calls. Tests pass a fake. */
export interface AppleTokenClient {
  /**
   * Trades an authorization code. Returns Apple's refresh token and id
   * token, or `null` when Apple says no (a used or old code, the wrong
   * app) or cannot be reached.
   */
  exchangeCode(
    call: AppleCall & { readonly code: string },
  ): Promise<{ readonly refreshToken: string; readonly idToken: string } | null>;
  /** Revokes a refresh token. `true` when Apple took it. */
  revoke(call: AppleCall & { readonly refreshToken: string }): Promise<boolean>;
}

async function post(
  fetcher: typeof fetch,
  url: string,
  form: Record<string, string>,
): Promise<Response | null> {
  try {
    return await fetcher(url, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(form).toString(),
      signal: AbortSignal.timeout(APPLE_CALL_TIMEOUT_MS),
    });
  } catch {
    return null;
  }
}

/** The `AppleTokenClient` on Apple's servers. */
export function createAppleTokenClient(fetcher: typeof fetch = fetch): AppleTokenClient {
  return {
    async exchangeCode({ clientId, clientSecret, code }) {
      const response = await post(fetcher, APPLE_TOKEN_URL, {
        client_id: clientId,
        client_secret: clientSecret,
        code,
        grant_type: 'authorization_code',
      });
      if (response === null || !response.ok) return null;
      try {
        const body = (await response.json()) as { refresh_token?: unknown; id_token?: unknown };
        const refreshToken = body.refresh_token;
        const idToken = body.id_token;
        if (typeof refreshToken !== 'string' || refreshToken === '') return null;
        if (typeof idToken !== 'string' || idToken === '') return null;
        return { refreshToken, idToken };
      } catch {
        return null;
      }
    },
    async revoke({ clientId, clientSecret, refreshToken }) {
      const response = await post(fetcher, APPLE_REVOKE_URL, {
        client_id: clientId,
        client_secret: clientSecret,
        token: refreshToken,
        token_type_hint: 'refresh_token',
      });
      return response?.ok === true;
    },
  };
}

/**
 * The `sub` of the id token Apple sent with a traded code. Apple sent it
 * over TLS in reply to our own call, so this reads it with no signature
 * check. `null` when it has none.
 */
export function subjectOfAppleIdToken(idToken: string): string | null {
  try {
    const { sub } = decodeJwt(idToken);
    return typeof sub === 'string' && sub !== '' ? sub : null;
  } catch {
    return null;
  }
}

/** The notice types that end the key: the person stopped using it, or deleted their Apple account. */
export const KEY_ENDING_NOTICES = ['consent-revoked', 'account-delete'] as const;

export type KeyEndingNotice = (typeof KEY_ENDING_NOTICES)[number];

/** What the server reads from one of Apple's server-to-server notices. */
export interface AppleNotice {
  readonly type: string;
  /** Apple's id for the person: the key's `accountId`. */
  readonly sub: string;
  /** When it happened, epoch ms, when Apple says. */
  readonly eventTime?: number;
}

export function endsKey(notice: AppleNotice): notice is AppleNotice & { type: KeyEndingNotice } {
  return (KEY_ENDING_NOTICES as readonly string[]).includes(notice.type);
}

export interface AppleNoticeCheck {
  /** Our bundle ids and the Services ID. */
  readonly audiences: readonly string[];
  readonly keys: JWTVerifyGetKey;
  /** The clock for `exp` and `iat`, epoch ms. Default: now. */
  readonly now?: number;
}

/**
 * Reads the body of a notice (`{ "payload": "<JWT>" }`): the JWT must be
 * signed by Apple for one of our apps. Its `events` claim is JSON text
 * (an object is taken too). Returns `null` for anything else. Never
 * throws. The email fields of email notices are never read.
 */
export async function readAppleNotice(
  body: unknown,
  check: AppleNoticeCheck,
): Promise<AppleNotice | null> {
  const payload = (body as { payload?: unknown } | null)?.payload;
  if (typeof payload !== 'string' || payload === '' || check.audiences.length === 0) return null;
  try {
    const { payload: claims } = await jwtVerify(payload, check.keys, {
      issuer: APPLE_ISSUER,
      audience: [...check.audiences],
      algorithms: ['RS256'],
      ...(check.now === undefined ? {} : { currentDate: new Date(check.now) }),
    });
    const raw = claims['events'];
    const events = (typeof raw === 'string' ? JSON.parse(raw) : raw) as {
      type?: unknown;
      sub?: unknown;
      event_time?: unknown;
    } | null;
    if (typeof events?.type !== 'string' || typeof events.sub !== 'string') return null;
    if (events.sub === '') return null;
    const time = events.event_time;
    return typeof time === 'number' && Number.isFinite(time)
      ? { type: events.type, sub: events.sub, eventTime: time }
      : { type: events.type, sub: events.sub };
  } catch {
    return null;
  }
}

/**
 * Checks an Apple id token from the native Sign in with Apple sheet
 * (#397). Better Auth's own check lets a token with no nonce through, so
 * the server uses this one (`auth.ts` sets it as Apple's `verifyIdToken`).
 *
 * The token must be signed by one of Apple's keys, come from Apple
 * (`iss`), name one of our apps (`aud`: a bundle id or the Services ID),
 * be at most an hour old, and carry the nonce: the raw text, or its
 * SHA-256 in hex (what the iOS sheet puts in when the app passes a hash).
 *
 * No Convex types; the keys are an argument, so tests sign their own
 * tokens and never reach Apple.
 */

import { jwtVerify } from 'jose';
import type { JWTVerifyGetKey } from 'jose';

export const APPLE_ISSUER = 'https://appleid.apple.com';

/** Apple's public keys, for `createRemoteJWKSet`. */
export const APPLE_KEYS_URL = 'https://appleid.apple.com/auth/keys';

/** What the server reads from a good token. */
export interface AppleIdClaims {
  /** Apple's id for this person in our team: the key's `accountId`. */
  readonly sub: string;
  readonly email: string | undefined;
  readonly emailVerified: boolean;
}

export interface AppleIdTokenCheck {
  /** Our bundle ids and the Services ID. */
  readonly audiences: readonly string[];
  readonly keys: JWTVerifyGetKey;
  /** The nonce the app sent with the token. */
  readonly nonce: string;
  /** The clock for `exp` and `iat`, epoch ms. Default: now. */
  readonly now?: number;
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Apple sends some booleans as the text `"true"`. */
function flag(value: unknown): boolean {
  return value === true || value === 'true';
}

/**
 * Why a token was turned down: a short code for the server log (#462).
 * It names the check only, never the token, the nonce or Apple's id.
 */
export type AppleIdTokenProblem =
  | 'no-nonce'
  | 'no-audience'
  | 'bad-token'
  | 'unknown-key'
  | 'keys-unreachable'
  | 'bad-signature'
  | 'wrong-issuer'
  | 'wrong-audience'
  | 'expired'
  | 'too-old'
  | 'bad-time'
  | 'bad-claim'
  | 'token-has-no-nonce'
  | 'nonce-mismatch'
  | 'no-subject';

/** What `checkAppleIdToken` found. */
export type AppleIdTokenCheckResult =
  | { readonly ok: true; readonly claims: AppleIdClaims }
  | {
      readonly ok: false;
      readonly problem: AppleIdTokenProblem;
      /**
       * The token's `aud` with `wrong-audience`: a bundle id, so the log
       * can say which app sent it. Only plain id text, else absent.
       */
      readonly audience?: string;
    };

/** A bundle id or Services ID: letters, digits, dots and dashes. */
const PLAIN_ID = /^[A-Za-z0-9.-]{1,100}$/;

/** The token's `aud`, unchecked, when it is plain id text. */
function audienceOf(token: string): string | undefined {
  try {
    const part = token.split('.')[1] ?? '';
    const json = atob(part.replace(/-/g, '+').replace(/_/g, '/'));
    const aud: unknown = (JSON.parse(json) as Record<string, unknown>)['aud'];
    const first = Array.isArray(aud) ? (aud as unknown[])[0] : aud;
    return typeof first === 'string' && PLAIN_ID.test(first) ? first : undefined;
  } catch {
    return undefined;
  }
}

/** Names the check a `jwtVerify` error comes from (jose's `code` and `claim`). */
function problemOf(error: unknown): AppleIdTokenProblem {
  const { code, claim } = (error ?? {}) as { code?: unknown; claim?: unknown };
  switch (code) {
    case 'ERR_JWT_EXPIRED':
      return claim === 'iat' ? 'too-old' : 'expired';
    case 'ERR_JWT_CLAIM_VALIDATION_FAILED':
      if (claim === 'iss') return 'wrong-issuer';
      if (claim === 'aud') return 'wrong-audience';
      if (claim === 'iat' || claim === 'nbf') return 'bad-time';
      return 'bad-claim';
    case 'ERR_JWS_SIGNATURE_VERIFICATION_FAILED':
      return 'bad-signature';
    case 'ERR_JWKS_NO_MATCHING_KEY':
    case 'ERR_JWKS_MULTIPLE_MATCHING_KEYS':
      return 'unknown-key';
    case 'ERR_JWKS_TIMEOUT':
    case 'ERR_JWKS_INVALID':
      return 'keys-unreachable';
    default:
      // jose names every token problem with an `ERR_` code; anything else
      // came from fetching Apple's keys.
      return typeof code === 'string' && code.startsWith('ERR_') ? 'bad-token' : 'keys-unreachable';
  }
}

/** The claims of a good token, or the check that failed. Never throws. */
export async function checkAppleIdToken(
  token: string,
  check: AppleIdTokenCheck,
): Promise<AppleIdTokenCheckResult> {
  if (check.nonce === '') return { ok: false, problem: 'no-nonce' };
  if (check.audiences.length === 0) return { ok: false, problem: 'no-audience' };
  let payload;
  try {
    ({ payload } = await jwtVerify(token, check.keys, {
      issuer: APPLE_ISSUER,
      audience: [...check.audiences],
      algorithms: ['RS256'],
      maxTokenAge: '1h',
      ...(check.now === undefined ? {} : { currentDate: new Date(check.now) }),
    }));
  } catch (error) {
    const problem = problemOf(error);
    if (problem !== 'wrong-audience') return { ok: false, problem };
    const audience = audienceOf(token);
    return audience === undefined ? { ok: false, problem } : { ok: false, problem, audience };
  }
  const nonce = payload['nonce'];
  if (typeof nonce !== 'string') return { ok: false, problem: 'token-has-no-nonce' };
  if (nonce !== check.nonce && nonce !== (await sha256Hex(check.nonce))) {
    return { ok: false, problem: 'nonce-mismatch' };
  }
  if (typeof payload.sub !== 'string' || payload.sub === '') {
    return { ok: false, problem: 'no-subject' };
  }
  const email = payload['email'];
  return {
    ok: true,
    claims: {
      sub: payload.sub,
      email: typeof email === 'string' && email !== '' ? email : undefined,
      emailVerified: flag(payload['email_verified']),
    },
  };
}

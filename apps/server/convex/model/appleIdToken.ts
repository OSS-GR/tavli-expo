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

/** The claims of a good token, or `null` (any failed check). Never throws. */
export async function verifyAppleIdToken(
  token: string,
  check: AppleIdTokenCheck,
): Promise<AppleIdClaims | null> {
  if (check.nonce === '' || check.audiences.length === 0) return null;
  try {
    const { payload } = await jwtVerify(token, check.keys, {
      issuer: APPLE_ISSUER,
      audience: [...check.audiences],
      algorithms: ['RS256'],
      maxTokenAge: '1h',
      ...(check.now === undefined ? {} : { currentDate: new Date(check.now) }),
    });
    const nonce = payload['nonce'];
    if (typeof nonce !== 'string') return null;
    if (nonce !== check.nonce && nonce !== (await sha256Hex(check.nonce))) return null;
    if (typeof payload.sub !== 'string' || payload.sub === '') return null;
    const email = payload['email'];
    return {
      sub: payload.sub,
      email: typeof email === 'string' && email !== '' ? email : undefined,
      emailVerified: flag(payload['email_verified']),
    };
  } catch {
    return null;
  }
}

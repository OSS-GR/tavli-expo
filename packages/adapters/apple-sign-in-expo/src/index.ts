/**
 * Sign in with Apple on the phone (#401): the `AppleSheet` port and
 * Apple's own button, on expo-apple-authentication. The only place that
 * may import it (lint vendor list).
 *
 * - The sheet asks Apple for the email only, never the name: Better
 *   Auth needs an email to make the account (the player may pick Apple's
 *   "Hide My Email"), and we keep no name (ADR-0008).
 * - It passes our server's nonce as it is; the server takes the raw text
 *   or its SHA-256 (`model/appleIdToken.ts`).
 * - A closed sheet is `null`. Apple's "unknown" error is
 *   `appleSheetUnfinished()` (#442): iOS gives it when the phone has no
 *   Apple ID and the player closes the prompt to sign in to one.
 * - iPhone only. On Android `isAvailable` is false: Apple there needs a
 *   browser flow on the server, which comes later.
 */
import { appleSheetUnfinished, type AppleSheet } from '@tavli/contracts';
import * as AppleAuthentication from 'expo-apple-authentication';

export { AppleSignInButton } from './AppleSignInButton';
export type { AppleSignInButtonProps } from './AppleSignInButton';

/** The code Apple's sheet rejects with when the player closes it. */
const CANCELED = 'ERR_REQUEST_CANCELED';
/** Apple's "unknown" error (`ASAuthorizationError` 1000): most often no Apple ID. */
const UNKNOWN = 'ERR_REQUEST_UNKNOWN';

export function createExpoAppleSheet(): AppleSheet {
  return {
    async isAvailable() {
      try {
        return await AppleAuthentication.isAvailableAsync();
      } catch {
        return false;
      }
    },
    async signIn(nonce) {
      let credential: AppleAuthentication.AppleAuthenticationCredential;
      try {
        credential = await AppleAuthentication.signInAsync({
          requestedScopes: [AppleAuthentication.AppleAuthenticationScope.EMAIL],
          nonce,
        });
      } catch (error) {
        const code = (error as { code?: unknown } | null)?.code;
        if (code === CANCELED) return null;
        if (code === UNKNOWN) throw appleSheetUnfinished();
        throw error;
      }
      if (credential.identityToken === null || credential.identityToken === '') {
        throw new Error('Apple gave no id token');
      }
      return {
        idToken: credential.identityToken,
        authorizationCode: credential.authorizationCode,
      };
    },
  };
}

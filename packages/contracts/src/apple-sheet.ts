/**
 * Apple's Sign in with Apple sheet on the phone (#401, ADR-0008).
 *
 * The sheet proves that the player owns an Apple id: it gives an id token
 * that carries our server's nonce (`AuthProvider.keyNonce()`), and a
 * one-time `authorizationCode`. The app passes both to
 * `AuthProvider.signInWithKey`; the server trades the code for Apple's
 * refresh token, so it can revoke it when the account is deleted (#398).
 *
 * The adapter is `@tavli/apple-sign-in-expo` (iPhone only; Apple on
 * Android needs a browser flow on the server, later). The in-memory sheet
 * below is for tests.
 */

import { memoryAppleIdToken } from './auth';

/** What Apple's sheet gives back. Plain JSON. */
export interface AppleSheetProof {
  /** The id token (a JWT). It carries the nonce the sheet got. */
  readonly idToken: string;
  /**
   * A one-time code for the server's token trade, or `null` when Apple
   * gave none. Never log it.
   */
  readonly authorizationCode: string | null;
}

/**
 * The `code` of the error `signIn` rejects with when Apple's sheet ended
 * with no answer it could name (#442). Most often the phone has no Apple
 * ID: iOS asks the player to sign in to one, and closing that prompt gives
 * this, not a closed sheet.
 */
export const APPLE_SHEET_UNFINISHED = 'APPLE_SHEET_UNFINISHED';

/** The error for `APPLE_SHEET_UNFINISHED`. */
export function appleSheetUnfinished(): Error {
  return Object.assign(new Error('Apple sign-in did not finish'), {
    code: APPLE_SHEET_UNFINISHED,
  });
}

/** True for the error of `appleSheetUnfinished()`. */
export function isAppleSheetUnfinished(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === APPLE_SHEET_UNFINISHED
  );
}

export interface AppleSheet {
  /** True when this phone can show Sign in with Apple (iPhone, iOS 13 or later). */
  isAvailable(): Promise<boolean>;
  /**
   * Shows Apple's sheet with `nonce` (from `keyNonce()`). Resolves with
   * the proof, or `null` when the player closes the sheet. Rejects with
   * `appleSheetUnfinished()` when Apple ended with no answer it could
   * name (no Apple ID on the phone), and with any error on other problems.
   */
  signIn(nonce: string): Promise<AppleSheetProof | null>;
}

/** How the in-memory sheet answers. Change the fields between calls. */
export interface MemoryAppleSheet extends AppleSheet {
  /** The Apple id the next sign-in proves. Default `apple-1`. */
  sub: string;
  /** What `isAvailable` says. Default `true`. */
  available: boolean;
  /**
   * What the next `signIn` does: give a proof, act out a closed sheet,
   * end unfinished (no Apple ID on the phone), or fail.
   */
  next: 'proof' | 'cancel' | 'unfinished' | 'fail';
  /** The nonces the sheet was shown with, oldest first. */
  readonly shown: string[];
}

/**
 * An `AppleSheet` in memory. Its id tokens are `memoryAppleIdToken(sub,
 * nonce)`, which the in-memory `AuthProvider` accepts, and its code is
 * `code-<sub>`.
 */
export function createMemoryAppleSheet(): MemoryAppleSheet {
  const sheet: MemoryAppleSheet = {
    sub: 'apple-1',
    available: true,
    next: 'proof',
    shown: [],
    isAvailable: () => Promise.resolve(sheet.available),
    async signIn(nonce) {
      await Promise.resolve();
      sheet.shown.push(nonce);
      if (sheet.next === 'cancel') return null;
      if (sheet.next === 'unfinished') throw appleSheetUnfinished();
      if (sheet.next === 'fail') throw new Error('the Apple sheet failed');
      return {
        idToken: memoryAppleIdToken(sheet.sub, nonce),
        authorizationCode: `code-${sheet.sub}`,
      };
    },
  };
  return sheet;
}

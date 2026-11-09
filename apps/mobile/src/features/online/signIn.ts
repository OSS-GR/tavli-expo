/**
 * The ways into online play (#401, ADR-0008): Sign in with Apple, or a
 * guest account. `SignInChoices` shows them; this file does the work.
 *
 * - Apple: a nonce from our server (`keyNonce`), Apple's sheet with it,
 *   then `signInWithKey`. The adapter sends Apple's one-time code to the
 *   server after the sign-in, so the server can revoke Apple's token when
 *   the account goes (#398). A closed sheet is no sign-in and no problem.
 * - Guest: `signInForOnline` (the saved session first, so the guest is
 *   made once).
 * - Each new sign-in sends `online_sign_in` with the way only (`apple` or
 *   `guest`): never the user id, the email or the Apple id.
 */
import type { Analytics, AppleSheet, AuthProvider, AuthUser } from '@tavli/contracts';
import { useEffect, useRef, useState } from 'react';

import { quietly } from '@/features/analytics/quietly';

import { onlineAccountReady, signInForOnline } from './account';

export type SignInMethod = 'apple' | 'guest';

/**
 * Signs in with Apple's sheet. Resolves with the user, or `null` when the
 * player closed the sheet. Rejects when the sheet or the server failed.
 */
export async function signInWithApple(
  auth: AuthProvider,
  sheet: AppleSheet,
): Promise<AuthUser | null> {
  const nonce = await auth.keyNonce();
  const proof = await sheet.signIn(nonce);
  if (proof === null) return null;
  const user = await auth.signInWithKey({
    provider: 'apple',
    idToken: proof.idToken,
    nonce,
    ...(proof.authorizationCode === null ? {} : { authorizationCode: proof.authorizationCode }),
  });
  onlineAccountReady();
  return user;
}

export interface SignInChoicesState {
  /** Apple's sheet works on this phone (iPhone). `false` until the phone says. */
  readonly appleAvailable: boolean;
  /** The way being tried, or `null`. */
  readonly busy: SignInMethod | null;
  /** The last try failed (not a closed Apple sheet). */
  readonly failed: boolean;
  readonly choose: (method: SignInMethod) => void;
}

export interface SignInChoicesOptions {
  auth: AuthProvider;
  appleSheet: AppleSheet;
  analytics: Analytics;
  onSignedIn: (user: AuthUser) => void;
}

/** The state of the sign-in choices. One try at a time. */
export function useSignInChoices({
  auth,
  appleSheet,
  analytics,
  onSignedIn,
}: SignInChoicesOptions): SignInChoicesState {
  const [appleAvailable, setAppleAvailable] = useState(false);
  const [busy, setBusy] = useState<SignInMethod | null>(null);
  const [failed, setFailed] = useState(false);
  // One try at a time: a second tap before the render sees `busy` does nothing.
  const trying = useRef(false);
  // False once the screen is gone (the sign-in answers later).
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    let live = true;
    appleSheet.isAvailable().then(
      (available) => {
        if (live) setAppleAvailable(available);
      },
      () => {},
    );
    return () => {
      live = false;
    };
  }, [appleSheet]);

  const choose = (method: SignInMethod) => {
    if (trying.current) return;
    trying.current = true;
    setBusy(method);
    setFailed(false);
    const signIn = method === 'apple' ? signInWithApple(auth, appleSheet) : signInForOnline(auth);
    signIn.then(
      (user) => {
        trying.current = false;
        if (user !== null) {
          quietly(() => analytics.track('online_sign_in', { method }));
        }
        if (!mounted.current) return;
        setBusy(null);
        if (user !== null) onSignedIn(user);
      },
      () => {
        trying.current = false;
        if (!mounted.current) return;
        setBusy(null);
        setFailed(true);
      },
    );
  };

  return { appleAvailable, busy, failed, choose };
}

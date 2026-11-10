/**
 * The ways into online play (#401, ADR-0008): Sign in with Apple, or a
 * guest account. `SignInChoices` shows them; this file does the work.
 *
 * - Apple: a nonce from our server (`keyNonce`), Apple's sheet with it,
 *   then `signInWithKey`. The adapter sends Apple's one-time code to the
 *   server after the sign-in, so the server can revoke Apple's token when
 *   the account goes (#398). A closed sheet is no sign-in and no problem.
 *   A sheet that ended unfinished (no Apple ID on the phone, #442) has its
 *   own text: the connection is not the problem.
 * - Guest: `signInForOnline` (the saved session first, so the guest is
 *   made once).
 * - Each new sign-in sends `online_sign_in` with the way only (`apple` or
 *   `guest`): never the user id, the email or the Apple id.
 * - The username step (#405): after a sign-in with a key, a saved account
 *   with no username yet gets `step` (the choices show `UsernameForm`);
 *   `finishStep` then hands the user on. When the server cannot say, the
 *   user goes on at once: the name can wait for Settings.
 * - Reminders (#404): the first guest sign-in starts the save reminders
 *   on Home; a sign-in with a key stops them.
 */
import {
  isAppleSheetUnfinished,
  type Analytics,
  type AppleSheet,
  type AuthKeyCredential,
  type AuthProvider,
  type AuthUser,
  type MyUsername,
  type Usernames,
} from '@tavli/contracts';
import { useEffect, useRef, useState } from 'react';

import { quietly } from '@/features/analytics/quietly';
import { reminders } from '@/features/reminders/reminders';

import { onlineAccountReady, signInForOnline } from './account';
import { needsUsernameStep } from './usernameStep';

export type SignInMethod = 'apple' | 'guest';

/**
 * Why the last try failed: Apple's sheet ended unfinished (most often no
 * Apple ID on the phone, #442), or anything else (the connection).
 */
export type SignInFailure = 'appleUnfinished' | 'other';

/**
 * Apple's proof for our server: a nonce from the server (`keyNonce`), then
 * Apple's sheet with it. `null` when the player closed the sheet. Both
 * `signInWithKey` and `saveKey` (Settings → Account, #402) take it.
 */
export async function appleCredential(
  auth: AuthProvider,
  sheet: AppleSheet,
): Promise<AuthKeyCredential | null> {
  const nonce = await auth.keyNonce();
  const proof = await sheet.signIn(nonce);
  if (proof === null) return null;
  return {
    provider: 'apple',
    idToken: proof.idToken,
    nonce,
    ...(proof.authorizationCode === null ? {} : { authorizationCode: proof.authorizationCode }),
  };
}

/**
 * Signs in with Apple's sheet. Resolves with the user, or `null` when the
 * player closed the sheet. Rejects when the sheet or the server failed.
 */
export async function signInWithApple(
  auth: AuthProvider,
  sheet: AppleSheet,
): Promise<AuthUser | null> {
  const credential = await appleCredential(auth, sheet);
  if (credential === null) return null;
  const user = await auth.signInWithKey(credential);
  onlineAccountReady();
  return user;
}

export interface SignInChoicesState {
  /** Apple's sheet works on this phone (iPhone). `false` until the phone says. */
  readonly appleAvailable: boolean;
  /** The way being tried, or `null`. */
  readonly busy: SignInMethod | null;
  /** Why the last try failed, or `null` (a closed Apple sheet is no failure). */
  readonly failed: SignInFailure | null;
  readonly choose: (method: SignInMethod) => void;
  /** A saved account with no username yet: show the username step. */
  readonly step: { readonly user: AuthUser; readonly mine: MyUsername } | null;
  /** Ends the username step (saved or Not now) and hands the user on. */
  readonly finishStep: () => void;
}

export interface SignInChoicesOptions {
  auth: AuthProvider;
  appleSheet: AppleSheet;
  analytics: Analytics;
  onSignedIn: (user: AuthUser) => void;
  /** The username step's server. `undefined`: no step. */
  usernames?: Usernames | undefined;
}

/** The state of the sign-in choices. One try at a time. */
export function useSignInChoices({
  auth,
  appleSheet,
  analytics,
  onSignedIn,
  usernames,
}: SignInChoicesOptions): SignInChoicesState {
  const [appleAvailable, setAppleAvailable] = useState(false);
  const [step, setStep] = useState<SignInChoicesState['step']>(null);
  const [busy, setBusy] = useState<SignInMethod | null>(null);
  const [failed, setFailed] = useState<SignInFailure | null>(null);
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
    setFailed(null);
    const signIn = method === 'apple' ? signInWithApple(auth, appleSheet) : signInForOnline(auth);
    signIn.then(
      (user) => {
        trying.current = false;
        if (user !== null) {
          quietly(() => analytics.track('online_sign_in', { method }));
          if (user.isGuest) reminders.start();
          else reminders.stop();
        }
        if (!mounted.current) return;
        if (user === null) {
          setBusy(null);
          return;
        }
        if (user.isGuest || usernames === undefined) {
          setBusy(null);
          onSignedIn(user);
          return;
        }
        // Busy again while the server says whether a username is needed,
        // so a second tap cannot start another sign-in. Each answer below
        // clears it before the `mounted` check.
        trying.current = true;
        usernames.mine().then(
          (mine) => {
            trying.current = false;
            if (!mounted.current) return;
            setBusy(null);
            if (needsUsernameStep(mine)) setStep({ user, mine });
            else onSignedIn(user);
          },
          () => {
            trying.current = false;
            if (!mounted.current) return;
            setBusy(null);
            onSignedIn(user);
          },
        );
      },
      (error: unknown) => {
        trying.current = false;
        if (!mounted.current) return;
        setBusy(null);
        setFailed(isAppleSheetUnfinished(error) ? 'appleUnfinished' : 'other');
      },
    );
  };

  const finishStep = () => {
    if (step === null) return;
    setStep(null);
    onSignedIn(step.user);
  };

  return { appleAvailable, busy, failed, choose, step, finishStep };
}

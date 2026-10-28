/**
 * The online account of this phone (#281).
 *
 * Online play needs an account on our server. The app makes a guest
 * account (a random user id, no name, no email) only when the user opens
 * online play: when they make an invite, or show an invite a friend sent.
 * A link to a game makes no account by itself (`connection.ts`).
 *
 * The guest is made once: a saved session (the sign-in cookie in the
 * phone's secure store) is used again, and `signInAsGuest` itself makes no
 * new account while a user is signed in.
 *
 * Never send the user id to analytics.
 */
import type { AuthProvider, AuthUser } from '@tavli/contracts';
import { useCallback, useEffect, useRef, useState } from 'react';

import { forgetOnlineAccount, rememberOnlineAccount } from './accountHint';

/**
 * The user of the saved session, or a new guest when there is none. Notes
 * on the phone that it has an account (`accountHint.ts`), so Home lists
 * its online games.
 */
export async function signInForOnline(auth: AuthProvider): Promise<AuthUser> {
  const user = (await auth.ready()) ?? (await auth.signInAsGuest());
  rememberOnlineAccount();
  return user;
}

/**
 * Signs the user out. Never call `auth.signOut()` by itself: first this
 * takes the phone's push token off the server (#285), while the session
 * still lets it call the server. Else the signed-out user would still get
 * turn pushes on this phone. `pushes` is `undefined` when the build has
 * no turn notifications. A failed removal does not stop the sign-out.
 * The sign-out runs inside the turn notifications queue
 * (`unregister(then)`), so no token sync can run between the removal and
 * the sign-out. After it, the phone forgets its account note
 * (`accountHint.ts`, #297), so Home loads no session at the next start.
 */
export async function signOutOfOnline(
  auth: AuthProvider,
  pushes: { readonly unregister: (then?: () => Promise<void>) => Promise<void> } | undefined,
): Promise<void> {
  if (pushes === undefined) await auth.signOut();
  else await pushes.unregister(() => auth.signOut());
  forgetOnlineAccount();
}

export type OnlineAccount =
  /** Loading the saved session. */
  | { readonly status: 'loading' }
  /** Nobody is signed in: `signIn` makes the guest. */
  | { readonly status: 'signedOut' }
  /** Making the guest account. */
  | { readonly status: 'signingIn' }
  /** Signed in as `me` (the user id). */
  | { readonly status: 'signedIn'; readonly me: string }
  /** The saved session did not load, or the account was not made. `signIn` tries again. */
  | { readonly status: 'failed' };

/**
 * The account of this phone, from the saved session. It makes no account
 * by itself: `signIn` makes the guest (once), when the user asks for online
 * play.
 */
export function useOnlineAccount(auth: AuthProvider): {
  readonly account: OnlineAccount;
  readonly signIn: () => void;
} {
  const [account, setAccount] = useState<OnlineAccount>({ status: 'loading' });
  // False once the screen is gone (sign-in answers later).
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    let live = true;
    auth.ready().then(
      (user) => {
        if (user !== null) rememberOnlineAccount();
        if (live) setAccount(user === null ? { status: 'signedOut' } : signedIn(user));
      },
      () => {
        if (live) setAccount({ status: 'failed' });
      },
    );
    return () => {
      live = false;
    };
  }, [auth]);

  const busy = account.status === 'signingIn';
  const signIn = useCallback(() => {
    if (busy) return;
    setAccount({ status: 'signingIn' });
    signInForOnline(auth).then(
      (user) => {
        if (mounted.current) setAccount(signedIn(user));
      },
      () => {
        if (mounted.current) setAccount({ status: 'failed' });
      },
    );
  }, [auth, busy]);

  return { account, signIn };
}

function signedIn(user: AuthUser): OnlineAccount {
  return { status: 'signedIn', me: user.id };
}

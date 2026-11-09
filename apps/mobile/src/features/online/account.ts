/**
 * The online account of this phone (#281).
 *
 * Online play needs an account on our server. The app signs in only when
 * the user opens online play and picks a way in the sign-in choices
 * (#401, `SignInChoices`): Sign in with Apple (`signIn.ts`) or a guest
 * account (a random user id, no name, no email). That happens when they
 * make an invite, or show an invite a friend sent. A link to a game makes
 * no account by itself (`connection.ts`).
 *
 * The guest is made once: a saved session (the sign-in cookie in the
 * phone's secure store) is used again, and `signInAsGuest` itself makes no
 * new account while a user is signed in.
 *
 * Never send the user id to analytics.
 */
import type { AuthProvider, AuthUser } from '@tavli/contracts';
import { useCallback, useEffect, useState } from 'react';

import { checkAppUpdate } from '@/features/update/updateCheck';

import { forgetOnlineAccount, rememberOnlineAccount } from './accountHint';

/**
 * The user of the saved session, or a new guest when there is none. Notes
 * on the phone that it has an account (`accountHint.ts`), so Home lists
 * its online games.
 */
export async function signInForOnline(auth: AuthProvider): Promise<AuthUser> {
  const user = (await auth.ready()) ?? (await auth.signInAsGuest());
  onlineAccountReady();
  return user;
}

/**
 * Call after any sign-in, and when a saved session is used for online
 * play: notes on the phone that it has an account (`accountHint.ts`), and
 * asks the server whether this build is too old (#390).
 */
export function onlineAccountReady(): void {
  rememberOnlineAccount();
  void checkAppUpdate();
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
 *
 * `before` runs after the token removal and just before the sign-out, in
 * the same queue: Delete my online data (#315, `deleteData.ts`) deletes
 * the data there. When it rejects, the user stays signed in, the phone
 * keeps its note, and this rejects too.
 */
export async function signOutOfOnline(
  auth: AuthProvider,
  pushes: SignOutPushes | undefined,
  before?: () => Promise<void>,
): Promise<void> {
  const signOut = async () => {
    await before?.();
    await auth.signOut();
  };
  if (pushes === undefined) await signOut();
  else await pushes.unregister(signOut);
  forgetOnlineAccount();
}

/** What `signOutOfOnline` needs of the turn notifications (`TurnPushes`). */
export interface SignOutPushes {
  readonly unregister: (then?: () => Promise<void>) => Promise<void>;
}

export type OnlineAccount =
  /** Loading the saved session. */
  | { readonly status: 'loading' }
  /** Nobody is signed in: the screen shows the sign-in choices. */
  | { readonly status: 'signedOut' }
  /** Signed in as `me` (the user id). */
  | { readonly status: 'signedIn'; readonly me: string }
  /** The saved session did not load. The sign-in choices try again. */
  | { readonly status: 'failed' };

/**
 * The account of this phone, from the saved session. It makes no account
 * by itself: the screen shows the sign-in choices (`SignInChoices`), and
 * passes their user to `signedIn`.
 */
export function useOnlineAccount(auth: AuthProvider): {
  readonly account: OnlineAccount;
  readonly signedIn: (user: AuthUser) => void;
} {
  const [account, setAccount] = useState<OnlineAccount>({ status: 'loading' });

  useEffect(() => {
    let live = true;
    auth.ready().then(
      (user) => {
        if (user !== null) onlineAccountReady();
        if (live) setAccount(user === null ? { status: 'signedOut' } : signedInAs(user));
      },
      () => {
        if (live) setAccount({ status: 'failed' });
      },
    );
    return () => {
      live = false;
    };
  }, [auth]);

  const signedIn = useCallback((user: AuthUser) => setAccount(signedInAs(user)), []);

  return { account, signedIn };
}

function signedInAs(user: AuthUser): OnlineAccount {
  return { status: 'signedIn', me: user.id };
}

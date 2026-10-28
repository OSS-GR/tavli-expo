/**
 * The waiting screen of an invite this phone made (#281): the code, the
 * link, Share and Cancel. When the friend accepts, the online game
 * replaces it (`game/<gameId>`), so Back from the board goes Home. A
 * build with no online server goes Home.
 *
 * It reads the saved session first (`useOnlineAccount`) and makes no
 * account. With nobody signed in the invite cannot be this phone's: the
 * screen shows "not found" and never opens the game server.
 */
import { normalizeInviteCode, type AuthProvider, type Invites } from '@tavli/contracts';
import { Redirect, router, useLocalSearchParams } from 'expo-router';

import { InviteWaitScreen } from '@/features/invites/InviteWaitScreen';
import { FRIEND_HREF, gameHref, parseIdParam } from '@/features/match/routes';
import { useOnlineAccount } from '@/features/online/account';
import { auth, invites } from '@/services';

/** Pops to Home, or opens it when this was the first screen. */
function goHome() {
  router.dismissTo('/');
}

export default function InviteWaitRoute() {
  const params = useLocalSearchParams<{ code?: string }>();
  const text = parseIdParam(params.code) ?? '';
  if (auth === undefined || invites === undefined) return <Redirect href="/" />;
  // Text that is not a code: the watch shows "not found".
  const code = normalizeInviteCode(text) ?? text;
  // A new code is a new screen, with its own state.
  return <SignedInWait key={code} code={code} auth={auth} invites={invites} />;
}

function SignedInWait({
  code,
  auth,
  invites,
}: {
  code: string;
  auth: AuthProvider;
  invites: Invites;
}) {
  const { account } = useOnlineAccount(auth);
  const me =
    account.status === 'loading' ? undefined : account.status === 'signedIn' ? account.me : null;
  return (
    <InviteWaitScreen
      code={code}
      me={me}
      invites={invites}
      onGame={(gameId) => router.replace(gameHref(gameId))}
      onNewInvite={() => router.replace(FRIEND_HREF)}
      onHome={goHome}
    />
  );
}

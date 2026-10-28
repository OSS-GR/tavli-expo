/**
 * The waiting screen of an invite this phone made (#281): the code, the
 * link, Share and Cancel. When the friend accepts, the online game
 * replaces it (`game/<gameId>`), so Back from the board goes Home. A
 * build with no online server goes Home.
 */
import { normalizeInviteCode } from '@tavli/contracts';
import { Redirect, router, useLocalSearchParams } from 'expo-router';

import { InviteWaitScreen } from '@/features/invites/InviteWaitScreen';
import { FRIEND_HREF, gameHref, parseIdParam } from '@/features/match/routes';
import { invites } from '@/services';

/** Pops to Home, or opens it when this was the first screen. */
function goHome() {
  router.dismissTo('/');
}

export default function InviteWaitRoute() {
  const params = useLocalSearchParams<{ code?: string }>();
  const text = parseIdParam(params.code) ?? '';
  if (invites === undefined) return <Redirect href="/" />;
  // Text that is not a code: the watch shows "not found".
  const code = normalizeInviteCode(text) ?? text;
  return (
    <InviteWaitScreen
      // A new code is a new screen, with its own state.
      key={code}
      code={code}
      invites={invites}
      onGame={(gameId) => router.replace(gameHref(gameId))}
      onNewInvite={() => router.replace(FRIEND_HREF)}
      onHome={goHome}
    />
  );
}

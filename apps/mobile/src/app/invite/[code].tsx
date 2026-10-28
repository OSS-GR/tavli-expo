/**
 * An invite link (#256): `tavlaki://invite/<code>` opens here. The route is
 * in the guarded group of `_layout.tsx`, so on first launch the welcome
 * flow comes first, and the layout opens the invite after it.
 *
 * Accept replaces this screen with the online game (`game/<gameId>`), so
 * Back does not return to an answered invite. Decline and Home go Home.
 */
import { router, useLocalSearchParams } from 'expo-router';

import { InviteScreen } from '@/features/invites/InviteScreen';
import { gameHref, parseIdParam } from '@/features/match/routes';
import { checkDevInvite } from '@/features/online/devGame';
import { invitesFor, onlinePlayerId } from '@/services';

/** Pops to Home, or opens it when the invite was the first screen. */
function goHome() {
  router.dismissTo('/');
}

export default function InviteRoute() {
  const params = useLocalSearchParams<{ code?: string }>();
  const code = parseIdParam(params.code) ?? '';
  return (
    <InviteScreen
      // A new code is a new screen, with its own state.
      key={code}
      code={code}
      invites={invitesFor(onlinePlayerId)}
      me={onlinePlayerId}
      onAccepted={(gameId) => {
        // A dev invite from the bot (dev builds only) starts its bot now.
        if (__DEV__) checkDevInvite();
        router.replace(gameHref(gameId));
      }}
      onDeclined={goHome}
      onHome={goHome}
    />
  );
}

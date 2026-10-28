/**
 * An invite link (#256, #281): `tavlaki://invite/<code>` opens here. The
 * route is in the guarded group of `_layout.tsx`, so on first launch the
 * welcome flow comes first, and the layout opens the invite after it.
 *
 * - A dev invite of this app run (`isDevInvite`, `/dev/online`) lives on
 *   the in-memory server: the phone answers it as `onlinePlayerId`. Its
 *   accept listener (`devGame.ts`) marks the new game a dev game.
 * - Any other code is an invite on the Convex server (`invites`). The
 *   server shows it only to a signed-in user, so `InviteAccountGate`
 *   first uses the saved session, or asks before it makes the free guest
 *   account.
 * - Text that is not a code shows "not found" with no call.
 *
 * Accept replaces this screen with the online game (`game/<gameId>`), so
 * Back does not return to an answered invite. Decline and Home go Home.
 * Accepting an async invite on the server offers turn notifications
 * (#285); a dev invite never does.
 */
import { normalizeInviteCode, type InviteView } from '@tavli/contracts';
import { router, useLocalSearchParams } from 'expo-router';

import { inviteAccepted } from '@/features/invites/acceptedInvite';
import { InviteAccountGate } from '@/features/invites/InviteAccountGate';
import { InviteScreen } from '@/features/invites/InviteScreen';
import { gameHref, parseIdParam } from '@/features/match/routes';
import { turnPushes } from '@/features/notifications/appTurnPushes';
import { isDevInvite } from '@/features/online/devGameIds';
import { auth, invites, invitesFor, onlinePlayerId } from '@/services';

/** Pops to Home, or opens it when the invite was the first screen. */
function goHome() {
  router.dismissTo('/');
}

function accepted(gameId: string) {
  // Listeners such as the dev invite's bot start now.
  inviteAccepted(gameId);
  router.replace(gameHref(gameId));
}

/** An invite on the server: an async game also offers turn notifications (#285). */
function acceptedOnServer(gameId: string, invite: InviteView | null) {
  accepted(gameId);
  if (invite?.pace === 'async') void turnPushes()?.offer();
}

export default function InviteRoute() {
  const params = useLocalSearchParams<{ code?: string }>();
  const code = parseIdParam(params.code) ?? '';
  const normalized = normalizeInviteCode(code);
  const answers = { onAccepted: accepted, onDeclined: goHome, onHome: goHome };

  if (normalized !== null && isDevInvite(normalized)) {
    return (
      <InviteScreen
        // A new code is a new screen, with its own state.
        key={code}
        code={code}
        invites={invitesFor(onlinePlayerId)}
        me={onlinePlayerId}
        {...answers}
      />
    );
  }
  if (normalized === null && invites !== undefined) {
    // Not a code: "not found", with no call and no account.
    return <InviteScreen key={code} code={code} invites={invites} me="" {...answers} />;
  }
  return (
    <InviteAccountGate key={code} auth={invites === undefined ? undefined : auth} onHome={goHome}>
      {(me) =>
        invites === undefined ? null : (
          <InviteScreen
            code={code}
            invites={invites}
            me={me}
            {...answers}
            onAccepted={acceptedOnServer}
          />
        )
      }
    </InviteAccountGate>
  );
}

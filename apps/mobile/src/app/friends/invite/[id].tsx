/**
 * Invite a friend to a game (#406): the Play a friend setup, for one
 * friend. The friend gets a push; the waiting screen of the new invite
 * (`friend/<code>`) replaces this one. A build with no online server goes
 * Home.
 */
import { Redirect, router, useLocalSearchParams } from 'expo-router';

import { FriendSetupScreen } from '@/features/invites/FriendSetupScreen';
import { FRIENDS_HREF, inviteWaitHref, parseIdParam } from '@/features/match/routes';
import { turnPushes } from '@/features/notifications/appTurnPushes';
import { auth, friends, invites } from '@/services';

export default function FriendInviteRoute() {
  const params = useLocalSearchParams<{ id?: string }>();
  const playerId = parseIdParam(params.id);
  if (auth === undefined || invites === undefined || friends === undefined) {
    return <Redirect href="/" />;
  }
  if (playerId === null) return <Redirect href={FRIENDS_HREF} />;
  const service = friends;
  return (
    <FriendSetupScreen
      auth={auth}
      invites={invites}
      friend={{ invite: (game) => service.inviteFriend(playerId, game) }}
      onCreated={(code) => {
        router.replace(inviteWaitHref(code));
        // Every online game can last a while: offer turn notifications (#285).
        void turnPushes()?.offer();
      }}
      onBack={() => (router.canGoBack() ? router.back() : router.replace(FRIENDS_HREF))}
    />
  );
}

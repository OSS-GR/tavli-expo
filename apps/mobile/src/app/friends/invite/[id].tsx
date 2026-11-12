/**
 * Invite a friend to a game (#406): the Play a friend setup, for one
 * friend. The friend gets a push and needs no link, so no waiting screen
 * opens (#507): the route goes back to Friends, which says "Invite sent".
 * A build with no online server goes Home.
 */
import { Redirect, router, useLocalSearchParams } from 'expo-router';

import { useVisit } from '@/features/friends/useVisit';
import { FriendSetupScreen } from '@/features/invites/FriendSetupScreen';
import { noteInviteSent } from '@/features/friends/inviteSent';
import { FRIENDS_HREF, parseIdParam } from '@/features/match/routes';
import { turnPushes } from '@/features/notifications/appTurnPushes';
import { auth, friends, invites } from '@/services';

export default function FriendInviteRoute() {
  const params = useLocalSearchParams<{ id?: string }>();
  const playerId = parseIdParam(params.id);
  // Counts the times the screen shows: back from Account, it checks again.
  const visit = useVisit();
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
      visit={visit}
      onAccount={() => router.push('/account')}
      onCreated={(code) => {
        noteInviteSent({ playerId, code });
        if (router.canGoBack()) router.back();
        else router.replace(FRIENDS_HREF);
        // Every online game can last a while: offer turn notifications (#285).
        void turnPushes()?.offer();
      }}
      onBack={() => (router.canGoBack() ? router.back() : router.replace(FRIENDS_HREF))}
    />
  );
}

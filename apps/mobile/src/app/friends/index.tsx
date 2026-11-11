/**
 * Friends (#406), from Settings → Online. A build with no online server
 * goes back to Settings.
 */
import { Redirect, router } from 'expo-router';

import { FriendsScreen } from '@/features/friends/FriendsScreen';
import { useVisit } from '@/features/friends/useVisit';
import {
  ADD_FRIEND_HREF,
  RATINGS_HREF,
  friendInviteHref,
  inviteHref,
  inviteWaitHref,
} from '@/features/match/routes';
import { turnPushes } from '@/features/notifications/appTurnPushes';
import { auth, friends, safety } from '@/services';

export default function FriendsRoute() {
  // Counts the times the screen shows, so it loads again on the way back.
  const visit = useVisit();
  if (auth === undefined || friends === undefined) return <Redirect href="/settings" />;
  return (
    <FriendsScreen
      auth={auth}
      visit={visit}
      friends={friends}
      {...(safety === undefined ? {} : { safety })}
      onBack={() => (router.canGoBack() ? router.back() : router.replace('/settings'))}
      onAdd={() => router.push(ADD_FRIEND_HREF)}
      onRatings={() => router.push(RATINGS_HREF)}
      onInvite={(playerId) => router.push(friendInviteHref(playerId))}
      onInvited={(code) => {
        // Back from the waiting screen comes here (#488).
        router.push(inviteWaitHref(code));
        // Every online game can last a while: offer turn notifications (#285).
        void turnPushes()?.offer();
      }}
      onOpenInvite={(code) => router.push(inviteHref(code))}
      onAccount={() => router.push('/account')}
    />
  );
}

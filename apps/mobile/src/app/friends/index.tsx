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
  friendPageHref,
  inviteHref,
} from '@/features/match/routes';
import { turnPushes } from '@/features/notifications/appTurnPushes';
import { auth, friends, ratings, safety, usernames } from '@/services';

export default function FriendsRoute() {
  // Counts the times the screen shows, so it loads again on the way back.
  const visit = useVisit();
  if (auth === undefined || friends === undefined || usernames === undefined)
    return <Redirect href="/settings" />;
  return (
    <FriendsScreen
      auth={auth}
      usernames={usernames}
      visit={visit}
      friends={friends}
      {...(safety === undefined ? {} : { safety })}
      {...(ratings === undefined ? {} : { ratings })}
      onBack={() => (router.canGoBack() ? router.back() : router.replace('/settings'))}
      onAdd={() => router.push(ADD_FRIEND_HREF)}
      onRatings={() => router.push(RATINGS_HREF)}
      onInvite={(playerId) => router.push(friendInviteHref(playerId))}
      onInvited={() => {
        // The friend gets a push and needs no link: Friends stays (#507).
        // Every online game can last a while: offer turn notifications (#285).
        void turnPushes()?.offer();
      }}
      onOpenInvite={(code) => router.push(inviteHref(code))}
      onAccount={() => router.push('/account')}
      onOpenFriend={(playerId) => router.push(friendPageHref(playerId))}
    />
  );
}

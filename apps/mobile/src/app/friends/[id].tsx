/**
 * The friend page (#644), from a friend in Friends. A build with no online
 * server goes back to Settings; a bad id goes to Friends.
 */
import { Redirect, router, useLocalSearchParams } from 'expo-router';

import { FriendPageScreen } from '@/features/friends/FriendPageScreen';
import { useVisit } from '@/features/friends/useVisit';
import {
  FRIENDS_HREF,
  friendInviteHref,
  gameHref,
  inviteHref,
  matchEndHref,
  parseIdParam,
} from '@/features/match/routes';
import { turnPushes } from '@/features/notifications/appTurnPushes';
import { auth, friends, games, ratings, safety, usernames } from '@/services';

export default function FriendPageRoute() {
  const params = useLocalSearchParams<{ id?: string }>();
  const playerId = parseIdParam(params.id);
  // Counts the times the screen shows, so it loads again on the way back.
  const visit = useVisit();
  if (auth === undefined || friends === undefined || usernames === undefined)
    return <Redirect href="/settings" />;
  if (playerId === null) return <Redirect href={FRIENDS_HREF} />;
  return (
    <FriendPageScreen
      playerId={playerId}
      visit={visit}
      auth={auth}
      usernames={usernames}
      friends={friends}
      {...(games === undefined ? {} : { games })}
      {...(ratings === undefined ? {} : { ratings })}
      {...(safety === undefined ? {} : { safety })}
      onBack={() => (router.canGoBack() ? router.back() : router.replace(FRIENDS_HREF))}
      onOpenGame={(gameId) => router.push(gameHref(gameId))}
      onOpenFinished={(gameId) => router.push(matchEndHref(gameId, true))}
      onOpenInvite={(code) => router.push(inviteHref(code))}
      onInvite={(id) => router.push(friendInviteHref(id))}
      onInvited={() => {
        // Every online game can last a while: offer turn notifications (#285).
        void turnPushes()?.offer();
      }}
      onHistory={() => router.push('/history')}
      onAccount={() => router.push('/account')}
    />
  );
}

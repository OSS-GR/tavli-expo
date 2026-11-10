/**
 * Friends (#406), from Settings → Online. A build with no online server
 * goes back to Settings.
 */
import { Redirect, router } from 'expo-router';

import { FriendsScreen } from '@/features/friends/FriendsScreen';
import { ADD_FRIEND_HREF, friendInviteHref, inviteHref } from '@/features/match/routes';
import { auth, friends, safety } from '@/services';

export default function FriendsRoute() {
  if (auth === undefined || friends === undefined) return <Redirect href="/settings" />;
  return (
    <FriendsScreen
      auth={auth}
      friends={friends}
      {...(safety === undefined ? {} : { safety })}
      onBack={() => (router.canGoBack() ? router.back() : router.replace('/settings'))}
      onAdd={() => router.push(ADD_FRIEND_HREF)}
      onInvite={(playerId) => router.push(friendInviteHref(playerId))}
      onOpenInvite={(code) => router.push(inviteHref(code))}
      onAccount={() => router.push('/account')}
    />
  );
}

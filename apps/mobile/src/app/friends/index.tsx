/**
 * Friends (#406), from Settings → Online. A build with no online server
 * goes back to Settings.
 */
import { Redirect, router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { FriendsScreen } from '@/features/friends/FriendsScreen';
import { ADD_FRIEND_HREF, friendInviteHref, inviteHref } from '@/features/match/routes';
import { auth, friends, safety } from '@/services';

export default function FriendsRoute() {
  // Counts the times the screen shows, so it loads again on the way back.
  const [visit, setVisit] = useState(0);
  useFocusEffect(useCallback(() => setVisit((n) => n + 1), []));
  if (auth === undefined || friends === undefined) return <Redirect href="/settings" />;
  // The first focus comes right after the first render: wait for it, so
  // the screen loads once.
  if (visit === 0) return null;
  return (
    <FriendsScreen
      auth={auth}
      visit={visit}
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

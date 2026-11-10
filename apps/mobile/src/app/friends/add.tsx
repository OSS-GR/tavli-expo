/**
 * Add a friend (#406): your link and QR code, username search, a pasted
 * link and recent players. A build with no online server goes back to
 * Settings.
 */
import { Redirect, router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { AddFriendScreen } from '@/features/friends/AddFriendScreen';
import { FRIENDS_HREF, friendLinkHref } from '@/features/match/routes';
import { auth, friends } from '@/services';

export default function AddFriendRoute() {
  // Counts the times the screen shows, so it loads again on the way back.
  const [visit, setVisit] = useState(0);
  useFocusEffect(useCallback(() => setVisit((n) => n + 1), []));
  if (auth === undefined || friends === undefined) return <Redirect href="/settings" />;
  // The first focus comes right after the first render: wait for it, so
  // the screen loads once.
  if (visit === 0) return null;
  return (
    <AddFriendScreen
      auth={auth}
      visit={visit}
      friends={friends}
      onBack={() => (router.canGoBack() ? router.back() : router.replace(FRIENDS_HREF))}
      onLink={(token) => router.push(friendLinkHref(token))}
      onAccount={() => router.push('/account')}
    />
  );
}

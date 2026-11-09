/**
 * Settings → Account (#402): sign-in, username, sign out and delete. A
 * build with no online server goes back to Settings.
 */
import { Redirect, router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { AccountScreen } from '@/features/account/AccountScreen';
import { turnPushes } from '@/features/notifications/appTurnPushes';
import { analytics, appleSheet, auth, onlineData, usernames } from '@/services';

export default function AccountRoute() {
  // Counts the times the screen shows, so it loads again after Username.
  const [visit, setVisit] = useState(0);
  useFocusEffect(useCallback(() => setVisit((n) => n + 1), []));
  if (auth === undefined || usernames === undefined || onlineData === undefined) {
    return <Redirect href="/settings" />;
  }
  // The first focus comes right after the first render: wait for it, so
  // the screen loads once.
  if (visit === 0) return null;
  return (
    <AccountScreen
      deps={{ auth, usernames, data: onlineData, appleSheet, analytics, pushes: turnPushes() }}
      visit={visit}
      onBack={() => (router.canGoBack() ? router.back() : router.replace('/settings'))}
      onUsername={() => router.push('/username')}
    />
  );
}

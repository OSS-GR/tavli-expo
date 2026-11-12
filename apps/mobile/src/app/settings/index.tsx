/**
 * Settings (#37), the index of its pages (#501). Each page has its own
 * route next to this file, in the guarded app group of `_layout.tsx`.
 */
import { Stack, router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  FRIENDS_HREF,
  RATINGS_HREF,
  WHATS_NEW_HREF,
  rulesHref,
  tutorialHref,
} from '@/features/match/routes';
import { turnPushes } from '@/features/notifications/appTurnPushes';
import { SettingsScreen } from '@/features/settings/SettingsScreen';
import { auth, friends, onlineData, ratings, safety, usernames } from '@/services';

export default function SettingsRoute() {
  const { t } = useTranslation();
  const pushes = turnPushes();
  // Counts the times the screen shows, so Settings reads the online note
  // and the What's new dot again after a page closes.
  const [visit, setVisit] = useState(0);
  useFocusEffect(useCallback(() => setVisit((n) => n + 1), []));
  return (
    <>
      {/* The title names the screen for the back button of the next one. */}
      <Stack.Screen options={{ title: t('settings.title') }} />
      <SettingsScreen
        onBack={() => (router.canGoBack() ? router.back() : router.replace('/'))}
        onPage={(page) => router.push(`/settings/${page}`)}
        onLearnToPlay={(game) => router.push(tutorialHref('settings', game))}
        onHowToPlay={() => router.push(rulesHref('portes'))}
        onHistory={() => router.push('/history')}
        onWhatsNew={() => router.push(WHATS_NEW_HREF)}
        turnPushes={pushes}
        onAccount={auth && usernames && onlineData ? () => router.push('/account') : undefined}
        account={auth && usernames ? { auth, usernames } : undefined}
        onBlocked={auth && safety ? () => router.push('/blocked') : undefined}
        onFriends={auth && friends ? () => router.push(FRIENDS_HREF) : undefined}
        onRatings={auth && ratings ? () => router.push(RATINGS_HREF) : undefined}
        visit={visit}
      />
    </>
  );
}

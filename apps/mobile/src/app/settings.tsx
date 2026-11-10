import { Stack, router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { FRIENDS_HREF, RATINGS_HREF, tutorialHref } from '@/features/match/routes';
import { turnPushes } from '@/features/notifications/appTurnPushes';
import { SettingsScreen } from '@/features/settings/SettingsScreen';
import { auth, friends, onlineData, ratings, safety, usernames } from '@/services';

export default function SettingsRoute() {
  const { t } = useTranslation();
  const pushes = turnPushes();
  // Counts the times the screen shows, so Settings reads the online note
  // again after Settings → Account.
  const [visit, setVisit] = useState(0);
  useFocusEffect(useCallback(() => setVisit((n) => n + 1), []));
  return (
    <>
      {/* The title names the screen for the back button of the next one. */}
      <Stack.Screen options={{ title: t('settings.title') }} />
      <SettingsScreen
        onBack={() => (router.canGoBack() ? router.back() : router.replace('/'))}
        onLearnToPlay={(game) => router.push(tutorialHref('settings', game))}
        onHistory={() => router.push('/history')}
        turnPushes={pushes}
        onAccount={auth && usernames && onlineData ? () => router.push('/account') : undefined}
        onBlocked={auth && safety ? () => router.push('/blocked') : undefined}
        onFriends={auth && friends ? () => router.push(FRIENDS_HREF) : undefined}
        onRatings={auth && ratings ? () => router.push(RATINGS_HREF) : undefined}
        visit={visit}
      />
    </>
  );
}

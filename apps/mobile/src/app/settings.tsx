import { Stack, router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { tutorialHref } from '@/features/match/routes';
import { turnPushes } from '@/features/notifications/appTurnPushes';
import { SettingsScreen } from '@/features/settings/SettingsScreen';
import { auth, onlineData, safety, usernames } from '@/services';

export default function SettingsRoute() {
  const { t } = useTranslation();
  const pushes = turnPushes();
  return (
    <>
      {/* The title names the screen for the back button of the next one. */}
      <Stack.Screen options={{ title: t('settings.title') }} />
      <SettingsScreen
        onBack={() => (router.canGoBack() ? router.back() : router.replace('/'))}
        onLearnToPlay={(game) => router.push(tutorialHref('settings', game))}
        onHistory={() => router.push('/history')}
        turnPushes={pushes}
        onlineData={auth && onlineData ? { auth, data: onlineData, pushes } : undefined}
        onUsername={auth && usernames ? () => router.push('/username') : undefined}
        onBlocked={auth && safety ? () => router.push('/blocked') : undefined}
      />
    </>
  );
}

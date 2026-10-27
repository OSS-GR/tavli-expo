import { Stack, router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { tutorialHref } from '@/features/match/routes';
import { SettingsScreen } from '@/features/settings/SettingsScreen';

export default function SettingsRoute() {
  const { t } = useTranslation();
  return (
    <>
      <Stack.Screen options={{ title: t('settings.title') }} />
      <SettingsScreen
        onLearnToPlay={(game) => router.push(tutorialHref('settings', game))}
        onHistory={() => router.push('/history')}
      />
    </>
  );
}

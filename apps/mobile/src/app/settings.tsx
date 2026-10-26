import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { SettingsScreen } from '@/features/settings/SettingsScreen';

export default function SettingsRoute() {
  const { t } = useTranslation();
  return (
    <>
      <Stack.Screen options={{ title: t('settings.title') }} />
      <SettingsScreen />
    </>
  );
}

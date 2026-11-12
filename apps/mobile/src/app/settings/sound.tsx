/** Settings → Sound & haptics (#501). */
import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { backToSettings } from '@/features/settings/backToSettings';
import { SoundSettings } from '@/features/settings/SettingsSubPages';

export default function SoundRoute() {
  const { t } = useTranslation();
  return (
    <>
      <Stack.Screen options={{ title: t('settings.soundPage.title') }} />
      <SoundSettings onBack={backToSettings} />
    </>
  );
}

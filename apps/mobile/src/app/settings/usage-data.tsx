/** Settings → Usage data (#501). */
import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { backToSettings } from '@/features/settings/backToSettings';
import { UsageDataSettings } from '@/features/settings/SettingsSubPages';

export default function UsageDataRoute() {
  const { t } = useTranslation();
  return (
    <>
      <Stack.Screen options={{ title: t('settings.usageDataPage.title') }} />
      <UsageDataSettings onBack={backToSettings} />
    </>
  );
}

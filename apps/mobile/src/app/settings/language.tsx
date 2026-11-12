/** Settings → Language (#501). */
import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { backToSettings } from '@/features/settings/backToSettings';
import { LanguageSettings } from '@/features/settings/SettingsSubPages';

export default function LanguageRoute() {
  const { t } = useTranslation();
  return (
    <>
      <Stack.Screen options={{ title: t('settings.sections.language') }} />
      <LanguageSettings onBack={backToSettings} />
    </>
  );
}

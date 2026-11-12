/** Settings → Move list (#501). */
import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { backToSettings } from '@/features/settings/backToSettings';
import { MoveListSettings } from '@/features/settings/SettingsSubPages';

export default function MoveListRoute() {
  const { t } = useTranslation();
  return (
    <>
      <Stack.Screen options={{ title: t('settings.moveList.label') }} />
      <MoveListSettings onBack={backToSettings} />
    </>
  );
}

/** Settings → Board & look (#501). */
import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { backToSettings } from '@/features/settings/backToSettings';
import { BoardLookSettings } from '@/features/settings/BoardLookSettings';

export default function BoardLookRoute() {
  const { t } = useTranslation();
  return (
    <>
      <Stack.Screen options={{ title: t('settings.boardLook.title') }} />
      <BoardLookSettings onBack={backToSettings} />
    </>
  );
}

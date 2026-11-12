/** Settings → Gameplay (#501). */
import { Stack, router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { backToSettings } from '@/features/settings/backToSettings';
import { GameplaySettings } from '@/features/settings/GameplaySettings';

export default function GameplayRoute() {
  const { t } = useTranslation();
  return (
    <>
      <Stack.Screen options={{ title: t('settings.gameplay.title') }} />
      <GameplaySettings
        onBack={backToSettings}
        onMoveList={() => router.push('/settings/move-list')}
      />
    </>
  );
}

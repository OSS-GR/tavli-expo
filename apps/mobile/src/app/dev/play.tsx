/**
 * Dev only (temporary): a pass-and-play Portes match to 3 on one phone, so
 * the owner can try the board screen end to end. Not linked from the app.
 * Release builds go home. The real route is `app/game/[id]` (wireframes).
 */
import { Redirect, Stack } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { createGameAnalytics } from '@/features/analytics/gameAnalytics';
import { createGameStore } from '@/features/game/gameStore';
import { GameScreen } from '@/features/game/GameScreen';
import { createLocalRng } from '@/services';

export default function DevPlayRoute() {
  const { t } = useTranslation();
  const [store] = useState(() =>
    createGameStore({
      players: { white: t('game.players.white'), black: t('game.players.black') },
      targetPoints: 3,
      rng: createLocalRng(),
      analytics: createGameAnalytics({ mode: 'local' }),
    }),
  );

  if (!__DEV__) return <Redirect href="/" />;

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: t('dev.play.title') }} />
      <GameScreen store={store} openingTaps="perPlayer" />
    </>
  );
}

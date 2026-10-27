import { router } from 'expo-router';

import { HomeScreen } from '@/features/home/HomeScreen';
import { newGameHref, rulesHref } from '@/features/match/routes';
import { botLevels } from '@/services';

export default function HomeRoute() {
  return (
    <HomeScreen
      botLevels={botLevels}
      onNewGame={(mode) => router.push(newGameHref(mode))}
      onSettings={() => router.push('/settings')}
      onHowToPlay={() => router.push(rulesHref('portes'))}
    />
  );
}

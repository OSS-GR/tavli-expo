import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { matchSessions } from '@/features/match/appSessions';
import { loadLastSetup, saveLastSetup } from '@/features/match/lastSetup';
import { gameHref, parseModeParam } from '@/features/match/routes';
import { NewGameScreen } from '@/features/new-game/NewGameScreen';
import { botLevels, storage } from '@/services';

export default function NewGameRoute() {
  const params = useLocalSearchParams<{ mode?: string }>();
  const mode = parseModeParam(params.mode);
  const [initial] = useState(() => loadLastSetup(storage, mode, botLevels));

  return (
    <NewGameScreen
      key={mode}
      mode={mode}
      initial={initial}
      botLevels={botLevels}
      onBack={() => (router.canGoBack() ? router.back() : router.replace('/'))}
      onStart={(setup) => {
        saveLastSetup(storage, setup);
        const session = matchSessions.start(setup);
        // Replace: "back" from the board goes Home, not to this form.
        router.replace(gameHref(session.id));
      }}
    />
  );
}

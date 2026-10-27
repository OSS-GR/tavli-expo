import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { matchSessions } from '@/features/match/appSessions';
import { loadLastSetup, saveLastSetup } from '@/features/match/lastSetup';
import { gameHref, parseFirstGameParam, parseModeParam, rulesHref } from '@/features/match/routes';
import { firstGameSetup } from '@/features/match/setup';
import { NewGameScreen } from '@/features/new-game/NewGameScreen';
import { botLevels, storage } from '@/services';

export default function NewGameRoute() {
  const params = useLocalSearchParams<{ mode?: string; first?: string }>();
  const mode = parseModeParam(params.mode);
  // After the tutorial: Portes vs the Easy bot (#128). Else the last choices.
  const firstGame = mode === 'bot' && parseFirstGameParam(params.first);
  const [initial] = useState(() => {
    const last = loadLastSetup(storage, mode, botLevels);
    return firstGame ? firstGameSetup(last, botLevels) : last;
  });
  const [hasSavedGame] = useState(() => matchSessions.peek().kind === 'ok');

  return (
    <NewGameScreen
      key={mode}
      mode={mode}
      initial={initial}
      botLevels={botLevels}
      hasSavedGame={hasSavedGame}
      onRules={(game) => router.push(rulesHref(game))}
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

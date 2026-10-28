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
  // After the tutorial: its game (Portes, #128; Plakoto or Fevga, #149;
  // Asodio, #159) vs the Easy bot. Else the last choices.
  const firstGame = mode === 'bot' ? parseFirstGameParam(params.first) : null;
  const [initial] = useState(() => {
    const last = loadLastSetup(storage, mode, botLevels);
    return firstGame === null ? last : firstGameSetup(last, botLevels, firstGame);
  });
  const [hasSavedGame] = useState(() => matchSessions.peek().kind === 'ok');

  return (
    <NewGameScreen
      key={mode}
      mode={mode}
      initial={initial}
      botLevels={botLevels}
      hasSavedGame={hasSavedGame}
      onRules={(game, preset) => router.push(rulesHref(game, preset))}
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

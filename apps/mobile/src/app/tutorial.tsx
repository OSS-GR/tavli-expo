/**
 * The tutorial: `/tutorial?from=home|rules|settings&game=portes|plakoto|fevga|asodio`.
 * `game` picks the lesson set (#149, #159); the default is Portes, the
 * first-run tutorial (#128). Saves "done" or "dismissed" for that set and
 * sends the tutorial events.
 */
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';

import { firstGameHref, parseTutorialGame, parseTutorialSource } from '@/features/match/routes';
import { tutorialStore } from '@/features/tutorial/store';
import { createTutorialAnalytics } from '@/features/tutorial/tutorialAnalytics';
import { TutorialScreen } from '@/features/tutorial/TutorialScreen';

/** Back where the tutorial was opened from, or Home after a deep link. */
function leave() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

export default function TutorialRoute() {
  const params = useLocalSearchParams<{ from?: string; game?: string }>();
  const [source] = useState(() => parseTutorialSource(params.from));
  const [game] = useState(() => parseTutorialGame(params.game));
  const [events] = useState(() => createTutorialAnalytics(undefined, game));

  // Once per visit, also if the effect runs twice (React dev mode).
  const sent = useRef(false);
  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    events.started(source);
  }, [events, source]);

  return (
    <TutorialScreen
      game={game}
      onLessonDone={events.step}
      onFinished={() => {
        tutorialStore.getState().finish(game);
        events.finished();
      }}
      onSkip={(step, lesson) => {
        tutorialStore.getState().dismiss(game);
        events.skipped(step, lesson);
        leave();
      }}
      // Replace: "back" from New game goes where the tutorial came from.
      onPlay={() => router.replace(firstGameHref(game))}
      onHome={() => router.dismissTo('/')}
    />
  );
}

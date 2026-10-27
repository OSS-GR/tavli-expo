/**
 * The first-run tutorial (#128): `/tutorial?from=home|rules|settings`.
 * Saves "done" or "dismissed" and sends the tutorial events.
 */
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';

import { firstGameHref, parseTutorialSource } from '@/features/match/routes';
import { tutorialStore } from '@/features/tutorial/store';
import { createTutorialAnalytics } from '@/features/tutorial/tutorialAnalytics';
import { TutorialScreen } from '@/features/tutorial/TutorialScreen';

/** Back where the tutorial was opened from, or Home after a deep link. */
function leave() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

export default function TutorialRoute() {
  const params = useLocalSearchParams<{ from?: string }>();
  const [source] = useState(() => parseTutorialSource(params.from));
  const [events] = useState(() => createTutorialAnalytics());

  // Once per visit, also if the effect runs twice (React dev mode).
  const sent = useRef(false);
  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    events.started(source);
  }, [events, source]);

  return (
    <TutorialScreen
      onLessonDone={events.step}
      onFinished={() => {
        tutorialStore.getState().finish();
        events.finished();
      }}
      onSkip={(step, lesson) => {
        tutorialStore.getState().dismiss();
        events.skipped(step, lesson);
        leave();
      }}
      // Replace: "back" from New game goes where the tutorial came from.
      onPlay={() => router.replace(firstGameHref())}
      onHome={() => router.dismissTo('/')}
    />
  );
}

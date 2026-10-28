/**
 * The game review (#215): the biggest mistakes of the game that just
 * ended. The game-end sheet and the match-end screen open it with
 * `router.push`, so Back returns to them. The game comes from the match in
 * memory (its log): the review saves nothing. After an app restart a
 * finished match is gone: "This game could not be opened." with Home. A
 * game that is not over yet redirects to the board.
 */
import { Redirect, Stack, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { matchSessions } from '@/features/match/appSessions';
import { MissingGame } from '@/features/match/MissingGame';
import { gameHref, parseIdParam } from '@/features/match/routes';
import { sendReviewOpened } from '@/features/review/reviewAnalytics';
import { ReviewScreen } from '@/features/review/ReviewScreen';

/** Back to Home: pops to it, or opens it when this was the first screen. */
function goHome() {
  router.dismissTo('/');
}

export default function ReviewRoute() {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ id?: string }>();
  const id = parseIdParam(params.id);
  // Read once: the review is of the game that just ended, even if the
  // match moves on under this screen.
  const [opened] = useState(() => {
    const session = id === null ? null : matchSessions.get(id);
    return session === null
      ? null
      : { id: session.id, setup: session.setup, flow: session.store.getState().flow };
  });
  // The game ended, or the match did (Resign match ends it mid-game).
  const over =
    opened !== null &&
    (opened.flow.game.phase === 'game-over' || opened.flow.match.status === 'finished');
  const game = opened?.setup.game ?? null;

  useEffect(() => {
    if (over && game !== null) sendReviewOpened(game);
  }, [over, game]);

  if (opened === null) return <MissingGame onHome={goHome} />;
  if (!over) return <Redirect href={gameHref(opened.id)} />;
  return (
    <>
      <Stack.Screen options={{ title: t('review.title') }} />
      <ReviewScreen setup={opened.setup} flow={opened.flow} />
    </>
  );
}

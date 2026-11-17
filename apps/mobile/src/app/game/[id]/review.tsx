/**
 * The game review (#215): the biggest mistakes of the game that just
 * ended. The game-end sheet and the match-end screen open it with
 * `router.push`, so Back returns to them. The review saves nothing.
 *
 * - A local match comes from memory (its log). After an app restart a
 *   finished match is gone: "This game could not be opened." with Home. A
 *   game that is not over yet redirects to the board.
 * - An online game (#604) names the game of the match (`game`, from 1):
 *   `OnlineConnect` picks the server like the board route, and
 *   `OnlineReview` loads that game's record from it. No `game`: "This game
 *   could not be opened."
 */
import { Redirect, Stack, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { matchSessions } from '@/features/match/appSessions';
import { MissingGame } from '@/features/match/MissingGame';
import { gameHref, isLocalGameId, parseGameNumber, parseIdParam } from '@/features/match/routes';
import { OnlineConnect } from '@/features/online/OnlineConnect';
import { OnlineReview } from '@/features/review/OnlineReview';
import { sendReviewOpened } from '@/features/review/reviewAnalytics';
import { ReviewScreen } from '@/features/review/ReviewScreen';

/** Back to Home: pops to it, or opens it when this was the first screen. */
function goHome() {
  router.dismissTo('/');
}

/** Back to the screen that opened the review, else Home. */
function goBack() {
  if (router.canGoBack()) router.back();
  else goHome();
}

export default function ReviewRoute() {
  const params = useLocalSearchParams<{ id?: string; game?: string }>();
  const id = parseIdParam(params.id);
  if (id !== null && !isLocalGameId(id)) {
    return <OnlineReviewRoute id={id} gameNumber={parseGameNumber(params.game)} />;
  }
  return <LocalReview id={id} />;
}

function OnlineReviewRoute({ id, gameNumber }: { id: string; gameNumber: number | null }) {
  const { t } = useTranslation();
  if (gameNumber === null) return <MissingGame onHome={goHome} />;
  return (
    <>
      {/* The screen draws its own header (#362). */}
      <Stack.Screen options={{ title: t('review.title'), headerShown: false }} />
      <OnlineConnect gameId={id} onHome={goHome}>
        {({ transport }) => (
          <OnlineReview gameId={id} gameNumber={gameNumber} transport={transport} onBack={goBack} />
        )}
      </OnlineConnect>
    </>
  );
}

function LocalReview({ id }: { id: string | null }) {
  const { t } = useTranslation();
  // Read once: the review is of the game that just ended, even if the
  // match moves on under this screen.
  const [opened] = useState(() => {
    const session = id === null ? null : matchSessions.get(id);
    return session === null
      ? null
      : {
          id: session.id,
          setup: session.setup,
          flow: session.store.getState().flow,
          // The turns a fast forward played for you are not yours to review.
          autoEvents: session.store.getState().autoEvents,
        };
  });
  // The game ended, or the match did (Resign match ends it mid-game).
  const over =
    opened !== null &&
    (opened.flow.game.phase === 'game-over' || opened.flow.match.status === 'finished');
  const game = opened?.setup.game ?? null;

  useEffect(() => {
    if (over && game !== null) sendReviewOpened(game, false);
  }, [over, game]);

  if (opened === null) return <MissingGame onHome={goHome} />;
  if (!over) return <Redirect href={gameHref(opened.id)} />;
  return (
    <>
      {/* The screen draws its own header (#362). */}
      <Stack.Screen options={{ title: t('review.title'), headerShown: false }} />
      <ReviewScreen
        setup={opened.setup}
        flow={opened.flow}
        autoEvents={opened.autoEvents}
        onBack={goBack}
      />
    </>
  );
}

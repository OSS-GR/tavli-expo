/**
 * The app tour (#573): `/tour?from=home|rules|settings`. Home opens it
 * once after the welcome flow of a new install (`from=home`); How to play
 * and Settings → Help open it again. Skip, Not now and the last page all
 * mark it done, so Home never opens it again. No analytics.
 */
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { parseTourSource, tutorialHref } from '@/features/match/routes';
import { tourPages, type TourOffers } from '@/features/tour/pages';
import { TourScreen } from '@/features/tour/TourScreen';
import { tourStore } from '@/features/tour/tourStore';
import { friends, invites, matchmaking, ratings } from '@/services';

const OFFERS: TourOffers = {
  friend: invites !== undefined,
  ranked: matchmaking !== undefined,
  friends: friends !== undefined,
  ratings: ratings !== undefined,
};

/** Back where the tour was opened from, or Home after a deep link. */
function leave() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

export default function TourRoute() {
  const params = useLocalSearchParams<{ from?: string }>();
  const [source] = useState(() => parseTourSource(params.from));
  const [pages] = useState(() => tourPages(OFFERS));
  const done = () => tourStore.getState().finish();
  return (
    <TourScreen
      pages={pages}
      offers={OFFERS}
      firstRun={source === 'home'}
      onSkip={() => {
        done();
        leave();
      }}
      onLesson={() => {
        done();
        // Replace: Back from the lesson goes where the tour came from.
        router.replace(tutorialHref(source));
      }}
      onFinish={() => {
        done();
        leave();
      }}
    />
  );
}

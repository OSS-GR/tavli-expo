/**
 * The Play ranked events (#532): `ranked_search_started` and
 * `ranked_search_ended`. Only the game, how a search ended and the wait in
 * whole seconds: never a rating, a name or an id. They go through the
 * `Analytics` port (nothing before the user allows usage data) and through
 * `quietly()`: an analytics error never breaks the screen.
 *
 * Event plan: `docs/architecture/analytics-events.md`.
 */
import type { Analytics, RankedGame, RankedSearchEnd } from '@tavli/contracts';

import { quietly } from '@/features/analytics/quietly';

export function sendRankedSearchStarted(analytics: Analytics, game: RankedGame): void {
  quietly(() => analytics.track('ranked_search_started', { game }));
}

export function sendRankedSearchEnded(
  analytics: Analytics,
  game: RankedGame,
  how: RankedSearchEnd,
  waitMs: number,
): void {
  quietly(() =>
    analytics.track('ranked_search_ended', {
      game,
      how,
      waitSec: Math.max(0, Math.round(waitMs / 1000)),
    }),
  );
}

/**
 * The `review_opened` event (#215): which game was picked for the match,
 * never the position, the dice, the moves or the mistakes. It goes through
 * the `Analytics` port, which drops every call until the user allows usage
 * data, and through `quietly()`: an analytics error never breaks the screen.
 *
 * Event plan: `docs/architecture/analytics-events.md`.
 */
import type { Analytics, MatchGame } from '@tavli/contracts';

import { quietly } from '@/features/game/gameStore';
import { analytics as appAnalytics } from '@/services';

export function sendReviewOpened(game: MatchGame, analytics: Analytics = appAnalytics): void {
  quietly(() => analytics.track('review_opened', { game }));
}

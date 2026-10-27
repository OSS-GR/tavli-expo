/**
 * The `hint_shown` event (#209): which game a hint was for, never the
 * position, the dice or the moves. It goes through the `Analytics` port,
 * which drops every call until the user allows usage data, and through
 * `quietly()`: an analytics error never breaks the game.
 *
 * Event plan: `docs/architecture/analytics-events.md`.
 */
import type { Analytics, MatchGame } from '@tavli/contracts';

import { quietly } from '@/features/game/gameStore';
import { analytics as appAnalytics } from '@/services';

export function sendHintShown(
  game: MatchGame,
  variant: string,
  analytics: Analytics = appAnalytics,
): void {
  quietly(() => analytics.track('hint_shown', { game, variant }));
}

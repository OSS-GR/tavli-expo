/**
 * The `invite_created` event (#281): the game, the match length and the
 * pace of a new invite. Never the code, a game id or a user id. It goes
 * through the `Analytics` port, which drops every call until the user
 * allows usage data, and through `quietly()`: an analytics error never
 * breaks the screen.
 *
 * Event plan: `docs/architecture/analytics-events.md`.
 */
import type { Analytics, NewInvite } from '@tavli/contracts';

import { quietly } from '@/features/analytics/quietly';
import { analytics as appAnalytics } from '@/services';

export function sendInviteCreated(game: NewInvite, analytics: Analytics = appAnalytics): void {
  quietly(() =>
    analytics.track('invite_created', {
      game: game.choice,
      matchLength: game.targetPoints,
      pace: game.pace,
    }),
  );
}

/**
 * The `push_permission_answered` event (#285): the answer to the system
 * prompt for turn notifications, `granted` or `denied`. Never the push
 * token or the user id. It goes through the `Analytics` port, which drops
 * every call until the user allows usage data, and through `quietly()`:
 * an analytics error never breaks the screen.
 *
 * Event plan: `docs/architecture/analytics-events.md`.
 */
import type { Analytics } from '@tavli/contracts';

import { quietly } from '@/features/analytics/quietly';
import { analytics as appAnalytics } from '@/services';

export function sendPushPermissionAnswered(
  answer: 'granted' | 'denied',
  analytics: Analytics = appAnalytics,
): void {
  quietly(() => analytics.track('push_permission_answered', { answer }));
}

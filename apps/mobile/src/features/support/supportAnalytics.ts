/**
 * The Support Tavlaki events (#590): where the Support screen opened from,
 * the Ko-fi link, and the ask card. Never an id, a name or an amount (the
 * app never knows one). They go through the `Analytics` port, which drops
 * every call until the user allows usage data, and through `quietly()`:
 * an analytics error never breaks a screen.
 *
 * Event plan: `docs/architecture/analytics-events.md`.
 */
import type { Analytics, SupportAskAnswer, SupportSource } from '@tavli/contracts';

import { quietly } from '@/features/analytics/quietly';
import { analytics as appAnalytics } from '@/services';

export type { SupportAskAnswer, SupportSource };

export function sendSupportOpened(from: SupportSource, analytics: Analytics = appAnalytics): void {
  quietly(() => analytics.track('support_opened', { from }));
}

export function sendSupportLinkOpened(analytics: Analytics = appAnalytics): void {
  quietly(() => analytics.track('support_link_opened'));
}

export function sendSupportAskShown(analytics: Analytics = appAnalytics): void {
  quietly(() => analytics.track('support_ask_shown'));
}

export function sendSupportAskAnswered(
  answer: SupportAskAnswer,
  analytics: Analytics = appAnalytics,
): void {
  quietly(() => analytics.track('support_ask_answered', { answer }));
}

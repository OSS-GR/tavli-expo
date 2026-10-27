/**
 * Tutorial events for analytics (#128): `tutorial_started`,
 * `tutorial_step`, `tutorial_finished` and `tutorial_skipped`.
 *
 * They go through the `Analytics` port, which drops every call until the
 * user allows usage data. An analytics error never breaks the tutorial: it
 * is logged and dropped.
 *
 * Event plan: `docs/architecture/analytics-events.md`.
 */
import type { Analytics, TutorialSource } from '@tavli/contracts';

import { analytics as appAnalytics } from '@/services';

import type { LessonId } from './lessons';

export interface TutorialAnalytics {
  started: (source: TutorialSource) => void;
  /** Lesson `step` (1 = the first) was learnt. */
  step: (step: number, lesson: LessonId) => void;
  finished: () => void;
  /** Skip was tapped on lesson `step`. */
  skipped: (step: number, lesson: LessonId) => void;
}

function quietly(send: () => void): void {
  try {
    send();
  } catch (error) {
    console.warn('analytics failed', error);
  }
}

export function createTutorialAnalytics(analytics: Analytics = appAnalytics): TutorialAnalytics {
  return {
    started: (source) => quietly(() => analytics.track('tutorial_started', { source })),
    step: (step, lesson) => quietly(() => analytics.track('tutorial_step', { step, lesson })),
    finished: () => quietly(() => analytics.track('tutorial_finished')),
    skipped: (step, lesson) => quietly(() => analytics.track('tutorial_skipped', { step, lesson })),
  };
}

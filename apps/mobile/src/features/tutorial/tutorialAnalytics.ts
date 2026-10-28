/**
 * Tutorial events for analytics (#128): `tutorial_started`,
 * `tutorial_step`, `tutorial_finished` and `tutorial_skipped`. Each one
 * says which lesson set it is about (`game`, #149).
 *
 * They go through the `Analytics` port, which drops every call until the
 * user allows usage data. An analytics error never breaks the tutorial: it
 * is logged and dropped.
 *
 * Event plan: `docs/architecture/analytics-events.md`.
 */
import type { Analytics, TutorialGame, TutorialSource } from '@tavli/contracts';

import { quietly } from '@/features/analytics/quietly';
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

/** The events of one lesson set (`game`, default Portes). */
export function createTutorialAnalytics(
  analytics: Analytics = appAnalytics,
  game: TutorialGame = 'portes',
): TutorialAnalytics {
  return {
    started: (source) => quietly(() => analytics.track('tutorial_started', { source, game })),
    step: (step, lesson) => quietly(() => analytics.track('tutorial_step', { game, step, lesson })),
    finished: () => quietly(() => analytics.track('tutorial_finished', { game })),
    skipped: (step, lesson) =>
      quietly(() => analytics.track('tutorial_skipped', { game, step, lesson })),
  };
}

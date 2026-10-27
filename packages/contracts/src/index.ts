/**
 * Ports (interfaces) and shared types.
 *
 * Each outside service (auth, backend, push, analytics, crash reports) gets an interface
 * here. Vendor code lives in `packages/adapters/*` and implements these
 * interfaces. This package has no runtime dependencies. It uses types from
 * `@tavli/engine` only (`import type`).
 */

/** The Greek tavli games the app supports. */
export const GAME_IDS = ['portes', 'plakoto', 'fevga', 'asodio'] as const;

export type GameId = (typeof GAME_IDS)[number];

export {
  HAPTIC_STYLES,
  createNoopFeedback,
  createRecordingFeedback,
  gatedFeedback,
  type Feedback,
  type HapticStyle,
} from './feedback';
export {
  CRASH_LEVELS,
  createNoopCrashReporter,
  createRecordingCrashReporter,
  type CrashBreadcrumb,
  type CrashContext,
  type CrashData,
  type CrashLevel,
  type CrashReporter,
  type CrashReporterConfig,
  type RecordedCrash,
  type RecordingCrashReporter,
} from './crash-reporter';
export { BOT_DIFFICULTIES, BotCancelledError, isBotCancelled, isDifficulty } from './bot-runner';
export type { BotMoveRequest, BotRunner, Difficulty } from './bot-runner';
export { createMemoryStorage, type Storage } from './storage';
export { isAnonymousInstallId } from './install-id';
export {
  ANALYTICS_EVENTS,
  createConsentGate,
  createNoopAnalytics,
  createRecordingAnalytics,
  type Analytics,
  type AnalyticsEventName,
  type AnalyticsEvents,
  type AnalyticsPropsArg,
  type GameMode,
  type GameResultKind,
  type SentAnalytics,
} from './analytics';

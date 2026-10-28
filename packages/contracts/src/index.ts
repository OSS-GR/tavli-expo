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
  createNoopSoundPlayer,
  createRecordingSoundPlayer,
  gatedSoundPlayer,
  type SoundBank,
  type SoundPlayer,
  type SoundSource,
} from './sound';
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
export type { BotAnswerRequest, BotMoveRequest, BotRunner, Difficulty } from './bot-runner';
export {
  GAME_TRANSPORT_ERROR_CODES,
  MAX_LISTED_GAMES,
  ONLINE_GAME_CHOICES,
  ONLINE_GAME_PACES,
  TURN_TIME_MS,
  isGameTransportErrorData,
  isOnlineGameChoice,
  isOnlineGamePace,
} from './game-transport';
export type {
  GameTransport,
  GameTransportErrorCode,
  GameTransportErrorData,
  GameSummary,
  ListMyGamesRequest,
  OnlineGameChoice,
  OnlineGamePace,
  OnlineGameStatus,
  OnlineGameView,
  SendAnswerRequest,
  SendTurnRequest,
} from './game-transport';
export {
  INVITE_CODE_ALPHABET,
  INVITE_CODE_LENGTH,
  INVITE_ERROR_CODES,
  INVITE_STATUSES,
  INVITE_TIME_MS,
  isInviteErrorData,
  normalizeInviteCode,
} from './invite';
export type { InviteErrorCode, InviteErrorData, InviteStatus, InviteView, Invites } from './invite';
export {
  AUTH_ERROR_CODES,
  MEMORY_AUTH_TOKEN_PREFIX,
  createMemoryAuthProvider,
  createMemoryAuthStore,
  isAuthErrorData,
} from './auth';
export type { AuthErrorCode, AuthErrorData, AuthProvider, AuthUser, MemoryAuthStore } from './auth';
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
  type MatchGame,
  type OpeningRollRule,
  type ThemeKind,
  type TutorialGame,
  type TutorialSource,
  type SentAnalytics,
} from './analytics';

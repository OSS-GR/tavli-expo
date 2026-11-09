/**
 * Ports (interfaces) and shared types.
 *
 * Each outside service (auth, backend, push, notifications, analytics, crash reports) gets an interface
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
  ASYNC_TURN_TIME_MS,
  GAME_TRANSPORT_ERROR_CODES,
  MAX_LISTED_GAMES,
  ONLINE_GAME_CHOICES,
  isGameTransportErrorData,
  isOnlineGameChoice,
  isTurnTimeMinutes,
  turnDeadlineMs,
} from './game-transport';
export type {
  GameTransport,
  GameTransportErrorCode,
  GameTransportErrorData,
  GameSummary,
  ListMyGamesRequest,
  OnlineGameChoice,
  OnlineGameStatus,
  OnlineGameView,
  RollDiceRequest,
  SendAnswerRequest,
  SendTurnRequest,
  SetDraftRequest,
  TurnDraft,
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
export type {
  InviteErrorCode,
  InviteErrorData,
  InviteStatus,
  InviteView,
  Invites,
  NewInvite,
} from './invite';
export {
  AUTH_ERROR_CODES,
  AUTH_KEY_PROVIDERS,
  MEMORY_APPLE_TOKEN_PREFIX,
  MEMORY_AUTH_TOKEN_PREFIX,
  createMemoryAuthProvider,
  createMemoryAuthStore,
  isAuthErrorData,
  memoryAppleIdToken,
} from './auth';
export type {
  AuthErrorCode,
  AuthErrorData,
  AuthKey,
  AuthKeyCredential,
  AuthKeyProvider,
  AuthProvider,
  AuthUser,
  MemoryAuthStore,
} from './auth';
export { guestName, isGuestNumber } from './player-name';
export type { GuestName, PlayerName } from './player-name';
export { createMemoryAppleSheet } from './apple-sheet';
export type { AppleSheet, AppleSheetProof, MemoryAppleSheet } from './apple-sheet';
export type { OnlineData } from './online-data';
export { APP_PLATFORMS, NO_UPDATE_POLICY, createMemoryAppUpdates } from './app-update';
export type { AppPlatform, AppUpdatePolicy, AppUpdates, MemoryAppUpdates } from './app-update';
export { PUSH_ERROR_CODES, createRecordingPushProvider, isPushErrorCode } from './push';
export type {
  PushErrorCode,
  PushMessage,
  PushProvider,
  PushResult,
  RecordingPushProvider,
} from './push';
export {
  PUSH_PERMISSIONS,
  PUSH_PLATFORMS,
  createMemoryPushNotifications,
  createMemoryPushTokens,
  gameIdOfPush,
  isPushPermission,
} from './push-notifications';
export type {
  MemoryPushNotifications,
  MemoryPushTokens,
  PushNotifications,
  PushPermission,
  PushPlatform,
  PushTap,
  PushTokenCall,
  PushTokens,
  SavedPushToken,
} from './push-notifications';
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

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
  ONLINE_MATCH_END_REASONS,
  RANKED_TIMEOUTS_TO_LOSE,
  RANKED_TURN_TIME_MINUTES,
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
  OnlineMatchEndReason,
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
  AppleKeyCredential,
  AuthKeyCredential,
  AuthKeyProvider,
  AuthProvider,
  AuthUser,
  EmailKeyCredential,
  GuestMoveCounts,
  GuestMoveOffer,
  MemoryAuthGuestMoves,
  MemoryAuthStore,
} from './auth';
export { guestName, isGuestNumber, usernameName } from './player-name';
export type { GuestName, PlayerName, UsernameName } from './player-name';
export {
  TERMS_VERSION,
  USERNAME_CHANGE_MS,
  USERNAME_ERROR_CODES,
  USERNAME_MAX_LENGTH,
  USERNAME_MIN_LENGTH,
  isUsernameErrorData,
} from './username';
export type {
  MyUsername,
  SetUsernameRequest,
  UsernameErrorCode,
  UsernameErrorData,
  Usernames,
} from './username';
export {
  FRIENDS_ERROR_CODES,
  FRIEND_REQUEST_WAIT_MS,
  FRIEND_SEARCHES_PER_HOUR,
  FRIEND_SEARCH_WINDOW_MS,
  FRIEND_STATUSES,
  FRIEND_TOKEN_ALPHABET,
  FRIEND_TOKEN_LENGTH,
  MAX_FRIENDS,
  MAX_INCOMING_FRIEND_REQUESTS,
  MAX_OPEN_FRIEND_REQUESTS,
  MAX_RECENT_PLAYERS,
  isFriendsErrorData,
  normalizeFriendToken,
} from './friends';
export type {
  FoundPlayer,
  Friend,
  FriendRecord,
  FriendRequest,
  FriendRequests,
  FriendStatus,
  Friends,
  FriendsErrorCode,
  FriendsErrorData,
  RecentPlayer,
} from './friends';
export {
  MAX_BLOCKS,
  MAX_REPORTS_PER_DAY,
  REPORT_REASONS,
  REPORT_WINDOW_MS,
  SAFETY_ERROR_CODES,
  isReportReason,
  isSafetyErrorData,
} from './safety';
export type {
  BlockedPlayer,
  ReportReason,
  ReportRequest,
  Safety,
  SafetyErrorCode,
  SafetyErrorData,
} from './safety';
export {
  APPLE_SHEET_UNFINISHED,
  appleSheetUnfinished,
  createMemoryAppleSheet,
  isAppleSheetUnfinished,
} from './apple-sheet';
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
export { MAIL_ERROR_CODES, createRecordingMailSender, isMailErrorCode } from './mail';
export type {
  MailErrorCode,
  MailMessage,
  MailResult,
  MailSender,
  RecordingMailSender,
} from './mail';
export {
  EMAIL_CODE_LANGUAGES,
  EMAIL_CODE_LENGTH,
  EMAIL_CODE_TRIES,
  EMAIL_CODE_TTL_MS,
  MAX_EMAIL_LENGTH,
  isEmailCode,
  isEmailCodeLanguage,
  normalizeEmail,
} from './email-code';
export type { EmailCodeLanguage } from './email-code';
export {
  PUSH_PERMISSIONS,
  PUSH_PLATFORMS,
  createMemoryPushNotifications,
  createMemoryPushTokens,
  gameIdOfPush,
  inviteCodeOfPush,
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
export {
  GLOBAL_BOARD_ROWS,
  MIN_BOARD_MATCHES,
  RATED_MATCHES_PER_PAIR_PER_DAY,
  RATINGS_ERROR_CODES,
  START_RATING,
  isRatingsErrorData,
  withRanks,
} from './ratings';
export type { BoardRow, MyRating, Ratings, RatingsErrorCode, RatingsErrorData } from './ratings';
export {
  MATCHED_SEEK_KEEP_MS,
  MATCHMAKING_ERROR_CODES,
  NOBODY_YET_MS,
  RANKED_GAMES,
  RANKED_TARGET_POINTS,
  SEEK_RANGE_GROW_MS,
  SEEK_RANGE_MAX,
  SEEK_RANGE_START,
  SEEK_TTL_MS,
  isMatchmakingErrorData,
  isRankedGame,
  seekRange,
} from './matchmaking';
export type {
  LookingCounts,
  Matchmaking,
  MatchmakingErrorCode,
  MatchmakingErrorData,
  MySeek,
  RankedGame,
  SeekPlayer,
  SeekRequest,
} from './matchmaking';

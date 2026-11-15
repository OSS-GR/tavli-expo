/**
 * Test helpers for adapters. Import them from `@tavli/contracts/testing`,
 * in test files only. The crash reporter contract uses Vitest; the
 * analytics, auth provider, friends, game transport, invites, matchmaking, online data, mail
 * sender, push provider, push notifications, push tokens, ratings and usernames checks are plain
 * functions, so any test runner can use them.
 */
export {
  analyticsContract,
  type AnalyticsContractCheck,
  type AnalyticsContractOptions,
  type AnalyticsContractSubject,
} from './testing/analytics-contract';
export {
  authProviderContract,
  type AuthProviderContractCheck,
  type AuthProviderContractSubject,
} from './testing/auth-provider-contract';
export { runCrashReporterContract } from './testing/crash-reporter-contract';
export {
  friendsContract,
  type FriendsContractCheck,
  type FriendsContractPlayer,
  type FriendsContractSubject,
} from './testing/friends-contract';
export {
  matchmakingContract,
  type MatchmakingContractCheck,
  type MatchmakingContractPlayer,
  type MatchmakingContractSubject,
} from './testing/matchmaking-contract';
export {
  ratingsContract,
  type RatingsContractCheck,
  type RatingsContractPlayer,
  type RatingsContractSubject,
} from './testing/ratings-contract';
export {
  gameTransportContract,
  type GameTransportContractCheck,
  type GameTransportContractGame,
  type GameTransportContractSubject,
} from './testing/game-transport-contract';
export {
  invitesContract,
  type InvitesContractCheck,
  type InvitesContractGame,
  type InvitesContractPlayer,
  type InvitesContractSubject,
} from './testing/invites-contract';
export {
  onlineDataContract,
  type OnlineDataContractCheck,
  type OnlineDataContractPlayer,
  type OnlineDataContractSubject,
} from './testing/online-data-contract';
export {
  pushProviderContract,
  type PushProviderContractCheck,
  type PushProviderContractSubject,
} from './testing/push-provider-contract';
export {
  mailSenderContract,
  type MailSenderContractCheck,
  type MailSenderContractSubject,
} from './testing/mail-sender-contract';
export {
  pushNotificationsContract,
  pushTokensContract,
  type PushNotificationsContractCheck,
  type PushNotificationsContractSubject,
  type PushTokensContractCheck,
  type PushTokensContractSubject,
} from './testing/push-notifications-contract';
export {
  safetyContract,
  type SafetyContractCheck,
  type SafetyContractPlayer,
  type SafetyContractSubject,
} from './testing/safety-contract';
export {
  usernamesContract,
  type UsernamesContractCheck,
  type UsernamesContractPlayer,
  type UsernamesContractSubject,
} from './testing/usernames-contract';

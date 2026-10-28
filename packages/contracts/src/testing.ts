/**
 * Test helpers for adapters. Import them from `@tavli/contracts/testing`,
 * in test files only. The crash reporter contract uses Vitest; the
 * analytics, auth provider, game transport, invites, push provider,
 * push notifications and push tokens checks are plain
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
  pushProviderContract,
  type PushProviderContractCheck,
  type PushProviderContractSubject,
} from './testing/push-provider-contract';
export {
  pushNotificationsContract,
  pushTokensContract,
  type PushNotificationsContractCheck,
  type PushNotificationsContractSubject,
  type PushTokensContractCheck,
  type PushTokensContractSubject,
} from './testing/push-notifications-contract';

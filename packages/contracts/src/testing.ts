/**
 * Test helpers for adapters. Import them from `@tavli/contracts/testing`,
 * in test files only. The crash reporter contract uses Vitest; the
 * analytics, auth provider, game transport and invites checks are plain
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

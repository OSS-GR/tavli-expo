/**
 * Test helpers for adapters. Import them from `@tavli/contracts/testing`,
 * in test files only. The crash reporter contract uses Vitest; the
 * analytics checks are plain functions, so any test runner can use them.
 */
export {
  analyticsContract,
  type AnalyticsContractCheck,
  type AnalyticsContractOptions,
  type AnalyticsContractSubject,
} from './testing/analytics-contract';
export { runCrashReporterContract } from './testing/crash-reporter-contract';

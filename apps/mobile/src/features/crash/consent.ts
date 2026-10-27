/**
 * What crash reports may do, from the one privacy switch (#61,
 * `features/privacy/consent.ts`).
 *
 * - Before an answer (`unset`): send, but anonymously (no install id).
 *   The Sentry adapter then runs JS only: no native crash reports and no
 *   sessions, because the native SDKs add their own id (#139).
 * - "Allow" (`granted`): send, with the anonymous install id.
 * - "Don't allow" (`denied`), also to an older consent text
 *   (`stale-denied`, until the new answer): send nothing.
 */
import { usageDataAllowed, type ConsentStatus } from '@/features/privacy/consent';

/** May the app send crash reports? */
export function crashReportingAllowed(status: ConsentStatus): boolean {
  return status !== 'denied' && status !== 'stale-denied';
}

/** May crash reports carry the install id? Only after "Allow". */
export function crashUserAllowed(status: ConsentStatus): boolean {
  return usageDataAllowed(status);
}

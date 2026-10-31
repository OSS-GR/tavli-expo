/**
 * The time left on an online turn as text (#255). Pure.
 *
 * Timed games count seconds ("42 s"). Games with no time limit (the 24-hour
 * default) count hours ("23 h"), and minutes in the last hour ("40 min").
 */
import { ASYNC_TURN_TIME_MS } from '@tavli/contracts';
import type { TFunction } from 'i18next';

/** The milliseconds of a turn for `turnTimeMinutes` (null gives 24h). */
export function turnTimeMs(turnTimeMinutes: number | null): number {
  return turnTimeMinutes === null ? ASYNC_TURN_TIME_MS : turnTimeMinutes * 60_000;
}

/** Short label for a turn time limit: "24 h", "1 min", "5 min". */
export function formatTimeLimit(turnTimeMinutes: number | null, t: TFunction): string {
  if (turnTimeMinutes === null) return t('online.timeLimitNone');
  return t('online.timeLimit', { count: turnTimeMinutes });
}

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;

export function clockText(ms: number, turnTimeMinutes: number | null, t: TFunction): string {
  const left = Math.max(0, ms);
  if (turnTimeMinutes !== null) {
    // A time limit counts down in seconds.
    return t('online.clock.seconds', { count: Math.ceil(left / SECOND) });
  }
  // No time limit: 24-hour async, hours then minutes.
  if (left >= HOUR) return t('online.clock.hours', { count: Math.floor(left / HOUR) });
  return t('online.clock.minutes', { count: Math.ceil(left / MINUTE) });
}

/** How often the screen updates the clock: each second when timed, each half minute otherwise. */
export function clockTickMs(turnTimeMinutes: number | null): number {
  return turnTimeMinutes === null ? 30 * SECOND : SECOND;
}

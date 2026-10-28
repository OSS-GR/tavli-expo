/**
 * The time left on an online turn as text (#255). Pure.
 *
 * Live games count seconds ("42 s"). Async games count hours ("23 h"),
 * and minutes in the last hour ("40 min").
 */
import type { OnlineGamePace } from '@tavli/contracts';
import type { TFunction } from 'i18next';

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;

export function clockText(ms: number, pace: OnlineGamePace, t: TFunction): string {
  const left = Math.max(0, ms);
  if (pace === 'live') return t('online.clock.seconds', { count: Math.ceil(left / SECOND) });
  if (left >= HOUR) return t('online.clock.hours', { count: Math.floor(left / HOUR) });
  return t('online.clock.minutes', { count: Math.ceil(left / MINUTE) });
}

/** How often the screen updates the clock: each second live, each half minute async. */
export function clockTickMs(pace: OnlineGamePace): number {
  return pace === 'live' ? SECOND : 30 * SECOND;
}

/**
 * The time left on an online turn as text (#255). Pure.
 *
 * Timed games show a clock ("4:54", "0:28"; never "300 s", #499). Games
 * with no time limit (the 24-hour default) count hours ("23 h"), and
 * minutes in the last hour ("40 min").
 *
 * A timed turn also shows a ring around the avatar of the player to move
 * (#530): `turnShareLeft` empties it, and the last 10 seconds
 * (`lastSeconds`) turn it the problem color.
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
    // A time limit counts down as minutes and seconds: "4:54".
    const seconds = Math.ceil(left / SECOND);
    const rest = seconds % 60;
    return `${Math.floor(seconds / 60)}:${rest < 10 ? `0${rest}` : rest}`;
  }
  // No time limit: 24-hour async, hours then minutes.
  if (left >= HOUR) return t('online.clock.hours', { count: Math.floor(left / HOUR) });
  return t('online.clock.minutes', { count: Math.ceil(left / MINUTE) });
}

/** Under this time left the clock line turns the problem color (#499): async turns. */
export const URGENT_CLOCK_MS = 30 * SECOND;

/** The time left is short: under 30 s. */
export function clockUrgent(ms: number): boolean {
  return ms < URGENT_CLOCK_MS;
}

/** How often the screen updates the clock: each second when timed, each half minute otherwise. */
export function clockTickMs(turnTimeMinutes: number | null): number {
  return turnTimeMinutes === null ? 30 * SECOND : SECOND;
}

/**
 * The last seconds of a timed turn (#530): the ring and the time turn the
 * problem color, and your phone ticks once a second.
 */
export const LAST_SECONDS = 10;

/**
 * The whole seconds left in the last 10 seconds of a timed turn (10 down
 * to 1), as the clock shows them ("0:08"). `null` before that, at 0 and
 * for a turn with no time limit.
 */
export function lastSeconds(ms: number, turnTimeMinutes: number | null): number | null {
  if (turnTimeMinutes === null) return null;
  const seconds = Math.ceil(ms / SECOND);
  return seconds >= 1 && seconds <= LAST_SECONDS ? seconds : null;
}

/** The share of the turn left, from 1 (a new turn) to 0, for the turn ring (#530). */
export function turnShareLeft(ms: number, turnTimeMinutes: number | null): number {
  return Math.min(1, Math.max(0, ms / turnTimeMs(turnTimeMinutes)));
}

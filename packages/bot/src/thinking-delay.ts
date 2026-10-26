/**
 * Human-like think time (docs/architecture/bot-ai.md, section 4.3).
 *
 * This is for the app. The bot itself never sleeps. The app waits
 * `thinkingDelayMs(...)` before it shows the bot's move, and runs the bot
 * during the wait, so the user never sees the real cost.
 */

import type { Rng } from '@tavli/engine';

import { randomIntBetween } from './random';
import type { Difficulty } from './types';

export interface DelayRange {
  /** Milliseconds, included. */
  readonly min: number;
  /** Milliseconds, included. */
  readonly max: number;
}

/**
 * Think time per level. Stronger bots "think" a little longer, like a
 * careful player:
 *
 * | Level  | Range        |
 * | ------ | ------------ |
 * | easy   | 500–1000 ms  |
 * | medium | 600–1200 ms  |
 * | hard   | 700–1500 ms  |
 */
export const THINKING_DELAY_MS: Readonly<Record<Difficulty, DelayRange>> = {
  easy: { min: 500, max: 1000 },
  medium: { min: 600, max: 1200 },
  hard: { min: 700, max: 1500 },
};

/** Think time for a forced move (only one legal turn, or a pass), at every level. */
export const FORCED_DELAY_MS: DelayRange = { min: 250, max: 400 };

/**
 * A random think time in whole milliseconds, uniform in the level's range.
 * Pass `forced: true` when the bot has only one legal turn. Use a UI RNG
 * here, not the dice RNG.
 */
export function thinkingDelayMs(
  difficulty: Difficulty,
  rng: Rng,
  options: { readonly forced?: boolean } = {},
): number {
  const range = options.forced === true ? FORCED_DELAY_MS : THINKING_DELAY_MS[difficulty];
  return randomIntBetween(rng, range.min, range.max);
}

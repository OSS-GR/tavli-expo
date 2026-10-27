/**
 * Bot speed (#172): the setting and the timings of the bot's turn.
 *
 * A leaf module: no imports at run time, so Settings and the bot turn can
 * both use it. The numbers are plain literals. `botTurn.test.ts` checks
 * them against the board's animation times (`ROLL_MS`, `FLIGHT_MS`, …).
 */
import type { Difficulty } from '@tavli/contracts';
import type { Rng } from '@tavli/engine';

/** How fast the bot plays its turn. Saved in Settings. */
export type BotSpeed = 'slow' | 'normal' | 'fast';

export const BOT_SPEEDS: readonly BotSpeed[] = ['slow', 'normal', 'fast'];

export interface BotTiming {
  /** Pause before the bot rolls, so the turn change is easy to see. */
  readonly beforeRollMs: number;
  /**
   * The least time from the bot's own roll to its first move. The dice
   * land (the last die of a double: `DICE_LAND_MS`) and stay on screen for
   * a moment before a checker moves. Only after a roll the bot just made.
   */
  readonly afterRollMs: number;
  /**
   * Time from one move to the next. It is longer than a checker flight
   * (`FLIGHT_MS`, and `HIT_DELAY_MS` more for a hit), so each move lands
   * before the next one starts.
   */
  readonly moveMs: number;
  /** Extra pause after a hit (a checker goes to the bar), before the next move. */
  readonly hitMs: number;
  /**
   * Time from the last move to the confirm: the checker lands (`FLIGHT_MS`)
   * and a short beat. After a hit, `HIT_DELAY_MS` more, so the hit checker
   * lands too.
   */
  readonly landMs: number;
  /** Think time before the first move. Default: `thinkingDelayMs` from the bot package. */
  readonly thinkMs?: (difficulty: Difficulty, rng: Rng, forced: boolean) => number;
}

/**
 * The timings of each Bot speed. Normal is the default. Before #172 the
 * bot rolled after 0.5 s and moved every 0.4 s: too fast to follow.
 * `afterRollMs` is the dice landing (920 ms) plus 1000, 600 or 250 ms.
 * `landMs` is the flight (200 ms) plus 400, 250 or 150 ms.
 */
export const BOT_SPEED_TIMING: Readonly<Record<BotSpeed, BotTiming>> = {
  slow: { beforeRollMs: 1300, afterRollMs: 1920, moveMs: 1300, hitMs: 700, landMs: 600 },
  normal: { beforeRollMs: 900, afterRollMs: 1520, moveMs: 900, hitMs: 500, landMs: 450 },
  fast: { beforeRollMs: 600, afterRollMs: 1170, moveMs: 550, hitMs: 300, landMs: 350 },
};

/** The default timing: Normal speed. */
export const BOT_TIMING: BotTiming = BOT_SPEED_TIMING.normal;

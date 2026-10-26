/**
 * Bot players for tavli.
 *
 * This package is pure TypeScript. It depends only on `@tavli/engine`.
 */

/** The bot levels we plan to ship. */
export const BOT_LEVELS = ['easy', 'medium', 'hard'] as const;

export type BotLevel = (typeof BOT_LEVELS)[number];

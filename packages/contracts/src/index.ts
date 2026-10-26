/**
 * Ports (interfaces) and shared types.
 *
 * Each outside service (auth, backend, push, analytics) gets an interface
 * here. Vendor code lives in `packages/adapters/*` and implements these
 * interfaces. This package has no runtime dependencies. It uses types from
 * `@tavli/engine` only (`import type`).
 */

/** The Greek tavli games the app supports. */
export const GAME_IDS = ['portes', 'plakoto', 'fevga', 'asodio'] as const;

export type GameId = (typeof GAME_IDS)[number];

export { BOT_DIFFICULTIES, BotCancelledError, isBotCancelled, isDifficulty } from './bot-runner';
export type { BotMoveRequest, BotRunner, Difficulty } from './bot-runner';
export { createMemoryStorage, type Storage } from './storage';

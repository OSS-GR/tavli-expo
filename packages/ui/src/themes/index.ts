import { kafeneioNight } from './kafeneio-night';
import { oliveInlay } from './olive-inlay';
import type { AppTheme } from './types';
import { walnutKafeneio } from './walnut-kafeneio';

export type * from './types';
export { kafeneioNight, oliveInlay, walnutKafeneio };

/**
 * All themes, keyed by id. To add a theme:
 * 1. Add a file next to `walnut-kafeneio.ts` that `satisfies AppTheme`.
 * 2. Add it here.
 * The app registers this map with Unistyles, and settings list its ids.
 *
 * Each theme is made for the board theme (`@tavli/themes`) with the same id
 * (#528), so "Match the board" can pick it by id.
 */
export const themes = {
  'walnut-kafeneio': walnutKafeneio,
  'olive-inlay': oliveInlay,
  'kafeneio-night': kafeneioNight,
} as const satisfies Record<string, AppTheme>;

export type ThemeId = keyof typeof themes;

export const THEME_IDS = Object.keys(themes) as ThemeId[];

/** The theme to use when nothing else picks one. */
export const DEFAULT_THEME_ID: ThemeId = 'walnut-kafeneio';

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(themes, value);
}

/**
 * The app colors choice (#528): "Match the board", or one theme that stays
 * with any board.
 */
export const MATCH_BOARD = 'match-board';

export type ThemeChoice = ThemeId | typeof MATCH_BOARD;

export const THEME_CHOICES: readonly ThemeChoice[] = [MATCH_BOARD, ...THEME_IDS];

export function isThemeChoice(value: unknown): value is ThemeChoice {
  return value === MATCH_BOARD || isThemeId(value);
}

/** The app colors made for a board theme. A board with no colors of its own gets the default. */
export function themeForBoard(boardThemeId: string): ThemeId {
  return isThemeId(boardThemeId) ? boardThemeId : DEFAULT_THEME_ID;
}

/** The theme the app shows for a choice and a board. */
export function resolveThemeId(choice: ThemeChoice, boardThemeId: string): ThemeId {
  return choice === MATCH_BOARD ? themeForBoard(boardThemeId) : choice;
}

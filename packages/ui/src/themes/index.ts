import type { AppTheme } from './types';
import { walnutKafeneio } from './walnut-kafeneio';

export type * from './types';
export { walnutKafeneio };

/**
 * All themes, keyed by id. To add a theme:
 * 1. Add a file next to `walnut-kafeneio.ts` that `satisfies AppTheme`.
 * 2. Add it here.
 * The app registers this map with Unistyles, and settings list its ids.
 */
export const themes = {
  'walnut-kafeneio': walnutKafeneio,
} as const satisfies Record<string, AppTheme>;

export type ThemeId = keyof typeof themes;

export const THEME_IDS = Object.keys(themes) as ThemeId[];

export const DEFAULT_THEME_ID: ThemeId = 'walnut-kafeneio';

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(themes, value);
}

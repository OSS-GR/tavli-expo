/**
 * The theme registry: every bundled theme, by id.
 *
 * To add a theme, import its `theme.json` here and add it to `BUNDLED`.
 */

import oliveInlay from '../olive-inlay/theme.json';
import walnutKafeneio from '../walnut-kafeneio/theme.json';
import { resolvePalette } from './color';
import type { BoardLayout, LayoutId, ThemeManifest } from './types';
import { assertTheme } from './validate';

const BUNDLED: Readonly<Record<string, unknown>> = {
  'walnut-kafeneio': walnutKafeneio,
  'olive-inlay': oliveInlay,
};

/** The theme a new install uses. */
export const DEFAULT_THEME_ID = 'walnut-kafeneio';

const cache = new Map<string, ThemeManifest>();

/** Ids of all bundled themes. */
export function listThemeIds(): string[] {
  return Object.keys(BUNDLED);
}

/** True when a bundled theme has this id. */
export function hasTheme(id: string): boolean {
  return Object.prototype.hasOwnProperty.call(BUNDLED, id);
}

/**
 * Returns a bundled theme, validated, with every `{palette.token}` replaced
 * by its color. Throws if the id is unknown or the manifest is not valid.
 */
export function getTheme(id: string): ThemeManifest {
  const hit = cache.get(id);
  if (hit) return hit;
  if (!hasTheme(id)) {
    throw new Error(`Unknown theme "${id}". Known themes: ${listThemeIds().join(', ')}`);
  }
  const theme = resolvePalette(assertTheme(BUNDLED[id]));
  if (theme.id !== id) throw new Error(`Theme "${id}" has id "${theme.id}" in its manifest`);
  cache.set(id, theme);
  return theme;
}

/** One layout of a theme. Without an id, the theme's default layout. */
export function getLayout(theme: ThemeManifest, id: LayoutId = theme.defaultLayout): BoardLayout {
  return theme.layouts[id];
}

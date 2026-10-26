/**
 * Board themes (skins).
 *
 * A theme is a folder with a `theme.json` manifest and WebP images.
 * The board renderer reads only the manifest (ADR-0005). This package is
 * pure TypeScript plus assets: no React, no network, no vendor code.
 */

export * from './types';
export { imageFileName, imageFileNames, pickScale } from './assets';
export { contrastRatio, isHexColor, relativeLuminance, resolvePalette, tokenRef } from './color';
export {
  diceCenters,
  getPoint,
  pointTriangle,
  rectInsideUnit,
  rectsOverlap,
  slotDepth,
  stackCenters,
  trayRects,
  type StackPlacement,
} from './geometry';
export { DEFAULT_THEME_ID, getLayout, getTheme, hasTheme, listThemeIds } from './registry';
export {
  assertTheme,
  HAPTIC_KEYS,
  HAPTIC_STYLES,
  LAYOUT_IDS,
  REQUIRED_TOKENS,
  SOUND_KEYS,
  ThemeValidationError,
  validateTheme,
  type ValidationResult,
} from './validate';

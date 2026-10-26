/**
 * Board themes (skins).
 *
 * A theme is a folder with a `theme.json` manifest, WebP images and AAC
 * (`.m4a`) sounds. The board renderer reads only the manifest (ADR-0005).
 * This package is pure TypeScript plus assets: no React, no network, no
 * vendor code.
 */

export * from './types';
export { allSoundFiles, imageFileName, imageFileNames, pickScale, soundFiles } from './assets';
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
  FEEDBACK_EVENTS,
  HAPTIC_KEYS,
  HAPTIC_STYLES,
  LAYOUT_IDS,
  MAX_SOUND_TAKES,
  REQUIRED_TOKENS,
  SOUND_FILE_PATTERN,
  SOUND_KEYS,
  ThemeValidationError,
  validateTheme,
  type ValidationResult,
} from './validate';

/**
 * Shared design system: tokens, themes and small helpers.
 *
 * Themes are plain data. The app registers them with Unistyles
 * (`apps/mobile/src/theme/unistyles.ts`).
 *
 * Dependencies flow one way: app -> ui -> contracts.
 * This package must not import from `apps/mobile`.
 */

export { contrastRatio, luminance } from './contrast';
export { displayCaps } from './text';
export * from './themes';
export { radii, spacing, touch, typography } from './tokens';

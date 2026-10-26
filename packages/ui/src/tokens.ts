/**
 * Design tokens that every theme shares: spacing, radii, type and touch sizes.
 * These are plain data. The app registers them with Unistyles.
 */

/** Spacing scale in points. */
export const spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

/** Corner radii in points. */
export const radii = {
  sm: 6,
  md: 10,
  lg: 14,
  xl: 20,
  pill: 999,
} as const;

/**
 * Text styles. Sizes are the base for font scale 1.
 * Greek text runs about 30% longer, so styles never fix a width.
 */
export const typography = {
  display: { fontSize: 40, lineHeight: 48, fontWeight: '700' },
  title: { fontSize: 20, lineHeight: 26, fontWeight: '700' },
  body: { fontSize: 17, lineHeight: 23, fontWeight: '400' },
  bodyStrong: { fontSize: 17, lineHeight: 23, fontWeight: '600' },
  caption: { fontSize: 14, lineHeight: 19, fontWeight: '400' },
  section: { fontSize: 13, lineHeight: 18, fontWeight: '600', letterSpacing: 0.6 },
} as const;

/** Touch sizes in points (Apple HIG and Material both ask for at least 44). */
export const touch = {
  /** Smallest tap target. */
  minTarget: 44,
  /** Height of a settings or list row. */
  row: 56,
  /** Height of a main button. */
  button: 52,
} as const;

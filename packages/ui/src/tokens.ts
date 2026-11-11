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
  /** A tray of rows or tiles (#493). */
  tray: 16,
  /** The top corners of a sheet (#493). */
  sheet: 28,
  pill: 999,
} as const;

/**
 * Font families the app embeds (expo-font config plugin in `app.json`).
 * Piazzolla (SIL OFL, full Greek) is for titles and numbers only; every
 * control and line of body text stays in the system font. The name is the
 * font's PostScript name, which iOS and Android both find. A Piazzolla
 * style sets no `fontWeight`: each weight is its own family.
 */
export const fonts = {
  titles: 'Piazzolla-SemiBold',
  numerals: 'Piazzolla-Bold',
} as const;

/**
 * Text styles, named as in Figma (Critique & Direction → Type, #493).
 * Sizes are the base for font scale 1; every size follows the phone's text
 * size, so no box may fix a height. Greek text runs about 30% longer, so
 * styles never fix a width.
 */
export const typography = {
  /** The biggest title: the Home greeting. */
  display: { fontFamily: fonts.titles, fontSize: 34, lineHeight: 40, letterSpacing: -0.3 },
  /** A screen title. */
  title1: { fontFamily: fonts.titles, fontSize: 28, lineHeight: 34 },
  /** A card, sheet or dialog title. */
  title2: { fontFamily: fonts.titles, fontSize: 22, lineHeight: 28 },
  /** A small title inside a card. */
  title3: { fontFamily: fonts.titles, fontSize: 19, lineHeight: 24 },
  /** A strong line in the system font, such as a row title. */
  headline: { fontSize: 17, lineHeight: 22, fontWeight: '600' },
  body: { fontSize: 17, lineHeight: 24, fontWeight: '400' },
  bodyStrong: { fontSize: 17, lineHeight: 24, fontWeight: '600' },
  callout: { fontSize: 15, lineHeight: 20, fontWeight: '400' },
  footnote: { fontSize: 13, lineHeight: 18, fontWeight: '400' },
  /** A number that matters: a score, a rating, a code. Same-width digits. */
  numeral: {
    fontFamily: fonts.numerals,
    fontSize: 40,
    lineHeight: 48,
    fontVariant: ['tabular-nums'],
  },
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

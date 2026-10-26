import type { radii, spacing, touch, typography } from '../tokens';

/** Colors for menus, lists, buttons and text. */
export interface UiColors {
  /** Main screen background. */
  background: string;
  /** Darker edge of the background (for gradients and sheets). */
  backgroundDeep: string;
  /** Cards, list groups and secondary buttons. */
  surface: string;
  /** A selected segment or option. */
  surfaceSelected: string;
  /** Outlines of cards, segments and secondary buttons. */
  border: string;
  /** Thin lines between rows. */
  separator: string;
  /** Main text. */
  text: string;
  /** Secondary text, helper text and section titles. */
  textDim: string;
  /** Text on a disabled control. */
  textDisabled: string;
  /** Main button, selected outline and "on" switch track (brass). */
  accent: string;
  /** Text and icons on `accent`. */
  onAccent: string;
  /** Turn ring around the active player. */
  turn: string;
  /** Turn text, for example "Σειρά σου". */
  turnText: string;
  /** Switch track when off. */
  switchTrackOff: string;
  /** Switch thumb. */
  switchThumb: string;
}

/** Colors the board drawing code (Skia) reads. */
export interface BoardColors {
  frame: string;
  field: string;
  pointDark: string;
  pointLight: string;
  brass: string;
  brassLight: string;
  brassDark: string;
  wear: string;
}

export interface CheckerColors {
  light: string;
  lightEdge: string;
  dark: string;
  darkRing: string;
}

export interface HighlightColors {
  /** Selected checker ring and legal target ring. */
  select: string;
  /** Dark halo under every highlight. */
  halo: string;
}

export interface DiceColors {
  face: string;
  side: string;
  edge: string;
  pip: string;
  /** The ace (1) pip. Red on many Greek sets. */
  acePip: string;
}

/**
 * One full theme. Every theme must have the same shape, so screens and the
 * board can switch themes without code changes.
 */
export interface AppTheme {
  /** Stable id, saved in settings. */
  id: string;
  /** Light or dark UI. Native parts (status bar, switches) follow it. */
  scheme: 'light' | 'dark';
  colors: UiColors;
  board: BoardColors;
  checker: CheckerColors;
  highlight: HighlightColors;
  dice: DiceColors;
  space: typeof spacing;
  radii: typeof radii;
  type: typeof typography;
  touch: typeof touch;
}

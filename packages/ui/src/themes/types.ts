import type { radii, spacing, touch, typography } from '../tokens';

/** Colors for menus, lists, buttons and text. */
export interface UiColors {
  /** Main screen background. */
  background: string;
  /** Darker edge of the background (for gradients and sheets). */
  backgroundDeep: string;
  /** The warm glow at the top of a screen, like a lamp over the table (#493). Opaque. */
  backgroundLamp: string;
  /** The dark floor the glow fades to at the bottom of a screen (#493). Opaque. */
  backgroundFloor: string;
  /** Cards, list groups and secondary buttons. */
  surface: string;
  /** A selected segment or option. */
  surfaceSelected: string;
  /** A raised card, a sheet or a second button: one step above `surface` (#491). Opaque. */
  surfaceRaised: string;
  /** Sunk into the page: inputs, tracks and a disabled second button (#491). Opaque. */
  surfaceSunken: string;
  /** Outlines of cards, segments and secondary buttons. */
  border: string;
  /** The lit top edge of a tray or raised card (#493). Opaque. */
  edgeLight: string;
  /** Thin lines between rows. */
  separator: string;
  /** Main text. */
  text: string;
  /** Secondary text, helper text and section titles. */
  textDim: string;
  /** Text on a disabled control. */
  textDisabled: string;
  /** The faintest text: chevrons, placeholders, a disabled second button (#491). */
  textFaint: string;
  /** Main button, selected outline and "on" switch track (brass). */
  accent: string;
  /** The lit edge of the brass gradient on the main button (#356). Opaque. */
  accentLight: string;
  /** Text and icons on `accent` (and on `accentLight`). */
  onAccent: string;
  /** The low end of the brass gradient while the main button is pressed (#491). Opaque. */
  accentPressed: string;
  /** A disabled main button: flat, muted brass (#491). Opaque. */
  accentMuted: string;
  /** Text on `accentMuted` (#491). */
  onAccentMuted: string;
  /** A soft brass tint on a surface: the "Learn to play" banner (#342). Opaque. */
  accentWash: string;
  /** A brass outline on a surface (#342). Opaque. */
  accentLine: string;
  /** Text and icons that mark a problem (#462): an error popup, a wrong code. */
  problem: string;
  /** The back of an error popup or line: a red tint on a surface (#462). Opaque. */
  problemWash: string;
  /** The outline of an error popup or line (#462). Opaque. */
  problemLine: string;
  /** A destructive button while pressed: a darker `problemWash` (#491). Opaque. */
  problemPressed: string;
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

/** The four woods of a checker avatar (#495): the board's own ivory, maple, walnut and ebony. */
export type AvatarWood = 'bone' | 'maple' | 'walnut' | 'ebony';

/** One avatar checker seen from above: a turned center ring, a face and a rim. */
export interface AvatarWoodColors {
  /** The face of the checker. */
  face: string;
  /** The turned center (the inner disc). */
  center: string;
  /** The lit ring around the center. */
  ring: string;
  /** The thin edge. */
  rim: string;
  /** The initials. */
  text: string;
}

/** Checker avatars (#495, Figma: Patterns → Checker avatars). */
export interface AvatarColors {
  bone: AvatarWoodColors;
  maple: AvatarWoodColors;
  walnut: AvatarWoodColors;
  ebony: AvatarWoodColors;
  /** The brass ring that marks you. */
  you: string;
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
  avatar: AvatarColors;
  highlight: HighlightColors;
  dice: DiceColors;
  space: typeof spacing;
  radii: typeof radii;
  type: typeof typography;
  touch: typeof touch;
}

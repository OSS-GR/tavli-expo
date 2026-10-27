/**
 * Types for a board theme manifest (`<theme-id>/theme.json`).
 *
 * A theme is data (ADR-0005). The board renderer reads only this manifest.
 * It never hard-codes art, colors or positions.
 *
 * Units used in this file:
 * - **Normalized** (`Rect`, `Vec`): 0..1 across the board. `x` and `w` are
 *   fractions of the board width; `y` and `h` are fractions of the board height.
 * - **Width units** (layout lengths such as the checker radius): fractions of
 *   the board width. Multiply by the drawn board width in points.
 * - **Radius units** (inside a checker style): fractions of the checker radius.
 * - **Die units** (inside the dice style): fractions of the die size.
 *
 * This file has no runtime code and no React imports.
 */

/** A color: `#RRGGBB`, or a palette token reference such as `{board.frame}`. */
export type Color = string;

/** Text in both app languages. */
export interface LocalizedText {
  en: string;
  el: string;
}

/** A normalized rectangle (0..1). `x`, `y` is the top-left corner. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A normalized point (0..1). */
export interface Vec {
  x: number;
  y: number;
}

/** The edge of a slot where a stack starts (the base of a point). */
export type Side = 'left' | 'right' | 'top' | 'bottom';

/** Image scale factors. File names follow React Native: `a.webp`, `a@2x.webp`, `a@3x.webp`. */
export type Scale = 1 | 2 | 3;

/** One image, shipped at one or more scales. */
export interface ImageAsset {
  /** File name of the @1x image, relative to the theme folder. Always `.webp`. */
  file: string;
  /** Which scales exist on disk. */
  scales: Scale[];
  /** Size of the @1x image in pixels (= points at the layout reference size). */
  width: number;
  height: number;
}

export interface GradientStop {
  /** 0..1 along the gradient. */
  offset: number;
  color: Color;
  /** 0..1. */
  opacity: number;
}

/**
 * A radial gradient. `cx`, `cy`, `rx`, `ry` are fractions of the shape's
 * bounding box (like SVG `objectBoundingBox`).
 */
export interface RadialGradient {
  type: 'radial';
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  stops: GradientStop[];
}

/** A linear gradient. Points are fractions of the shape's bounding box. */
export interface LinearGradient {
  type: 'linear';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  stops: GradientStop[];
}

/** Blend modes the renderer must support. Names follow Skia. */
export type BlendMode = 'srcOver' | 'multiply' | 'softLight' | 'screen' | 'overlay';

/** A drop shadow. Lengths use the unit of the place where it is used. */
export interface Shadow {
  dx: number;
  dy: number;
  /** Gaussian blur sigma. */
  blur: number;
  color: Color;
  opacity: number;
}

export interface Stroke {
  color: Color;
  opacity: number;
  width: number;
}

// --------------------------------------------------------------- layout ---

/** One of the 24 points (triangles). */
export interface PointSlot {
  /** 1..24, numbered from the bottom player's side (see `BoardLayout`). */
  index: number;
  /** The area that belongs to this point: hit target and stack area. */
  rect: Rect;
  /** The edge where the triangle base sits. Stacks grow away from it. */
  base: Side;
  /** Which point wood to use. Points facing each other differ. */
  tone: 'dark' | 'light';
}

/** An area where checkers stack (a bar half or a tray). */
export interface StackSlot {
  rect: Rect;
  /** The edge where the stack starts. */
  base: Side;
}

/** An image layer drawn as part of the board. */
export interface BoardLayer {
  id: string;
  /** Key in `ThemeManifest.images`. */
  image: string;
  /** `underPoints`: drawn first. `overPoints`: after the points, before the checkers. */
  z: 'underPoints' | 'overPoints';
  blend: BlendMode;
}

/**
 * The board geometry for one orientation.
 *
 * Point numbers are from the point of view of the **player at the bottom of
 * the screen** ("player"). That player moves 24 -> 1 and bears off into
 * `trays.player`. The renderer maps engine points to these slots.
 */
export interface BoardLayout {
  orientation: 'portrait' | 'landscape';
  /** Board width / height. */
  aspectRatio: number;
  /** The size in points the art was drawn for. @1x images match it in pixels. */
  referenceSize: { width: number; height: number };
  /** Image layers, in draw order. */
  layers: BoardLayer[];
  /** The two playing fields (recesses) that hold the points. */
  fields: Rect[];
  /** All 24 points. */
  points: PointSlot[];
  /** How a point triangle sits inside its rect. */
  pointShape: {
    /** Triangle length as a fraction of the rect depth (base to far edge). */
    depth: number;
    /** Gap at each base corner, as a fraction of the rect breadth. */
    baseInset: number;
    /** Fine inlay seam around each triangle (width in width units). */
    seam: Stroke;
    /** Size of one texture tile, in width units. */
    tileSize: number;
    /** Texture rotation in degrees, so the grain runs along the point. */
    tileRotation: number;
  };
  bar: {
    rect: Rect;
    /** Where the bottom player's hit checkers wait. */
    player: StackSlot;
    /** Where the top player's hit checkers wait. */
    opponent: StackSlot;
  };
  /** Bear-off trays. */
  trays: {
    player: StackSlot;
    opponent: StackSlot;
  };
  /** Where the dice land on the board. */
  diceArea: Rect;
  checker: {
    /** Checker radius, in width units. */
    radius: number;
    /** Preferred distance between checker centers in a stack, in width units. */
    stackSpacing: number;
    /** Gap between the slot base and the first checker, in width units. */
    stackInset: number;
    /** A stack may fill this fraction of the slot depth. Spacing shrinks to fit. */
    maxStackDepth: number;
    /** Most checkers drawn in one stack. More show a count badge on the last one. */
    maxVisible: number;
    /** Thickness of a borne-off checker seen from its edge in a tray, in width units. */
    trayThickness: number;
  };
  dice: {
    /** Die size (side of the square), in width units. */
    size: number;
    /** Resting angles in degrees for the first and the second die. */
    tilt: [number, number];
  };
  /** Shadow of the whole board on the table. Lengths in width units. */
  shadow: Shadow;
  /** Optional light over everything (board and checkers), e.g. a lamp. */
  overlay?: {
    gradient: RadialGradient;
    blend: BlendMode;
  };
}

/** The two layouts every theme has. */
export type LayoutId = 'portrait-rotated' | 'landscape';

// --------------------------------------------------------------- styles ---

/** One ring cut into a checker. Lengths in radius units. */
export interface Groove {
  radius: number;
  width: number;
  color: Color;
  opacity: number;
  /** The light lower lip of the groove. */
  light: { opacity: number; width: number; dx: number; dy: number };
}

/** How one checker color is drawn. Lengths in radius units. */
export interface CheckerStyle {
  name: LocalizedText;
  fill: Color;
  /** Dome shading over the fill (highlight top-left, shade at the edge). */
  highlight: RadialGradient;
  /** Optional dished centre. */
  dish?: { radius: number; gradient: RadialGradient; groove: Groove };
  grooves: Groove[];
  /** Lit bevel: a gradient stroke just inside the edge. */
  bevel: { inset: number; width: number; opacity: number; gradient: LinearGradient };
  /** Optional polished ring (for dark checkers on dark points). */
  ring?: { color: Color; inset: number; width: number };
  /** Outer outline. */
  rim: { color: Color; inset: number; width: number };
}

export interface CheckerStyles {
  /** The bottom player's checkers by default. */
  light: CheckerStyle;
  dark: CheckerStyle;
  /** Drop shadow under every checker. Lengths in radius units. */
  shadow: Shadow;
  /** Count badge on the last visible checker of a tall stack. Lengths in radius units. */
  badge: {
    fill: Color;
    text: Color;
    border: Color;
    radius: number;
    borderWidth: number;
    fontSize: number;
  };
}

export interface PointStyles {
  dark: { name: LocalizedText; fill: Color; texture: string };
  light: { name: LocalizedText; fill: Color; texture: string };
}

/** Highlight rings. Lengths in radius units. */
export interface HighlightStyles {
  /** The picked-up or selected checker: a solid ring. */
  select: { color: Color; radius: number; width: number; halo: Stroke };
  /** A legal target: a dashed ring with a faint fill. */
  target: {
    color: Color;
    radius: number;
    width: number;
    dash: [number, number];
    fillOpacity: number;
    halo: Stroke;
  };
}

/** Dice look. Lengths in die units. */
export interface DiceStyle {
  face: Color;
  side: Color;
  edge: Color;
  pip: Color;
  /** Color of the single pip on the 1 face (red on many Greek sets). */
  acePip: Color;
  cornerRadius: number;
  /** Inset of the top face from the die outline. */
  faceInset: number;
  edgeWidth: number;
  pipRadius: number;
  /** Distance from the center to a corner pip, on each axis. */
  pipSpacing: number;
  /** Dome shading over the face. */
  highlight: RadialGradient;
  highlightOpacity: number;
  shadow: Shadow;
}

/**
 * Game events that can have a sound and a haptic. The theme maps each event
 * to a sound (`sounds`) and a haptic pattern (`haptics`). The app plays both
 * with one call (`apps/mobile/src/features/feedback`).
 */
export type FeedbackEvent =
  | 'checkerPickUp'
  | 'checkerPlace'
  | 'checkerHit'
  | 'bearOff'
  | 'diceShake'
  | 'diceRoll'
  | 'diceLand'
  | 'invalidMove'
  | 'turnStart'
  | 'gameWin'
  | 'matchWin';

export type SoundKey = FeedbackEvent;
export type HapticKey = FeedbackEvent;

/**
 * The sound of one event: a file, or several takes of the same sound (the app
 * plays them in turn, so repeats do not sound like a machine gun). Paths are
 * relative to the theme folder: `sounds/<kebab-name>.m4a`. `null` = silent.
 */
export type SoundFiles = string | readonly string[] | null;

/** Haptic patterns. They map to `expo-haptics` in the app. */
export type HapticStyle =
  'selection' | 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error';

export interface ThemeManifest {
  /** Folder name, kebab-case. */
  id: string;
  /** Semver of the theme data and art. */
  version: string;
  name: LocalizedText;
  description: LocalizedText;
  /** `image`: board art is images plus vector points. `vector`: shapes only. */
  kind: 'image' | 'vector';
  license: {
    /** License of the art made for this project. */
    art: string;
    /** License of third-party sources (textures). */
    sources: string;
    /** File with the full list of sources, relative to the package root. */
    file: string;
  };
  defaultLayout: LayoutId;
  /** Color tokens. Other color fields may reference them as `{token.name}`. */
  palette: Record<string, string>;
  images: Record<string, ImageAsset>;
  layouts: Record<LayoutId, BoardLayout>;
  points: PointStyles;
  checkers: CheckerStyles;
  highlights: HighlightStyles;
  dice: DiceStyle;
  sounds: Partial<Record<SoundKey, SoundFiles>>;
  haptics: Partial<Record<HapticKey, HapticStyle>>;
  accessibility: {
    /** WCAG contrast of the two checker fills (checked by the tests). */
    checkerContrast: number;
    colorBlindChecked: ('protanopia' | 'deuteranopia' | 'tritanopia')[];
  };
}

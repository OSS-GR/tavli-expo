/**
 * "Grab a chair" (#509): the kafeneio table scene. It builds up piece by
 * piece (#512): the table, their chair, the tavli board that drops like a
 * cartoon, then your chair, its back to us. This file is pure: the drawing
 * (paths on a 240×180 grid) and the motion as a function of time.
 * `TableScene.tsx` draws it with Skia, which clips to the grid, so a part
 * off the grid is out of sight.
 *
 * The timeline, in ms from the start (`SCENE_TIMES`):
 * - 0–300: a short wait, so the screen is in place. The floor fades in.
 * - 300–800: the table slides in from the left and overshoots a little;
 *   800–950 it rocks once and settles.
 * - 950–1350: their chair slides in from the right, behind the table,
 *   with a small hop.
 * - 1400–1700: the board falls, stretched, with speed lines. 1700: it lands
 *   squashed; the table dips 2, dust puffs out. 1760–1920: one small
 *   bounce, 1920–2000 a last small squash.
 * - 2000–2260: your chair comes up into sight, close to us. 2260–2620: it
 *   is pulled in. 2620–2800: a 1° rock, then rest.
 */

/** When each part of the scene starts, in ms. */
export const SCENE_TIMES = {
  tableIn: 300,
  tableStop: 800,
  tableSettle: 950,
  theirIn: 950,
  theirStop: 1350,
  board: 1400,
  yourRise: 2000,
  yourIn: 2260,
} as const;

/** The whole scene, in ms. */
export const TABLE_SCENE_MS = 2800;

/** The drawing grid. */
export const SCENE_WIDTH = 240;
export const SCENE_HEIGHT = 180;

/** Where the board squashes and stretches from: the middle of its bottom edge. */
export const BOARD_ORIGIN = { x: 120, y: 77 } as const;
/** Where your chair turns and grows from: the middle of its feet. */
export const CHAIR_ORIGIN = { x: 120, y: 172 } as const;
/** Where the table turns as it skids: its middle on the floor. */
export const TABLE_ORIGIN = { x: 120, y: 150 } as const;

/** One frame of the scene. Every number is in grid units (degrees for the turns). */
export interface TableFrame {
  /** How much of the floor line shows, 0 to 1. */
  readonly floor: number;
  /** The table's slide (negative is left) and its turn. */
  readonly tableX: number;
  readonly tableRotate: number;
  /** The table's dip at the landing. */
  readonly tableDip: number;
  /** Their chair's slide (positive is right) and hop (negative is up). */
  readonly theirX: number;
  readonly theirY: number;
  /** The board's drop above its place (negative is up). */
  readonly boardY: number;
  readonly boardScaleX: number;
  readonly boardScaleY: number;
  /** The speed lines' opacity. */
  readonly lines: number;
  /** The dust's opacity and how far it has spread. */
  readonly dust: number;
  readonly dustSpread: number;
  readonly chairScale: number;
  readonly chairX: number;
  readonly chairY: number;
  readonly chairRotate: number;
}

/** The last frame: everything in place. */
export const REST_FRAME: TableFrame = {
  floor: 1,
  tableX: 0,
  tableRotate: 0,
  tableDip: 0,
  theirX: 0,
  theirY: 0,
  boardY: 0,
  boardScaleX: 1,
  boardScaleY: 1,
  lines: 0,
  dust: 0,
  // Where the faded dust ended.
  dustSpread: 14,
  chairScale: 1,
  chairX: 0,
  chairY: 0,
  chairRotate: 0,
};

function clamp01(x: number): number {
  'worklet';
  return Math.min(1, Math.max(0, x));
}

function lerp(a: number, b: number, p: number): number {
  'worklet';
  return a + (b - a) * p;
}

/** Progress from `a` to `b`, 0 to 1. */
function part(t: number, a: number, b: number): number {
  'worklet';
  return clamp01((t - a) / (b - a));
}

/** Eases out past the end and back: 0 at 0, 1 at 1, a little over 1 near the end. */
function outBack(p: number, s: number): number {
  'worklet';
  return 1 + (s + 1) * Math.pow(p - 1, 3) + s * Math.pow(p - 1, 2);
}

/** The scene at `t` ms. Before 0 is the first frame; from `TABLE_SCENE_MS` on, `REST_FRAME`. */
export function tableFrame(t: number): TableFrame {
  'worklet';
  if (t >= TABLE_SCENE_MS) return REST_FRAME;
  const time = Math.max(0, t);
  const T = SCENE_TIMES;

  const floor = part(time, 150, 450);

  // The table: pushed in from the left, leaning back, then one rock.
  const slide = part(time, T.tableIn, T.tableStop);
  const tableX = lerp(-200, 0, outBack(slide, 1.1));
  let tableRotate = -5 * (1 - slide) * (1 - slide);
  if (time >= T.tableStop) {
    const settle = part(time, T.tableStop, T.tableSettle);
    tableRotate = 2.2 * Math.sin(Math.PI * settle) * (1 - settle);
  }

  // Their chair: in from the right, with a hop.
  const come = part(time, T.theirIn, T.theirStop);
  const theirX = lerp(150, 0, outBack(come, 1.2));
  const theirY = -7 * Math.sin(Math.PI * Math.min(1, come * 1.25));

  // The board: falls faster and faster, and stretches as it goes.
  const b = time - T.board;
  let boardY = -115;
  let boardScaleX = 1;
  let boardScaleY = 1;
  let lines = 0;
  if (b >= 0 && b < 300) {
    const v = b / 300;
    boardY = lerp(-115, 0, v * v);
    boardScaleX = lerp(1, 0.84, v);
    boardScaleY = lerp(1, 1.35, v);
    lines = 0.85 * part(b, 120, 200);
  } else if (b >= 300 && b < 360) {
    // Lands squashed, then springs back.
    const p = part(b, 300, 360);
    const out = 1 - (1 - p) * (1 - p);
    boardY = 0;
    boardScaleX = lerp(1.2, 1, out);
    boardScaleY = lerp(0.55, 1, out);
    lines = 0.85 * (1 - part(b, 300, 330));
  } else if (b >= 360 && b < 520) {
    const h = Math.sin(Math.PI * part(b, 360, 520));
    boardY = -9 * h;
    boardScaleX = lerp(1, 0.94, h);
    boardScaleY = lerp(1, 1.1, h);
  } else if (b >= 520) {
    const k = Math.sin(Math.PI * part(b, 520, 600));
    boardY = 0;
    boardScaleX = 1 + 0.06 * k;
    boardScaleY = 1 - 0.1 * k;
  }

  let tableDip = 0;
  if (b >= 300 && b < 380) {
    const p = part(b, 300, 380);
    tableDip = 2 * (1 - p) * (1 - p);
  } else if (b >= 520 && b < 580) {
    tableDip = 0.8 * Math.sin(Math.PI * part(b, 520, 580));
  }

  let dust = 0;
  let dustSpread = 0;
  if (b >= 300 && b < 680) {
    const p = part(b, 300, 680);
    dust = 0.9 * (1 - p);
    dustSpread = 14 * (1 - (1 - p) * (1 - p));
  } else if (b >= 680) {
    dustSpread = 14;
  }

  // Your chair: below the grid until its turn, then up close to us.
  let chairScale = 1.32;
  let chairX = 14;
  let chairY = 160;
  let chairRotate = 3;
  if (time < T.yourIn) {
    const p = part(time, T.yourRise, T.yourIn);
    chairY = lerp(160, 24, 1 - Math.pow(1 - p, 3));
  } else {
    const pullEnd = T.yourIn + 360;
    const raw = part(time, T.yourIn, pullEnd);
    const p = 1 - Math.pow(1 - raw, 3);
    chairScale = lerp(1.32, 1, p);
    chairX = lerp(14, 0, p);
    chairY = lerp(24, 0, p);
    // A small scrape on the floor as it comes.
    chairRotate = lerp(3, 0, p) + Math.sin(raw * Math.PI * 3) * 1.4 * (1 - raw);
    if (time >= pullEnd) chairRotate = -Math.sin(Math.PI * part(time, pullEnd, TABLE_SCENE_MS));
  }

  return {
    floor,
    tableX,
    tableRotate,
    tableDip,
    theirX,
    theirY,
    boardY,
    boardScaleX,
    boardScaleY,
    lines,
    dust,
    dustSpread,
    chairScale,
    chairX,
    chairY,
    chairRotate,
  };
}

/** The four dust puffs at a spread: centre and radius. */
export function dustPuffs(spread: number): readonly { x: number; y: number; r: number }[] {
  'worklet';
  const d = spread;
  return [
    { x: 78 - d, y: 70 - d / 3, r: 3.5 },
    { x: 72 - d * 1.4, y: 64 - d / 2, r: 2.5 },
    { x: 162 + d, y: 70 - d / 3, r: 3.5 },
    { x: 168 + d * 1.4, y: 64 - d / 2, r: 2.5 },
  ];
}

/** The paths of the scene, by part. Strokes are line art; fills sit under them. */
export const SCENE_PATHS = {
  floor: 'M30 150 H210',
  /** The other player's chair, behind the table, facing us. */
  theirChair: {
    strokes: [
      'M104 26 V99',
      'M136 26 V99',
      'M102 28 Q120 24 138 28',
      'M104 36 Q120 33 136 36',
      'M98 104 L142 104 L136 99 L104 99 Z',
      'M99 104 V134',
      'M141 104 V134',
      'M105 99 V128',
      'M135 99 V128',
    ],
    fill: 'M98 104 L142 104 L136 99 L104 99 Z',
  },
  table: {
    strokes: [
      'M72 58 V132',
      'M168 58 V132',
      'M66 56 L174 56 L186 80 L54 80 Z',
      'M54 80 V85 H186 V80',
      'M58 85 V150',
      'M182 85 V150',
    ],
    fills: ['M66 56 L174 56 L186 80 L54 80 Z', 'M54 80 V85 H186 V80 Z'],
  },
  speedLines: ['M100 30 V52', 'M120 22 V50', 'M140 30 V52'],
  board: {
    top: 'M88 60 L152 60 L158 74 L82 74 Z',
    front: 'M82 74 V77 H158 V74',
    frontFill: 'M82 74 V77 H158 V74 Z',
    bar: 'M120 60 V74',
  },
  /** Your chair, seen from behind. */
  yourChair: {
    strokes: [
      'M94 128 L146 128 L140 120 L100 120 Z',
      'M100 120 V158',
      'M140 120 V158',
      'M94 172 V82',
      'M146 172 V82',
      'M91 84 Q120 77 149 84',
      'M94 97 Q120 92 146 97',
    ],
    /** The cross bar between the legs: a little thinner. */
    rung: 'M94 156 L146 156',
    /** The rush seat's weave: thin and faint. */
    weave: ['M100 123 L140 123', 'M98 125.5 L142 125.5'],
    fill: 'M94 128 L146 128 L140 120 L100 120 Z',
  },
} as const;

/** The board's points, light and dark, each as one path of triangles. */
export const BOARD_POINTS: { readonly light: string; readonly dark: string } = (() => {
  let light = '';
  let dark = '';
  const tri = (a: number, b: number, y: number, tx: number, ty: number) =>
    `M${a} ${y} L${b} ${y} L${tx} ${ty} Z `;
  for (let i = 0; i < 12; i++) {
    if (i === 6) continue; // the bar
    const fx0 = 84 + i * 6.1;
    const fx1 = fx0 + 5.4;
    const bx0 = 89.5 + i * 5.1;
    const bx1 = bx0 + 4.5;
    const near = tri(fx0, fx1, 73.2, (fx0 + fx1) / 2 + (bx0 - fx0) * 0.4, 68);
    const far = tri(bx0, bx1, 60.8, (bx0 + bx1) / 2 + (fx0 - bx0) * 0.4, 65.5);
    if (i % 2 === 0) {
      dark += near;
      light += far;
    } else {
      light += near;
      dark += far;
    }
  }
  return { light: light.trim(), dark: dark.trim() };
})();

/**
 * The dice roll animation, as pure math (worklets, so they run on the UI thread).
 *
 * A roll is a 2D tumble: the die spins, hops and grows, and its face flips
 * through other numbers before it lands on the value the engine rolled.
 * The flips are a fixed sequence, not random: the engine's `Rng` picks the
 * result, the animation only shows it (ADR-0005).
 */

/** Length of the roll for the first die, in ms. Each next die lands a bit later. */
export const ROLL_MS = 650;
/** Extra time for each next die. */
export const ROLL_STAGGER_MS = 90;
/** Fade time of a used die. */
export const FADE_MS = 220;
/** Opacity of a used die. */
export const USED_OPACITY = 0.35;
/** Two dice land this long after the roll: the second die rolls `ROLL_STAGGER_MS` longer. */
export const DICE_LAND_MS = ROLL_MS + ROLL_STAGGER_MS;

// A double (#177): the two rolled dice land and stay a beat, then split
// into the four dice the player plays.

/** How long a double shows only its two dice after they land. */
export const DOUBLE_BEAT_MS = 600;
/** The two dice of a double split into four in this time. */
export const DOUBLE_SPLIT_MS = 300;
/** From the roll of a double to the start of the split. */
export const DOUBLE_SPLIT_AT_MS = DICE_LAND_MS + DOUBLE_BEAT_MS;
/** From the roll of a double until the four dice are in place. */
export const DOUBLE_SHOWN_MS = DOUBLE_SPLIT_AT_MS + DOUBLE_SPLIT_MS;
/** The face stops flipping at this point of the roll. */
const SETTLE_AT = 0.78;

export interface TumbleFrame {
  /** Hop up (negative), in points. */
  readonly dy: number;
  /** Angle in radians. */
  readonly rotate: number;
  readonly scale: number;
}

/**
 * The die's pose at progress `p` (0 = thrown, 1 = landed). Die `index`
 * spins the other way from its neighbor. It ends at `tiltDeg`, scale 1.
 */
export function tumble(p: number, index: number, size: number, tiltDeg: number): TumbleFrame {
  'worklet';
  const t = Math.min(1, Math.max(0, p));
  const rest = 1 - t;
  const turn = index % 2 === 0 ? 1 : -1;
  return {
    dy: -Math.abs(Math.sin(t * Math.PI * 2.5)) * rest * size * 0.45,
    rotate: (tiltDeg * Math.PI) / 180 + turn * rest * rest * Math.PI * 3,
    scale: 0.72 + 0.28 * (1 - rest * rest),
  };
}

/** The face to show at progress `p`. From `SETTLE_AT` on, always `value`. */
export function tumbleFace(p: number, index: number, value: number): number {
  'worklet';
  if (p >= SETTLE_AT) return value;
  const step = Math.floor(p * 18) + index * 2;
  // Walk the faces 1..6, skipping the final value, so the landing is visible.
  const others = [1, 2, 3, 4, 5, 6].filter((f) => f !== value);
  return others[step % others.length] ?? value;
}

// ---------------------------------------------------------------------------
// Where the dice sit in the controls row.

/** Size of one die when two are shown, in points. */
export const DIE_SIZE = 40;
/** Doubles show four dice at this fraction of the size. */
const GRID_SCALE = 0.62;

export interface DicePlace {
  readonly x: number;
  readonly y: number;
  readonly size: number;
}

/**
 * Where the dice of a double sit (#177). `pair`: the two rolled dice, side
 * by side, before the split. `grid`: the four dice in a 2 x 2 grid after it.
 * One box holds both, so the row does not change size at the split.
 */
export function doublePlaces(size = DIE_SIZE): {
  pair: [DicePlace, DicePlace];
  grid: DicePlace[];
  width: number;
  height: number;
} {
  const two = dicePlaces(2, size);
  const pad = size * 0.3; // room for the hop and the shadow
  const s = size * GRID_SCALE;
  const gap = s * 0.18;
  const cell = s + gap;
  const width = Math.max(two.width, 2 * cell + 2 * pad);
  const height = Math.max(two.height, 2 * cell + pad);
  const dx = (width - two.width) / 2;
  const dy = (height - two.height) / 2;
  const [a, b] = two.places.map((p) => ({ x: p.x + dx, y: p.y + dy, size: p.size }));
  const x0 = width / 2 - cell / 2;
  const y0 = height / 2 - cell / 2;
  return {
    pair: [a as DicePlace, b as DicePlace],
    grid: [0, 1, 2, 3].map((i) => ({
      x: x0 + (i % 2) * cell,
      y: y0 + Math.floor(i / 2) * cell,
      size: s,
    })),
    width,
    height,
  };
}

/** Where each die sits in the row. Pure, so tests can check it. */
export function dicePlaces(
  count: number,
  size = DIE_SIZE,
): {
  places: DicePlace[];
  width: number;
  height: number;
} {
  const pad = size * 0.3; // room for the hop and the shadow
  if (count === 4) {
    const { grid, width, height } = doublePlaces(size);
    return { places: grid, width, height };
  }
  const gap = size * 0.3;
  const width = count * size + (count - 1) * gap + 2 * pad;
  const height = size + 2 * pad;
  return {
    places: Array.from({ length: count }, (_, i) => ({
      x: pad + size / 2 + i * (size + gap),
      y: height / 2,
      size,
    })),
    width,
    height,
  };
}

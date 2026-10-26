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

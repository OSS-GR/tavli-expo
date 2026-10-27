/**
 * Dice throw spike (#183): the path of two dice thrown onto the board.
 *
 * The dice values come first (from the RNG). `planThrow` then works out a
 * path that ends on those values: the dice fly in the swipe direction, slow
 * down, bounce off the walls of the field and off each other, and stop.
 * The animation only plays the plan back, so it can never change the result.
 *
 * Pure TypeScript: no React, no Skia. The plan is a list of samples (one per
 * frame at 60 fps). `sampleAt` is a worklet, so the UI thread can read the
 * pose between two samples.
 */

export interface Vec2 {
  readonly x: number;
  readonly y: number;
}

/** Where the center of a die may go, in canvas points. */
export interface Box {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

/** A rect in canvas points (like `ScreenRect` in `features/board/geometry`). */
export interface PlainRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** The numbers that shape a throw. Speeds in points per second. */
export interface ThrowTuning {
  /** Slowest throw. A slow swipe still throws this fast. */
  readonly minSpeed: number;
  /** Fastest throw. A very fast flick is cut to this. */
  readonly maxSpeed: number;
  /** Air and felt drag: speed lost per second, as a rate (1/s). */
  readonly drag: number;
  /** Rolling friction: a fixed loss of speed per second (pt/s²). It makes the dice stop. */
  readonly friction: number;
  /** Share of the speed into a wall that a die keeps after the bounce (0..1). */
  readonly restitution: number;
  /** Share of the speed along a wall that a die keeps after the bounce (0..1). */
  readonly wallGrip: number;
  /** A hit slower than this (into the wall) makes no sound. */
  readonly quietHit: number;
  /** Time between two samples of the plan, in ms. */
  readonly sampleMs: number;
  /** Physics steps per sample. More steps: fewer dice that pass through each other. */
  readonly substeps: number;
  /** Hard stop for a throw, in ms. */
  readonly maxMs: number;
  /** In-plane spin, in radians per die size of travel. */
  readonly spin: number;
  /** A die shows a new face after this many die sizes of travel. */
  readonly faceEvery: number;
  /** Extra scale of a die at full speed (it is "in the air"). */
  readonly lift: number;
}

export const THROW_TUNING: ThrowTuning = {
  minSpeed: 450,
  maxSpeed: 1800,
  drag: 1,
  friction: 350,
  restitution: 0.5,
  wallGrip: 0.85,
  quietHit: 90,
  sampleMs: 1000 / 60,
  substeps: 4,
  maxMs: 2200,
  spin: 0.9,
  faceEvery: 0.9,
  lift: 0.22,
};

// ---------------------------------------------------------------------------
// Small math helpers. Each has a unit test.

/**
 * Bounce `v` off a wall with the unit `normal` (pointing into the field).
 * The part into the wall flips and keeps `restitution`; the part along the
 * wall keeps `grip`.
 */
export function reflect(v: Vec2, normal: Vec2, restitution: number, grip = 1): Vec2 {
  const into = v.x * normal.x + v.y * normal.y;
  if (into >= 0) return v; // already moving away from the wall
  const nx = into * normal.x;
  const ny = into * normal.y;
  const tx = v.x - nx;
  const ty = v.y - ny;
  return { x: tx * grip - nx * restitution, y: ty * grip - ny * restitution };
}

/**
 * Speed after `dt` seconds of drag (`drag`, 1/s) and friction (`friction`,
 * pt/s²). The exact answer of ds/dt = -drag·s - friction, never below 0.
 */
export function dampSpeed(speed: number, dt: number, drag: number, friction: number): number {
  if (speed <= 0) return 0;
  if (drag <= 0) return Math.max(0, speed - friction * dt);
  const c = friction / drag;
  return Math.max(0, (speed + c) * Math.exp(-drag * dt) - c);
}

/** Seconds until a die at `speed` stops, with no bounce on the way. */
export function stopTime(speed: number, drag: number, friction: number): number {
  if (speed <= 0) return 0;
  if (friction <= 0) return Infinity;
  if (drag <= 0) return speed / friction;
  const c = friction / drag;
  return Math.log((speed + c) / c) / drag;
}

/** `v` with its length clamped to `[min, max]`. A zero `v` points up. */
export function clampSpeed(v: Vec2, min: number, max: number): Vec2 {
  const speed = Math.hypot(v.x, v.y);
  if (speed === 0) return { x: 0, y: -min };
  const s = Math.min(max, Math.max(min, speed));
  return { x: (v.x / speed) * s, y: (v.y / speed) * s };
}

/** The box a die center may use in `field`: the field, less half a die (and a little for the turn). */
export function throwBox(field: PlainRect, dieSize: number): Box {
  const pad = dieSize * 0.6;
  const cx = field.x + field.width / 2;
  const cy = field.y + field.height / 2;
  const left = field.x + pad;
  const right = field.x + field.width - pad;
  const top = field.y + pad;
  const bottom = field.y + field.height - pad;
  // A field smaller than a die: every die sits in the middle.
  return {
    left: left <= right ? left : cx,
    right: left <= right ? right : cx,
    top: top <= bottom ? top : cy,
    bottom: top <= bottom ? bottom : cy,
  };
}

export function clampToBox(p: Vec2, box: Box): Vec2 {
  return {
    x: Math.min(box.right, Math.max(box.left, p.x)),
    y: Math.min(box.bottom, Math.max(box.top, p.y)),
  };
}

// ---------------------------------------------------------------------------
// From a swipe to a throw.

/** A throw: where the dice leave the hand and how fast (pt/s). */
export interface ThrowStart {
  readonly at: Vec2;
  readonly velocity: Vec2;
}

/** Used when the gesture gives no velocity: a swipe is about this long, in seconds. */
const SWIPE_SECONDS = 0.15;

/**
 * The throw for a swipe that ended at `end`. `velocity` is the finger speed
 * from Gesture Handler (pt/s). Without a usable one (0 or not a number),
 * the speed comes from `translation` over a typical swipe time.
 */
export function swipeToThrow(
  end: Vec2,
  velocity: Vec2 | undefined,
  translation: Vec2,
  box: Box,
  tuning: ThrowTuning = THROW_TUNING,
): ThrowStart {
  const usable =
    velocity !== undefined &&
    Number.isFinite(velocity.x) &&
    Number.isFinite(velocity.y) &&
    Math.hypot(velocity.x, velocity.y) > 0;
  const raw = usable
    ? velocity
    : { x: translation.x / SWIPE_SECONDS, y: translation.y / SWIPE_SECONDS };
  return {
    at: clampToBox(end, box),
    velocity: clampSpeed(raw, tuning.minSpeed, tuning.maxSpeed),
  };
}

/**
 * A throw without a swipe (the Roll button, a tap): from the near end of
 * the box, up into the field, a bit to the left or right. `turn` picks the
 * side, so two button throws in a row look different.
 */
export function buttonThrow(
  box: Box,
  turn: number,
  tuning: ThrowTuning = THROW_TUNING,
): ThrowStart {
  const side = turn % 2 === 0 ? 1 : -1;
  const angle = (side * 18 * Math.PI) / 180;
  const speed = (tuning.minSpeed + tuning.maxSpeed) / 2;
  return {
    at: { x: (box.left + box.right) / 2 - side * (box.right - box.left) * 0.2, y: box.bottom },
    velocity: { x: Math.sin(angle) * speed, y: -Math.cos(angle) * speed },
  };
}

// ---------------------------------------------------------------------------
// Faces.

/**
 * The faces a die shows on the way, from the first to the last. The last is
 * `value`. Like a real die rolling over an edge, two faces in a row are
 * never the same and never opposite (opposite faces add up to 7).
 */
export function faceSequence(value: number, flips: number, seed: number): number[] {
  const out = [value];
  let face = value;
  for (let k = 1; k <= flips; k++) {
    // The four faces next to `face`, in a fixed order.
    const sides = [1, 2, 3, 4, 5, 6].filter((f) => f !== face && f !== 7 - face);
    face = sides[(k * 3 + seed) % sides.length] ?? face;
    out.push(face);
  }
  return out.reverse();
}

// ---------------------------------------------------------------------------
// The plan.

export interface DieTrack {
  /** One value per sample. */
  readonly x: readonly number[];
  readonly y: readonly number[];
  /** In-plane angle in radians. */
  readonly angle: readonly number[];
  readonly scale: readonly number[];
  /** The face on top (1..6). */
  readonly face: readonly number[];
}

export interface ThrowHit {
  /** Time from the throw, in ms. */
  readonly atMs: number;
  readonly die: number;
  readonly kind: 'wall' | 'dice';
  /** 0..1: how hard the hit was (for the volume and the haptic). */
  readonly strength: number;
}

export interface ThrowPlan {
  readonly durationMs: number;
  readonly sampleMs: number;
  /** Number of samples: the first at 0 ms, the last at `durationMs`. */
  readonly samples: number;
  readonly dice: readonly [DieTrack, DieTrack];
  readonly hits: readonly ThrowHit[];
}

export interface PlanThrowInput {
  readonly box: Box;
  readonly start: ThrowStart;
  /** Side of a die, in points. */
  readonly dieSize: number;
  /** The rolled values, decided before the throw. */
  readonly values: readonly [number, number];
  /** Resting angle of each die, in degrees (the theme's `layout.dice.tilt`). */
  readonly tilts: readonly [number, number];
  readonly tuning?: ThrowTuning;
}

interface Body {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

const WALLS = [
  { normal: { x: 1, y: 0 } },
  { normal: { x: -1, y: 0 } },
  { normal: { x: 0, y: 1 } },
  { normal: { x: 0, y: -1 } },
] as const;

/** Moves a die back inside the box and bounces it. Returns the speed into the wall, or 0. */
function hitWalls(b: Body, box: Box, t: ThrowTuning): number {
  let hardest = 0;
  for (const [i, wall] of WALLS.entries()) {
    const out =
      i === 0
        ? box.left - b.x
        : i === 1
          ? b.x - box.right
          : i === 2
            ? box.top - b.y
            : b.y - box.bottom;
    if (out <= 0) continue;
    const into = -(b.vx * wall.normal.x + b.vy * wall.normal.y);
    if (i < 2) b.x += 2 * out * wall.normal.x;
    else b.y += 2 * out * wall.normal.y;
    const v = reflect({ x: b.vx, y: b.vy }, wall.normal, t.restitution, t.wallGrip);
    b.vx = v.x;
    b.vy = v.y;
    hardest = Math.max(hardest, into);
  }
  // A bounce from very near a wall can still end outside: clamp it.
  b.x = Math.min(box.right, Math.max(box.left, b.x));
  b.y = Math.min(box.bottom, Math.max(box.top, b.y));
  return hardest;
}

/** Two dice that touch push apart; equal weights swap the speed along the line between them. */
function hitDice(a: Body, b: Body, minDistance: number, t: ThrowTuning): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const d = Math.hypot(dx, dy);
  if (d >= minDistance) return 0;
  const nx = d > 0 ? dx / d : 1;
  const ny = d > 0 ? dy / d : 0;
  const push = (minDistance - d) / 2;
  a.x -= nx * push;
  a.y -= ny * push;
  b.x += nx * push;
  b.y += ny * push;
  const closing = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
  if (closing <= 0) return 0;
  const j = (closing * (1 + t.restitution)) / 2;
  a.vx -= j * nx;
  a.vy -= j * ny;
  b.vx += j * nx;
  b.vy += j * ny;
  return closing;
}

function slowDown(b: Body, dt: number, t: ThrowTuning): void {
  const speed = Math.hypot(b.vx, b.vy);
  if (speed === 0) return;
  const next = dampSpeed(speed, dt, t.drag, t.friction);
  b.vx = (b.vx / speed) * next;
  b.vy = (b.vy / speed) * next;
}

/** Rotates `v` by `deg` degrees. */
function turnVec(v: Vec2, deg: number): Vec2 {
  const a = (deg * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return { x: v.x * c - v.y * s, y: v.x * s + v.y * c };
}

/**
 * Plans a throw that ends on `values`. Same input, same plan: no random
 * numbers here. The dice start side by side across the throw direction,
 * one a bit slower and a few degrees off, so they part on the way.
 */
export function planThrow(input: PlanThrowInput): ThrowPlan {
  const t = input.tuning ?? THROW_TUNING;
  const { box, dieSize } = input;
  const v0 = input.start.velocity;
  const speed0 = Math.hypot(v0.x, v0.y) || 1;
  // Across the throw, half a die and a bit to each side.
  const across = { x: -v0.y / speed0, y: v0.x / speed0 };
  const gap = dieSize * 0.62;
  const starts = [-1, 1].map((side) =>
    clampToBox(
      { x: input.start.at.x + across.x * gap * side, y: input.start.at.y + across.y * gap * side },
      box,
    ),
  );
  const speeds = [turnVec(v0, -4), turnVec({ x: v0.x * 0.88, y: v0.y * 0.88 }, 5)];
  const bodies: Body[] = starts.map((p, i) => ({
    x: p.x,
    y: p.y,
    vx: speeds[i]?.x ?? 0,
    vy: speeds[i]?.y ?? 0,
  }));
  const minDistance = dieSize * 1.08;
  const dt = t.sampleMs / 1000 / t.substeps;
  const maxSamples = Math.ceil(t.maxMs / t.sampleMs);

  const xs: number[][] = [[], []];
  const ys: number[][] = [[], []];
  const travel: number[][] = [[], []];
  const speedAt: number[][] = [[], []];
  const hits: ThrowHit[] = [];
  const distance = [0, 0];

  const record = () => {
    bodies.forEach((b, i) => {
      xs[i]?.push(b.x);
      ys[i]?.push(b.y);
      travel[i]?.push(distance[i] ?? 0);
      speedAt[i]?.push(Math.hypot(b.vx, b.vy));
    });
  };
  record();

  let sample = 0;
  const moving = () => bodies.some((b) => b.vx !== 0 || b.vy !== 0);
  while (moving() && sample < maxSamples) {
    sample += 1;
    const atMs = sample * t.sampleMs;
    for (let step = 0; step < t.substeps; step++) {
      bodies.forEach((b, i) => {
        slowDown(b, dt, t);
        const ox = b.x;
        const oy = b.y;
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        const into = hitWalls(b, box, t);
        distance[i] = (distance[i] ?? 0) + Math.hypot(b.x - ox, b.y - oy);
        if (into > t.quietHit) {
          hits.push({ atMs, die: i, kind: 'wall', strength: Math.min(1, into / t.maxSpeed) });
        }
      });
      const [a, b] = bodies;
      if (a && b) {
        const closing = hitDice(a, b, minDistance, t);
        // Pushing apart can move a die past a wall: put both back inside.
        if (closing > 0 || Math.hypot(b.x - a.x, b.y - a.y) < minDistance) {
          for (const body of bodies) {
            body.x = Math.min(box.right, Math.max(box.left, body.x));
            body.y = Math.min(box.bottom, Math.max(box.top, body.y));
          }
        }
        if (closing > t.quietHit) {
          hits.push({ atMs, die: 0, kind: 'dice', strength: Math.min(1, closing / t.maxSpeed) });
        }
      }
    }
    record();
  }

  const samples = sample + 1;
  const dice = [0, 1].map((i): DieTrack => {
    const dist = travel[i] ?? [];
    const total = dist[dist.length - 1] ?? 0;
    const turn = i === 0 ? 1 : -1;
    const tilt = ((input.tilts[i] ?? 0) * Math.PI) / 180;
    const step = dieSize * t.faceEvery;
    const flips = Math.floor(total / step);
    const faces = faceSequence(input.values[i] ?? 1, flips, i * 2 + 1);
    const fastest = Math.max(1, ...(speedAt[i] ?? []));
    return {
      x: xs[i] ?? [],
      y: ys[i] ?? [],
      // Spin counts down to the resting tilt, so the die always stops at `tilt`.
      angle: dist.map((d) => tilt + (turn * (total - d) * t.spin) / dieSize),
      scale: (speedAt[i] ?? []).map((s) => 1 + t.lift * (s / fastest)),
      // Faces count back from the end too: the last flip lands on the value.
      face: dist.map((d) => faces[flips - Math.floor((total - d) / step)] ?? faces[0] ?? 1),
    };
  });

  return {
    durationMs: sample * t.sampleMs,
    sampleMs: t.sampleMs,
    samples,
    dice: [dice[0] as DieTrack, dice[1] as DieTrack],
    hits,
  };
}

/** A plan with no flight: both dice already at rest at `at` (reduced motion). */
export function restPlan(input: PlanThrowInput): ThrowPlan {
  const plan = planThrow(input);
  const last = (a: readonly number[]) => [a[a.length - 1] ?? 0];
  const still = (d: DieTrack): DieTrack => ({
    x: last(d.x),
    y: last(d.y),
    angle: last(d.angle),
    scale: [1],
    face: last(d.face),
  });
  return {
    durationMs: 0,
    sampleMs: plan.sampleMs,
    samples: 1,
    dice: [still(plan.dice[0]), still(plan.dice[1])],
    hits: [],
  };
}

/**
 * When to play a knock (sound and haptic) during a throw, in ms. Hits closer
 * than `minGapMs` to the last knock play as one, so a die that rattles in a
 * corner does not buzz the phone.
 */
export function hitCues(hits: readonly ThrowHit[], minGapMs = 70): number[] {
  const out: number[] = [];
  for (const h of [...hits].sort((a, b) => a.atMs - b.atMs)) {
    const before = out[out.length - 1];
    if (before === undefined || h.atMs - before >= minGapMs) out.push(h.atMs);
  }
  return out;
}

export interface DiePose {
  readonly x: number;
  readonly y: number;
  readonly angle: number;
  readonly scale: number;
  readonly face: number;
}

/** The pose of a die at `ms` into the throw, between two samples. A worklet. */
export function sampleAt(track: DieTrack, sampleMs: number, ms: number): DiePose {
  'worklet';
  const n = track.x.length;
  const at = Math.min(n - 1, Math.max(0, ms / sampleMs));
  const i = Math.floor(at);
  const j = Math.min(n - 1, i + 1);
  const f = at - i;
  const mix = (a: readonly number[]) => (a[i] ?? 0) + ((a[j] ?? 0) - (a[i] ?? 0)) * f;
  return {
    x: mix(track.x),
    y: mix(track.y),
    angle: mix(track.angle),
    scale: mix(track.scale),
    face: track.face[f < 0.5 ? i : j] ?? 1,
  };
}

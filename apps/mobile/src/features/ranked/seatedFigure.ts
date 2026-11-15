/**
 * The player on a ranked table chair: a stick figure in a cap who waits
 * with a komboloi in one hand and a Greek coffee in the other. In each
 * loop the foot taps, the komboloi swings and flips over the hand and back,
 * and then the figure lifts the cup, sips with the head tipped back, and
 * puts it down. Steam rises from the cup while it stands on the saucer.
 *
 * Pure: `figurePose(t)` gives the pose `t` ms into the loop, so the motion
 * is tested without a screen. The points are on the chair's grid in
 * `RankedTable`: x 0 is the back post, the seat top is y 100, and the
 * figure faces +x, the table. The right chair mirrors it.
 */

/** One loop: tap, flip the komboloi and back, then lift the cup, sip, put it down. */
export const FIGURE_LOOP_MS = 7000;
/** One swing of the komboloi, there and back. The loop holds a whole number of them. */
export const SWING_MS = 1000;

/** When the sip starts and how long each part takes. */
const LIFT_AT = 4000;
const LIFT_MS = 800;
const SIP_MS = 1000;

/** The komboloi flips over the hand (forward), then back. */
const FLIP_FORWARD_AT = 1500;
const FLIP_BACK_AT = 2700;
const FLIP_MS = 650;

/** The foot taps twice, impatient. */
const TAP_AT = 300;
const TAP_MS = 450;
const TAPS = 2;
const TAP_LIFT = 3.5;

/** One puff of steam rises in this time; the loop holds a whole number of them. */
export const STEAM_MS = 1750;
const STEAM_RISE = 10;

/** Arm lengths: upper arm and forearm. */
const UPPER_ARM = 17;
const FOREARM = 19;

export const SHOULDER = { x: 15, y: 63 } as const;
/** The neck: the head turns around it. */
export const NECK = { x: 16, y: 59 } as const;
/** The head's center from the neck, and its radius. */
export const HEAD = { x: 2, y: -9, r: 8 } as const;

/** Where the cup's middle stands on the saucer, and where it is at the mouth. */
const CUP_REST = { x: 54, y: 73 } as const;
const CUP_MOUTH = { x: 30, y: 51 } as const;
/** The cup's tilt at the mouth (negative tips the rim to the face), and a little more mid-sip. */
const CUP_TILT = -30;
const SIP_TILT = -10;
/** How far back the head tips while sipping. */
const HEAD_TIP = -12;
/** The hand holds the handle, this far behind the cup's middle. */
const HANDLE = 6;

/** The komboloi hand, over the lap. */
const BEAD_HAND = { x: 26, y: 84 } as const;
/** How far the komboloi swings each way, in radians. */
const SWING = 0.55;
const BEADS = 10;
const BEAD_R = 1.5;

/** The parts that do not move. */
export const FIGURE_PATHS = {
  torso: 'M13 96 L15 63',
  saucer: 'M48 77 H60',
  /** One wisp of steam, from its foot. */
  steam: 'M0 0 Q2 -2 0 -4 Q-2 -6 0 -8',
  /** The cup around its middle; the handle is on the figure's side. */
  cup: {
    body: 'M-4 -3 H4 L3 3 H-3 Z',
    coffee: 'M-4 -3 H4',
    handle: 'M-3.7 -1.5 Q-7 -0.5 -3.4 1.5',
  },
  /** The cap on the head, around the head's center. */
  cap: {
    crown: 'M-8.6 -2.5 Q-8.4 -10.5 0 -10.5 Q7.5 -10.5 8.6 -3.5 Z',
    brim: 'M3 -4 L12.5 -2.6',
  },
  /** The eye and the moustache, around the head's center: the face looks at the table. */
  eye: { x: 4, y: -0.5 },
  moustache: 'M4.5 3.6 Q6.8 5 8.6 3',
} as const;

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface FigurePose {
  /** The head's turn around the neck, in degrees. */
  readonly head: number;
  /** The cup's middle and its tilt in degrees. */
  readonly cup: Point & { readonly tilt: number };
  /** The arm that holds the cup: shoulder, elbow, hand. */
  readonly cupArm: string;
  /** The arm that holds the komboloi. */
  readonly beadArm: string;
  /** The komboloi: its beads and tassel, as one path to fill. */
  readonly beads: string;
  /** Hip, knee, heel and toe: the toe lifts when the foot taps. */
  readonly legs: string;
  /** Two wisps of steam over the cup: where each one's foot is, and how strong it shows. */
  readonly steam: readonly (Point & { readonly opacity: number })[];
}

/** Where the steam rises from: just over the cup on the saucer. */
const STEAM_FEET = [
  { x: 52.5, y: 68 },
  { x: 55.5, y: 68 },
] as const;

/** 0 to 1 with a soft start and end. */
function smooth(u: number): number {
  'worklet';
  const c = Math.min(1, Math.max(0, u));
  return c * c * (3 - 2 * c);
}

/** `t` within one loop. Worklets do not hoist: define helpers before their first use. */
function loopTime(t: number): number {
  'worklet';
  return ((t % FIGURE_LOOP_MS) + FIGURE_LOOP_MS) % FIGURE_LOOP_MS;
}

/** How far the cup is lifted (0 on the saucer, 1 at the mouth) and how deep the sip is. */
export function sipAt(t: number): { lift: number; sip: number } {
  'worklet';
  const m = loopTime(t);
  const held = LIFT_AT + LIFT_MS;
  const down = held + SIP_MS;
  if (m < LIFT_AT) return { lift: 0, sip: 0 };
  if (m < held) return { lift: smooth((m - LIFT_AT) / LIFT_MS), sip: 0 };
  if (m < down) return { lift: 1, sip: Math.sin((Math.PI * (m - held)) / SIP_MS) };
  return { lift: 1 - smooth((m - down) / LIFT_MS), sip: 0 };
}

/**
 * How far the komboloi is through a flip over the hand: 0 to 1 forward,
 * 0 to -1 back, 0 between flips. A whole flip is a whole turn, so the
 * beads end where they started.
 */
export function flipAt(t: number): number {
  'worklet';
  const m = loopTime(t);
  if (m >= FLIP_FORWARD_AT && m < FLIP_FORWARD_AT + FLIP_MS)
    return smooth((m - FLIP_FORWARD_AT) / FLIP_MS);
  if (m >= FLIP_BACK_AT && m < FLIP_BACK_AT + FLIP_MS) return -smooth((m - FLIP_BACK_AT) / FLIP_MS);
  return 0;
}

/**
 * The komboloi's angle from hanging straight down, in radians. Forward
 * (toward the table) is negative. The swing calms while a flip runs.
 */
export function swingAt(t: number): number {
  'worklet';
  const flip = flipAt(t);
  const calm = 1 - Math.sin(Math.PI * Math.abs(flip));
  return SWING * calm * Math.sin((2 * Math.PI * loopTime(t)) / SWING_MS) - 2 * Math.PI * flip;
}

/** How high the toe is off the floor, in grid units. */
export function toeLiftAt(t: number): number {
  'worklet';
  const m = loopTime(t) - TAP_AT;
  if (m < 0 || m >= TAPS * TAP_MS) return 0;
  return TAP_LIFT * Math.sin((Math.PI * (m % TAP_MS)) / TAP_MS);
}

/**
 * The elbow for a hand: two bones from the shoulder, bent so the elbow
 * points down. A hand out of reach gets the arm straight toward it.
 */
export function elbowFor(shoulder: Point, hand: Point): Point {
  'worklet';
  const dx = hand.x - shoulder.x;
  const dy = hand.y - shoulder.y;
  const reach = Math.min(
    UPPER_ARM + FOREARM - 0.01,
    Math.max(Math.abs(UPPER_ARM - FOREARM) + 0.01, Math.hypot(dx, dy)),
  );
  const cos = (UPPER_ARM * UPPER_ARM + reach * reach - FOREARM * FOREARM) / (2 * UPPER_ARM * reach);
  const angle = Math.atan2(dy, dx) + Math.acos(Math.min(1, Math.max(-1, cos)));
  return {
    x: shoulder.x + UPPER_ARM * Math.cos(angle),
    y: shoulder.y + UPPER_ARM * Math.sin(angle),
  };
}

function armPath(hand: Point): string {
  'worklet';
  const elbow = elbowFor(SHOULDER, hand);
  return `M${SHOULDER.x} ${SHOULDER.y} L${elbow.x.toFixed(2)} ${elbow.y.toFixed(2)} L${hand.x.toFixed(2)} ${hand.y.toFixed(2)}`;
}

/** The beads in a loop that hangs from the hand, turned by `angle`, and the tassel under them. */
export function beadsPath(hand: Point, angle: number): string {
  'worklet';
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const at = (lx: number, ly: number) => ({
    x: hand.x + lx * cos - ly * sin,
    y: hand.y + lx * sin + ly * cos,
  });
  const parts: string[] = [];
  for (let i = 0; i < BEADS; i++) {
    const a = (2 * Math.PI * i) / BEADS;
    const p = at(4 * Math.sin(a), 1.5 + 7 * (1 - Math.cos(a)));
    parts.push(
      `M${(p.x - BEAD_R).toFixed(2)} ${p.y.toFixed(2)} a${BEAD_R} ${BEAD_R} 0 1 0 ${2 * BEAD_R} 0 a${BEAD_R} ${BEAD_R} 0 1 0 ${-2 * BEAD_R} 0 Z`,
    );
  }
  const left = at(-1.3, 16.5);
  const right = at(1.3, 16.5);
  const tip = at(0, 21);
  parts.push(
    `M${left.x.toFixed(2)} ${left.y.toFixed(2)} L${right.x.toFixed(2)} ${right.y.toFixed(2)} L${tip.x.toFixed(2)} ${tip.y.toFixed(2)} Z`,
  );
  return parts.join(' ');
}

/** The whole pose at `t` ms into the loop. */
export function figurePose(t: number): FigurePose {
  'worklet';
  const { lift, sip } = sipAt(t);
  // At rest both are a plain 0 (not -0).
  const tilt = lift === 0 ? 0 : CUP_TILT * lift + SIP_TILT * sip;
  const cup = {
    x: CUP_REST.x + (CUP_MOUTH.x - CUP_REST.x) * lift,
    y: CUP_REST.y + (CUP_MOUTH.y - CUP_REST.y) * lift,
    tilt,
  };
  const rad = (tilt * Math.PI) / 180;
  const cupHand = { x: cup.x - HANDLE * Math.cos(rad), y: cup.y - HANDLE * Math.sin(rad) };
  const angle = swingAt(t);
  // The hand moves a little with the swing, and flicks up to start a flip.
  const flick = Math.sin(Math.PI * Math.abs(flipAt(t)));
  const beadHand = { x: BEAD_HAND.x - 1.2 * Math.sin(angle), y: BEAD_HAND.y - 3 * flick };
  const toe = toeLiftAt(t);
  // The steam is gone by the time the cup is a quarter of the way up.
  const steamy = (1 - Math.min(1, 4 * lift)) ** 2;
  const m = loopTime(t);
  const steam = STEAM_FEET.map((foot, i) => {
    const p = ((m + (i * STEAM_MS) / 2) % STEAM_MS) / STEAM_MS;
    return {
      x: foot.x + 1.2 * Math.sin(2 * Math.PI * p),
      y: foot.y - STEAM_RISE * p,
      opacity: 0.6 * Math.sin(Math.PI * p) * steamy,
    };
  });
  return {
    head: lift === 0 ? 0 : HEAD_TIP * lift,
    cup,
    cupArm: armPath(cupHand),
    beadArm: armPath(beadHand),
    beads: beadsPath(beadHand, angle),
    legs: `M13 96 L33 95 L37 147 L${(44 - 0.3 * toe).toFixed(2)} ${(148 - toe).toFixed(2)}`,
    steam,
  };
}

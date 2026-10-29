import {
  PAIR_GAP,
  THROW_TUNING,
  buttonThrow,
  clampSpeed,
  dampSpeed,
  entryPoint,
  faceSequence,
  hitCues,
  offBar,
  planThrow,
  reflect,
  restPlan,
  sampleAt,
  shrinkBox,
  stopTime,
  swipeToThrow,
  throwBox,
  type Box,
  type PlanThrowInput,
  type ThrowBar,
  type ThrowPlan,
} from './throwPath';

const BOX: Box = { left: 40, top: 300, right: 320, bottom: 520 };
const DIE = 30;

function input(over: Partial<PlanThrowInput> = {}): PlanThrowInput {
  return {
    box: BOX,
    start: { at: { x: 180, y: 510 }, velocity: { x: 500, y: -1800 } },
    dieSize: DIE,
    values: [5, 3],
    tilts: [-11, 9],
    ...over,
  };
}

const last = (a: readonly number[]) => a[a.length - 1];

function everyPose(plan: ThrowPlan, check: (x: number, y: number) => void) {
  for (const d of plan.dice) d.x.forEach((x, i) => check(x, d.y[i] ?? NaN));
}

describe('reflect', () => {
  it('flips the speed into the wall and keeps the speed along it', () => {
    expect(reflect({ x: -100, y: 40 }, { x: 1, y: 0 }, 1)).toEqual({ x: 100, y: 40 });
  });

  it('keeps only `restitution` of the speed into the wall and `grip` along it', () => {
    const v = reflect({ x: 30, y: 200 }, { x: 0, y: -1 }, 0.5, 0.8);
    expect(v.x).toBeCloseTo(24);
    expect(v.y).toBeCloseTo(-100);
  });

  it('leaves a die that already moves away from the wall alone', () => {
    expect(reflect({ x: 50, y: 0 }, { x: 1, y: 0 }, 0.5, 0.5)).toEqual({ x: 50, y: 0 });
  });
});

describe('dampSpeed and stopTime', () => {
  const { drag, friction } = THROW_TUNING;

  it('slows a die down and never goes below 0', () => {
    const a = dampSpeed(1000, 0.1, drag, friction);
    expect(a).toBeLessThan(1000);
    expect(a).toBeGreaterThan(0);
    expect(dampSpeed(10, 5, drag, friction)).toBe(0);
    expect(dampSpeed(0, 1, drag, friction)).toBe(0);
  });

  it('is the same in one step or in many', () => {
    let s = 1500;
    for (let i = 0; i < 10; i++) s = dampSpeed(s, 0.03, drag, friction);
    expect(s).toBeCloseTo(dampSpeed(1500, 0.3, drag, friction), 6);
  });

  it('stops exactly at stopTime', () => {
    const t = stopTime(2000, drag, friction);
    expect(dampSpeed(2000, t - 0.01, drag, friction)).toBeGreaterThan(0);
    expect(dampSpeed(2000, t + 1e-9, drag, friction)).toBe(0);
  });

  it('handles no drag and no friction', () => {
    expect(stopTime(100, 0, 50)).toBe(2);
    expect(dampSpeed(100, 1, 0, 50)).toBe(50);
    expect(stopTime(100, 1, 0)).toBe(Infinity);
    expect(stopTime(0, 1, 1)).toBe(0);
  });

  it('stops the fastest throw in under two and a half seconds, before the hard limit', () => {
    expect(stopTime(THROW_TUNING.maxSpeed, drag, friction)).toBeLessThan(2.5);
    expect(stopTime(THROW_TUNING.maxSpeed, drag, friction) * 1000).toBeLessThan(THROW_TUNING.maxMs);
  });
});

describe('clampSpeed', () => {
  it('keeps the direction and clamps the length', () => {
    const v = clampSpeed({ x: 3000, y: 4000 }, 100, 1000);
    expect(Math.hypot(v.x, v.y)).toBeCloseTo(1000);
    expect(v.x / v.y).toBeCloseTo(0.75);
    expect(Math.hypot(...Object.values(clampSpeed({ x: 0, y: 10 }, 100, 1000)))).toBeCloseTo(100);
  });

  it('throws a zero swipe straight up at the slowest speed', () => {
    expect(clampSpeed({ x: 0, y: 0 }, 100, 1000)).toEqual({ x: 0, y: -100 });
  });
});

describe('throwBox', () => {
  it('keeps a die inside the field', () => {
    expect(throwBox({ x: 10, y: 20, width: 300, height: 200 }, 20)).toEqual({
      left: 22,
      top: 32,
      right: 298,
      bottom: 208,
    });
  });

  it('puts every die in the middle of a field smaller than a die', () => {
    expect(throwBox({ x: 0, y: 0, width: 10, height: 10 }, 40)).toEqual({
      left: 5,
      right: 5,
      top: 5,
      bottom: 5,
    });
  });
});

describe('shrinkBox', () => {
  it('shrinks the sides and the ends, never past the middle', () => {
    expect(shrinkBox(BOX, 10, 20)).toEqual({ left: 50, right: 310, top: 320, bottom: 500 });
    expect(shrinkBox(BOX, 500, 500)).toEqual({ left: 180, right: 180, top: 410, bottom: 410 });
  });
});

describe('entryPoint', () => {
  // BOX: the middle is (180, 410); half width 140, half height 110.
  it('starts a throw on the wall behind it, on the line through the middle', () => {
    expect(entryPoint(BOX, { x: 0, y: -1 })).toEqual({ x: 180, y: 520 });
    expect(entryPoint(BOX, { x: 0, y: 5 })).toEqual({ x: 180, y: 300 });
    expect(entryPoint(BOX, { x: 2, y: 0 })).toEqual({ x: 40, y: 410 });
    expect(entryPoint(BOX, { x: -2, y: 0 })).toEqual({ x: 320, y: 410 });
    // Up and to the right: the line meets the near wall 110 to the left of the middle.
    const diagonal = entryPoint(BOX, { x: 1, y: -1 });
    expect(diagonal.x).toBeCloseTo(70);
    expect(diagonal.y).toBeCloseTo(520);
  });

  it('starts with no direction at the middle of the near wall', () => {
    expect(entryPoint(BOX, { x: 0, y: 0 })).toEqual({ x: 180, y: 520 });
  });

  it('starts in the middle of a box with no room', () => {
    const dot: Box = { left: 100, right: 100, top: 200, bottom: 200 };
    expect(entryPoint(dot, { x: 3, y: -4 })).toEqual({ x: 100, y: 200 });
  });
});

describe('swipeToThrow', () => {
  it('takes the direction from the whole swipe and the speed from the finger', () => {
    // The finger went up and to the right, then flicked straight up at the end.
    const t = swipeToThrow({ x: 60, y: -80 }, { x: 0, y: -700 }, BOX, DIE);
    expect(Math.hypot(t.velocity.x, t.velocity.y)).toBeCloseTo(700);
    expect(t.velocity.x / t.velocity.y).toBeCloseTo(60 / -80);
  });

  it('starts at the wall behind the throw, not where the finger was', () => {
    // Straight up: the middle of the near wall, so the dice cross the whole field.
    const up = swipeToThrow({ x: 0, y: -60 }, { x: 0, y: -1500 }, BOX, DIE);
    expect(up.at).toEqual({ x: 180, y: 520 });
    // To the right: the middle of the left wall.
    const right = swipeToThrow({ x: 50, y: 0 }, { x: 1000, y: 0 }, BOX, DIE);
    expect(right.at).toEqual({ x: 40, y: 410 });
  });

  it('leaves room for both dice on a corner throw', () => {
    const start = swipeToThrow({ x: 140, y: -110 }, undefined, BOX, DIE);
    const plan = planThrow(input({ start }));
    const [a, b] = plan.dice;
    // Side by side at PAIR_GAP from the middle, so no die was pushed back inside.
    const apart = Math.hypot((a.x[0] ?? 0) - (b.x[0] ?? 0), (a.y[0] ?? 0) - (b.y[0] ?? 0));
    expect(apart).toBeCloseTo(2 * DIE * PAIR_GAP);
    for (const d of plan.dice) {
      expect(d.x[0]).toBeGreaterThanOrEqual(BOX.left);
      expect(d.x[0]).toBeLessThanOrEqual(BOX.right);
      expect(d.y[0]).toBeGreaterThanOrEqual(BOX.top);
      expect(d.y[0]).toBeLessThanOrEqual(BOX.bottom);
    }
  });

  it('works out the speed from the swipe when there is no velocity', () => {
    const t = swipeToThrow({ x: 0, y: -90 }, undefined, BOX, DIE);
    expect(t.velocity.x).toBeCloseTo(0);
    expect(t.velocity.y).toBeCloseTo(-600);
    const nan = swipeToThrow({ x: 90, y: 0 }, { x: NaN, y: NaN }, BOX, DIE);
    expect(nan.velocity.x).toBeCloseTo(600);
  });

  it('uses the finger velocity with no swipe, and throws straight up with neither', () => {
    const flick = swipeToThrow({ x: 0, y: 0 }, { x: 700, y: 0 }, BOX, DIE);
    expect(flick).toEqual({ at: { x: 40, y: 410 }, velocity: { x: 700, y: 0 } });
    const none = swipeToThrow({ x: 0, y: 0 }, undefined, BOX, DIE);
    expect(none.at).toEqual({ x: 180, y: 520 });
    expect(none.velocity.x).toBeCloseTo(0);
    expect(none.velocity.y).toBeCloseTo(-THROW_TUNING.minSpeed);
  });

  it('clamps a slow drag and a wild flick', () => {
    const slow = swipeToThrow({ x: 10, y: 0 }, { x: 10, y: 0 }, BOX, DIE);
    expect(Math.hypot(slow.velocity.x, slow.velocity.y)).toBeCloseTo(THROW_TUNING.minSpeed);
    const wild = swipeToThrow({ x: 0, y: -10 }, { x: 0, y: -9000 }, BOX, DIE);
    expect(Math.hypot(wild.velocity.x, wild.velocity.y)).toBeCloseTo(THROW_TUNING.maxSpeed);
  });
});

describe('buttonThrow', () => {
  it('throws up from the near wall, to the other side each time', () => {
    const a = buttonThrow(BOX, 0);
    const b = buttonThrow(BOX, 1);
    expect(a.at.y).toBe(BOX.bottom);
    expect(a.velocity.y).toBeLessThan(0);
    expect(Math.sign(a.velocity.x)).toBe(-Math.sign(b.velocity.x));
  });
});

describe('faceSequence', () => {
  it('ends on the value', () => {
    for (let v = 1; v <= 6; v++) expect(last(faceSequence(v, 7, 1))).toBe(v);
  });

  it('never shows the same or the opposite face twice in a row', () => {
    for (let v = 1; v <= 6; v++) {
      const faces = faceSequence(v, 12, v);
      expect(faces).toHaveLength(13);
      for (let i = 1; i < faces.length; i++) {
        expect(faces[i]).not.toBe(faces[i - 1]);
        expect((faces[i] ?? 0) + (faces[i - 1] ?? 0)).not.toBe(7);
      }
    }
  });

  it('is just the value with no flips', () => {
    expect(faceSequence(4, 0, 3)).toEqual([4]);
  });
});

describe('planThrow', () => {
  it('lands on the rolled values, at the resting tilt, at normal size', () => {
    for (const values of [
      [1, 1],
      [6, 2],
      [3, 4],
    ] as const) {
      const plan = planThrow(input({ values }));
      plan.dice.forEach((d, i) => {
        expect(last(d.face)).toBe(values[i]);
        expect(last(d.angle)).toBeCloseTo(([-11, 9][i]! * Math.PI) / 180);
        expect(last(d.scale)).toBeCloseTo(1);
      });
    }
  });

  it('keeps both dice inside the box the whole time', () => {
    for (const velocity of [
      { x: 2600, y: 0 },
      { x: -1800, y: -1800 },
      { x: 300, y: -2600 },
      { x: 0, y: 2000 },
    ]) {
      const plan = planThrow(input({ start: { at: { x: 180, y: 400 }, velocity } }));
      everyPose(plan, (x, y) => {
        expect(x).toBeGreaterThanOrEqual(BOX.left - 1e-9);
        expect(x).toBeLessThanOrEqual(BOX.right + 1e-9);
        expect(y).toBeGreaterThanOrEqual(BOX.top - 1e-9);
        expect(y).toBeLessThanOrEqual(BOX.bottom + 1e-9);
      });
    }
  });

  it('bounces off the far wall on a hard throw, and the hit is in the plan', () => {
    const plan = planThrow(
      input({ start: { at: { x: 180, y: 510 }, velocity: { x: 0, y: -2600 } } }),
    );
    const wall = plan.hits.filter((h) => h.kind === 'wall');
    expect(wall.length).toBeGreaterThan(0);
    expect(wall[0]!.atMs).toBeGreaterThan(0);
    expect(wall[0]!.atMs).toBeLessThan(plan.durationMs);
    for (const h of plan.hits) {
      expect(h.strength).toBeGreaterThan(0);
      expect(h.strength).toBeLessThanOrEqual(1);
    }
    // After the bounce the die moves down again.
    const y = plan.dice[0].y;
    const top = Math.min(...y);
    expect(top).toBeLessThan(BOX.top + 15);
    expect(last(y)!).toBeGreaterThan(top);
  });

  it('has no hits on the softest throw down the middle', () => {
    const velocity = { x: 0, y: -THROW_TUNING.minSpeed };
    const plan = planThrow(input({ start: { at: { x: 180, y: 510 }, velocity } }));
    expect(plan.hits).toEqual([]);
  });

  it('leaves the dice apart at rest', () => {
    for (const velocity of [
      { x: 2600, y: 0 },
      { x: -900, y: -2400 },
      { x: 10, y: -2600 },
    ]) {
      const plan = planThrow(input({ start: { at: { x: 180, y: 400 }, velocity } }));
      const [a, b] = plan.dice;
      const d = Math.hypot(last(a.x)! - last(b.x)!, last(a.y)! - last(b.y)!);
      expect(d).toBeGreaterThanOrEqual(DIE);
    }
  });

  it('stops before the hard limit, and a faster throw takes longer', () => {
    const soft = planThrow(
      input({ start: { at: { x: 180, y: 510 }, velocity: { x: 0, y: -700 } } }),
    );
    const hard = planThrow(input());
    expect(soft.durationMs).toBeGreaterThan(0);
    expect(hard.durationMs).toBeGreaterThan(soft.durationMs);
    expect(hard.durationMs).toBeLessThan(THROW_TUNING.maxMs);
    expect(hard.samples).toBe(Math.round(hard.durationMs / hard.sampleMs) + 1);
    for (const d of hard.dice) {
      for (const track of [d.x, d.y, d.angle, d.scale, d.face])
        expect(track).toHaveLength(hard.samples);
    }
  });

  it('is the same plan for the same input (no randomness)', () => {
    expect(planThrow(input())).toEqual(planThrow(input()));
  });

  it('cuts a throw off at maxMs', () => {
    const tuning = { ...THROW_TUNING, friction: 0, drag: 0, maxMs: 500 };
    const plan = planThrow(input({ tuning }));
    expect(plan.durationMs).toBeCloseTo(500, 0);
  });
});

describe('restPlan', () => {
  it('shows the dice where the throw would stop, with no flight and no hits', () => {
    const full = planThrow(input());
    const rest = restPlan(input());
    expect(rest.durationMs).toBe(0);
    expect(rest.hits).toEqual([]);
    rest.dice.forEach((d, i) => {
      expect(d.x).toEqual([last(full.dice[i]!.x)]);
      expect(d.face).toEqual([[5, 3][i]]);
    });
  });
});

describe('sampleAt', () => {
  const track = {
    x: [0, 10, 20],
    y: [0, 0, 10],
    angle: [0, 1, 2],
    scale: [1.2, 1.1, 1],
    face: [2, 3, 5],
  };

  it('mixes two samples', () => {
    const p = sampleAt(track, 10, 15);
    expect(p.x).toBeCloseTo(15);
    expect(p.y).toBeCloseTo(5);
    expect(p.face).toBe(5);
    expect(sampleAt(track, 10, 12).face).toBe(3);
  });

  it('holds the first and the last pose outside the throw', () => {
    expect(sampleAt(track, 10, -5).x).toBe(0);
    expect(sampleAt(track, 10, 999)).toEqual({ x: 20, y: 10, angle: 2, scale: 1, face: 5 });
  });
});

describe('hitCues', () => {
  const hit = (atMs: number) => ({ atMs, die: 0, kind: 'wall' as const, strength: 0.5 });

  it('plays one knock for hits close together, in time order', () => {
    expect(hitCues([hit(300), hit(100), hit(120), hit(169), hit(171)])).toEqual([100, 171, 300]);
  });

  it('plays nothing for a throw with no hits', () => {
    expect(hitCues([])).toEqual([]);
  });
});

// The bar: a raised divider between two fields. BOX is 300..520 tall; the gap
// is 400..420, and a die (30) over any part of it is in the zone 385..435.
const BAR: ThrowBar = { axis: 'y', from: 400, to: 420, shelter: 460 };
const ZONE = { lo: BAR.from - DIE / 2, hi: BAR.to + DIE / 2 };
const onBar = (y: number) => y > ZONE.lo && y < ZONE.hi;

describe('the bar between the fields', () => {
  const up = (speed: number, over: Partial<PlanThrowInput> = {}) =>
    planThrow(
      input({
        bar: BAR,
        start: { at: { x: 180, y: 510 }, velocity: { x: 0, y: -speed } },
        ...over,
      }),
    );

  it('hops a fast die over the bar: it lifts, then lands on the other side', () => {
    const plan = up(1200);
    for (const d of plan.dice) {
      expect(last(d.y)!).toBeLessThan(ZONE.lo);
      // At the top of the hop the die is bigger than any speed alone makes it.
      const lifted = d.scale.some((s) => s > 1 + THROW_TUNING.lift + 0.05);
      expect(lifted).toBe(true);
    }
    expect(plan.hits.some((h) => h.kind === 'bar')).toBe(true);
  });

  it('bounces a slow die off the bar, on the side it came from', () => {
    const tuning = { ...THROW_TUNING, hopSpeed: 100000 };
    const plan = up(1200, { tuning });
    for (const d of plan.dice) {
      expect(last(d.y)!).toBeGreaterThanOrEqual(ZONE.hi);
      d.y.forEach((y) => expect(onBar(y)).toBe(false));
    }
    expect(plan.hits.some((h) => h.kind === 'wall')).toBe(true);
    expect(plan.hits.some((h) => h.kind === 'bar')).toBe(false);
  });

  it('never leaves a die on the bar, whatever the throw', () => {
    for (const speed of [450, 700, 1000, 1200]) {
      for (const x of [-500, -150, 0, 150, 500]) {
        const plan = up(speed, {
          start: { at: { x: 180, y: 510 }, velocity: { x, y: -speed } },
        });
        for (const d of plan.dice) expect(onBar(last(d.y)!)).toBe(false);
      }
    }
  });

  it('keeps a die that starts on the bar from resting on it', () => {
    const plan = planThrow(
      input({
        bar: BAR,
        start: { at: { x: 100, y: 410 }, velocity: { x: 900, y: 0 } },
      }),
    );
    for (const d of plan.dice) expect(onBar(last(d.y)!)).toBe(false);
  });

  it('keeps a die at normal size at rest, and the plan without a bar as before', () => {
    const plan = up(1200);
    for (const d of plan.dice) expect(last(d.scale)).toBeCloseTo(1);
    expect(planThrow(input())).toEqual(planThrow(input({ bar: undefined })));
  });
});

describe('offBar', () => {
  it('moves a start on the bar to the shelter, and leaves other starts alone', () => {
    const room = { left: 40, top: 300, right: 320, bottom: 520 };
    expect(offBar({ x: 40, y: 410 }, room, BAR, DIE)).toEqual({ x: 40, y: 460 });
    expect(offBar({ x: 180, y: 520 }, room, BAR, DIE)).toEqual({ x: 180, y: 520 });
    expect(offBar({ x: 40, y: 410 }, room, undefined, DIE)).toEqual({ x: 40, y: 410 });
    const upright: ThrowBar = { axis: 'x', from: 170, to: 190, shelter: 250 };
    expect(offBar({ x: 180, y: 520 }, room, upright, DIE)).toEqual({ x: 250, y: 520 });
  });

  it('starts a swipe along the bar in the field, not on the bar', () => {
    // BOX middle is y 410: a sideways swipe would run along the bar.
    const flat = swipeToThrow({ x: 120, y: 0 }, { x: 1000, y: 0 }, BOX, DIE, BAR);
    expect(flat.at.y).toBe(BAR.shelter);
    expect(flat.at.x).toBe(BOX.left); // the wall behind the throw
    // Straight up still starts at the near wall, away from the bar.
    const upward = swipeToThrow({ x: 0, y: -90 }, { x: 0, y: -900 }, BOX, DIE, BAR);
    expect(upward.at).toEqual({ x: 180, y: 520 });
  });
});

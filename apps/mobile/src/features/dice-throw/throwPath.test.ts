import {
  THROW_TUNING,
  buttonThrow,
  clampSpeed,
  dampSpeed,
  faceSequence,
  hitCues,
  planThrow,
  reflect,
  restPlan,
  sampleAt,
  stopTime,
  swipeToThrow,
  throwBox,
  type Box,
  type PlanThrowInput,
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

  it('stops the fastest throw in well under two seconds', () => {
    expect(stopTime(THROW_TUNING.maxSpeed, drag, friction)).toBeLessThan(1.2);
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

describe('swipeToThrow', () => {
  it('uses the finger speed and starts where the finger let go', () => {
    const t = swipeToThrow({ x: 100, y: 400 }, { x: 0, y: -1500 }, { x: 0, y: -60 }, BOX);
    expect(t).toEqual({ at: { x: 100, y: 400 }, velocity: { x: 0, y: -1500 } });
  });

  it('starts inside the field when the finger let go outside it', () => {
    const t = swipeToThrow({ x: 0, y: 900 }, { x: 1000, y: 0 }, { x: 50, y: 0 }, BOX);
    expect(t.at).toEqual({ x: BOX.left, y: BOX.bottom });
  });

  it('works out the speed from the swipe when there is no velocity', () => {
    const t = swipeToThrow({ x: 100, y: 400 }, undefined, { x: 0, y: -150 }, BOX);
    expect(t.velocity.x).toBeCloseTo(0);
    expect(t.velocity.y).toBeCloseTo(-1000);
    const nan = swipeToThrow({ x: 100, y: 400 }, { x: NaN, y: NaN }, { x: 150, y: 0 }, BOX);
    expect(nan.velocity.x).toBeCloseTo(1000);
  });

  it('clamps a slow drag and a wild flick', () => {
    const slow = swipeToThrow({ x: 100, y: 400 }, { x: 10, y: 0 }, { x: 10, y: 0 }, BOX);
    expect(Math.hypot(slow.velocity.x, slow.velocity.y)).toBeCloseTo(THROW_TUNING.minSpeed);
    const wild = swipeToThrow({ x: 100, y: 400 }, { x: 0, y: -9000 }, { x: 0, y: -10 }, BOX);
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
    const plan = planThrow(input({ start: { at: { x: 180, y: 510 }, velocity: { x: 0, y: -2600 } } }));
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

  it('has no hits on a soft throw down the middle', () => {
    const plan = planThrow(input({ start: { at: { x: 180, y: 510 }, velocity: { x: 0, y: -600 } } }));
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
    const soft = planThrow(input({ start: { at: { x: 180, y: 510 }, velocity: { x: 0, y: -700 } } }));
    const hard = planThrow(input());
    expect(soft.durationMs).toBeGreaterThan(0);
    expect(hard.durationMs).toBeGreaterThan(soft.durationMs);
    expect(hard.durationMs).toBeLessThan(THROW_TUNING.maxMs);
    expect(hard.samples).toBe(Math.round(hard.durationMs / hard.sampleMs) + 1);
    for (const d of hard.dice) {
      for (const track of [d.x, d.y, d.angle, d.scale, d.face]) expect(track).toHaveLength(hard.samples);
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
  const track = { x: [0, 10, 20], y: [0, 0, 10], angle: [0, 1, 2], scale: [1.2, 1.1, 1], face: [2, 3, 5] };

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

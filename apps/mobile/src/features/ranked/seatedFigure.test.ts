import {
  elbowFor,
  FIGURE_LOOP_MS,
  figurePose,
  flipAt,
  SHOULDER,
  sipAt,
  STEAM_MS,
  SWING_MS,
  swingAt,
  toeLiftAt,
  type Point,
} from './seatedFigure';

const handOf = (arm: string): Point => {
  const [x, y] = arm.split(' L').at(-1)!.split(' ').map(Number);
  return { x: x!, y: y! };
};

describe('the seated figure', () => {
  it('rests with the cup on the saucer, then lifts it to sip and puts it back', () => {
    expect(sipAt(0)).toEqual({ lift: 0, sip: 0 });
    expect(figurePose(0).head).toBe(0);
    expect(figurePose(0).cup).toEqual({ x: 54, y: 73, tilt: 0 });

    const sipping = figurePose(5300);
    expect(sipAt(5300).lift).toBe(1);
    expect(sipAt(5300).sip).toBeCloseTo(1);
    expect(sipping.head).toBe(-12);
    expect(sipping.cup.x).toBe(30);
    expect(sipping.cup.tilt).toBeCloseTo(-40);

    expect(sipAt(FIGURE_LOOP_MS - 1).lift).toBe(0);
  });

  it('loops with no jump: the end of the loop is its start', () => {
    expect(FIGURE_LOOP_MS % SWING_MS).toBe(0);
    expect(FIGURE_LOOP_MS % STEAM_MS).toBe(0);
    expect(figurePose(FIGURE_LOOP_MS)).toEqual(figurePose(0));
  });

  it('keeps the arm bones the same length, with the elbow bent down', () => {
    for (let t = 0; t < FIGURE_LOOP_MS; t += 50) {
      const pose = figurePose(t);
      for (const arm of [pose.cupArm, pose.beadArm]) {
        const hand = handOf(arm);
        const elbow = elbowFor(SHOULDER, hand);
        expect(Math.hypot(elbow.x - SHOULDER.x, elbow.y - SHOULDER.y)).toBeCloseTo(17);
        expect(Math.hypot(hand.x - elbow.x, hand.y - elbow.y)).toBeCloseTo(19, 1);
        // The elbow is on the clockwise side of the line from shoulder to hand: below it.
        const cross =
          (hand.x - SHOULDER.x) * (elbow.y - SHOULDER.y) -
          (hand.y - SHOULDER.y) * (elbow.x - SHOULDER.x);
        expect(cross).toBeGreaterThan(0);
      }
    }
  });

  it('swings the komboloi both ways', () => {
    const beads = [0, SWING_MS / 4, (3 * SWING_MS) / 4].map((t) => figurePose(t).beads);
    expect(new Set(beads).size).toBe(3);
  });

  it('flips the komboloi a whole turn forward, then a whole turn back, before the sip', () => {
    const flips: number[] = [];
    for (let t = 0; t < FIGURE_LOOP_MS; t += 10) flips.push(flipAt(t));
    expect(Math.max(...flips)).toBeGreaterThan(0.99);
    expect(Math.min(...flips)).toBeLessThan(-0.99);
    // No flip while the cup is lifted.
    for (let t = 0; t < FIGURE_LOOP_MS; t += 10) {
      if (sipAt(t).lift > 0) expect(flipAt(t)).toBe(0);
    }
    // Forward is toward the table: the angle goes negative.
    expect(swingAt(1500 + 325)).toBeLessThan(-Math.PI / 2);
  });

  it('taps the foot twice, then keeps it on the floor', () => {
    const lifted: number[] = [];
    for (let t = 0; t < FIGURE_LOOP_MS; t += 10) if (toeLiftAt(t) > 3) lifted.push(t);
    expect(lifted.length).toBeGreaterThan(0);
    // Two taps: two runs of lifted times.
    const runs = lifted.filter((t, i) => i === 0 || t - lifted[i - 1]! > 10).length;
    expect(runs).toBe(2);
    expect(figurePose(0).legs).toBe('M13 96 L33 95 L37 147 L44.00 148.00');
  });

  it('shows steam over the cup on the saucer, and none while sipping', () => {
    expect(Math.max(...figurePose(0).steam.map((w) => w.opacity))).toBeGreaterThan(0.3);
    for (const wisp of figurePose(5300).steam) expect(wisp.opacity).toBeCloseTo(0);
  });
});

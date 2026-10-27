import {
  DICE_LAND_MS,
  DIE_SIZE,
  DOUBLE_SHOWN_MS,
  DOUBLE_SPLIT_AT_MS,
  ROLL_MS,
  ROLL_STAGGER_MS,
  dicePlaces,
  doublePlaces,
  tumble,
  tumbleFace,
} from './diceMotion';

describe('tumble', () => {
  it('lands at rest: no hop, the resting tilt, full size', () => {
    const end = tumble(1, 0, 44, -11);
    expect(end.dy).toBeCloseTo(0, 9);
    expect(end.rotate).toBeCloseTo((-11 * Math.PI) / 180, 9);
    expect(end.scale).toBe(1);
  });

  it('starts small and spun, and neighbors spin the other way', () => {
    const a = tumble(0, 0, 44, 0);
    const b = tumble(0, 1, 44, 0);
    expect(a.scale).toBeLessThan(1);
    expect(a.rotate).toBeGreaterThan(0);
    expect(b.rotate).toBeLessThan(0);
  });

  it('hops up, never down', () => {
    for (let p = 0; p <= 1; p += 0.05) expect(tumble(p, 0, 44, 0).dy).toBeLessThanOrEqual(0);
  });

  it('clamps progress', () => {
    expect(tumble(2, 0, 44, 9)).toEqual(tumble(1, 0, 44, 9));
  });
});

describe('tumbleFace', () => {
  it('always lands on the engine value', () => {
    for (let v = 1; v <= 6; v++) {
      expect(tumbleFace(0.78, 0, v)).toBe(v);
      expect(tumbleFace(1, 1, v)).toBe(v);
    }
  });

  it('flips through the other faces first, the same way every time', () => {
    const seen = new Set<number>();
    for (let p = 0; p < 0.78; p += 0.01) {
      const face = tumbleFace(p, 0, 4);
      expect(face).not.toBe(4);
      expect(face).toBe(tumbleFace(p, 0, 4));
      seen.add(face);
    }
    expect(seen.size).toBe(5);
  });
});

describe('dicePlaces', () => {
  it('puts two dice side by side', () => {
    const { places, width, height } = dicePlaces(2);
    expect(places).toHaveLength(2);
    expect(places[0]!.y).toBe(places[1]!.y);
    expect(places[1]!.x - places[0]!.x).toBeGreaterThan(DIE_SIZE);
    for (const p of places) {
      expect(p.x - p.size / 2).toBeGreaterThan(0);
      expect(p.x + p.size / 2).toBeLessThan(width);
      expect(p.y + p.size / 2).toBeLessThan(height);
    }
  });

  it('puts four smaller dice in a 2 x 2 grid for a double', () => {
    const { places, width, height } = dicePlaces(4);
    expect(places).toHaveLength(4);
    expect(places[0]!.size).toBeLessThan(DIE_SIZE);
    expect(places[0]!.y).toBe(places[1]!.y);
    expect(places[2]!.y).toBeGreaterThan(places[0]!.y);
    expect(places[2]!.x).toBe(places[0]!.x);
    for (const p of places) {
      expect(p.x - p.size / 2).toBeGreaterThan(0);
      expect(p.x + p.size / 2).toBeLessThan(width);
      expect(p.y - p.size / 2).toBeGreaterThan(0);
      expect(p.y + p.size / 2).toBeLessThan(height);
    }
  });

  it('holds the pair and the grid of a double in one box (#177)', () => {
    const { pair, grid, width, height } = doublePlaces();
    const two = dicePlaces(2);
    // The pair looks like any roll: full size, side by side.
    expect(pair.map((p) => p.size)).toEqual([DIE_SIZE, DIE_SIZE]);
    expect(pair[1].x - pair[0].x).toBe(two.places[1]!.x - two.places[0]!.x);
    expect(pair[0].y).toBe(pair[1].y);
    expect(dicePlaces(4)).toEqual({ places: grid, width, height });
    for (const p of [...pair, ...grid]) {
      expect(p.x - p.size / 2).toBeGreaterThan(0);
      expect(p.x + p.size / 2).toBeLessThan(width);
      expect(p.y - p.size / 2).toBeGreaterThan(0);
      expect(p.y + p.size / 2).toBeLessThan(height);
    }
  });

  it('shows one die (opening roll)', () => {
    expect(dicePlaces(1).places).toHaveLength(1);
  });
});

describe('the timing of a double (#177)', () => {
  it('lands the two dice, waits a beat, then splits', () => {
    expect(DICE_LAND_MS).toBe(ROLL_MS + ROLL_STAGGER_MS);
    // "After a short beat (about 600 ms)."
    expect(DOUBLE_SPLIT_AT_MS - DICE_LAND_MS).toBeGreaterThanOrEqual(500);
    expect(DOUBLE_SPLIT_AT_MS - DICE_LAND_MS).toBeLessThanOrEqual(700);
    expect(DOUBLE_SHOWN_MS).toBeGreaterThan(DOUBLE_SPLIT_AT_MS);
  });
});

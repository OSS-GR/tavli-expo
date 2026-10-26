import { getLayout, getTheme } from '@tavli/themes';

import {
  barCheckerRadius,
  checkerRadius,
  distanceToRect,
  fitBoard,
  fitBoardWithShadow,
  hitAreas,
  hitTest,
  pickRect,
  pointCorners,
  pointPath,
  slotKey,
  slotRect,
  stackGeometry,
  stackPosition,
  toScreenRect,
  trayGeometry,
  trayLanding,
  type BoardGeometry,
  type ScreenRect,
} from './geometry';

const layout = getLayout(getTheme('walnut-kafeneio'), 'portrait-rotated');

/** The layout at its reference size (377 x 630 pt), at the canvas origin. */
const geo: BoardGeometry = fitBoard(layout, { width: 377, height: 630 });

const inside = (r: ScreenRect, x: number, y: number) =>
  x >= r.x - 1e-6 && x <= r.x + r.width + 1e-6 && y >= r.y - 1e-6 && y <= r.y + r.height + 1e-6;

const center = (r: ScreenRect) => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });

describe('fitBoard', () => {
  it('keeps the aspect ratio and fills the narrow side', () => {
    expect(geo.width).toBeCloseTo(377, 0);
    expect(geo.height).toBeCloseTo(630, 0);
    const tall = fitBoard(layout, { width: 390, height: 900 });
    expect(tall.width).toBe(390);
    expect(tall.width / tall.height).toBeCloseTo(layout.aspectRatio, 6);
    expect(tall.y).toBeCloseTo((900 - tall.height) / 2, 6);
  });

  it('fits an iPhone SE board area and keeps checkers tappable', () => {
    // 375 x 667 minus the strips and the controls row: about 455 pt for the board.
    const se = fitBoardWithShadow(layout, { width: 375, height: 455 });
    expect(se.height).toBeLessThanOrEqual(455);
    expect(se.width).toBeLessThanOrEqual(375);
    expect(2 * checkerRadius(se)).toBeGreaterThan(25);
  });

  it('keeps room for the shadow', () => {
    const big = fitBoardWithShadow(layout, { width: 430, height: 2000 });
    expect(big.x).toBeGreaterThan(5);
    expect(big.x + big.width).toBeLessThan(430 - 5);
  });
});

describe('rects and keys', () => {
  it('scales normalized rects to points', () => {
    const r = toScreenRect(geo, { x: 0.5, y: 0.25, w: 0.1, h: 0.2 });
    expect(r.x).toBeCloseTo(188.5, 1);
    expect(r.y).toBeCloseTo(157.5, 1);
    expect(r.width).toBeCloseTo(37.7, 1);
    expect(r.height).toBeCloseTo(126, 1);
  });

  it('names every slot', () => {
    expect(slotKey({ kind: 'point', index: 13 })).toBe('p13');
    expect(slotKey({ kind: 'bar', side: 'player' })).toBe('bar:player');
    expect(slotKey({ kind: 'tray', side: 'opponent' })).toBe('tray:opponent');
  });

  it('puts point 1 at the bottom left and point 24 at the bottom right (portrait)', () => {
    const p1 = slotRect(geo, { kind: 'point', index: 1 });
    const p24 = slotRect(geo, { kind: 'point', index: 24 });
    const p12 = slotRect(geo, { kind: 'point', index: 12 });
    expect(p1.x).toBeLessThan(p24.x);
    expect(p1.y).toBeCloseTo(p24.y, 6);
    expect(p12.y).toBeLessThan(p1.y);
  });
});

describe('point triangles', () => {
  it('has its base on the outer edge and its tip toward the middle', () => {
    const [a, b, tip] = pointCorners(geo, 6);
    const rect = slotRect(geo, { kind: 'point', index: 6 });
    expect(a.x).toBeCloseTo(rect.x, 6); // base = left edge
    expect(b.x).toBeCloseTo(rect.x, 6);
    expect(tip.x).toBeCloseTo(rect.x + rect.width * layout.pointShape.depth, 6);
    expect(tip.y).toBeCloseTo(rect.y + rect.height / 2, 6);
  });

  it('writes an SVG path', () => {
    expect(pointPath(geo, 13)).toMatch(/^M[\d.]+ [\d.]+L[\d.]+ [\d.]+L[\d.]+ [\d.]+Z$/);
  });
});

describe('stacks', () => {
  it('places checkers from the base outwards, inside the point', () => {
    const slot = { kind: 'point', index: 6 } as const;
    const stack = stackGeometry(geo, slot, 5);
    const rect = slotRect(geo, slot);
    expect(stack.centers).toHaveLength(5);
    expect(stack.badge).toBeNull();
    expect(stack.radius).toBeCloseTo(layout.checker.radius * 377, 6);
    for (let i = 1; i < 5; i++) {
      expect(stack.centers[i]!.x).toBeGreaterThan(stack.centers[i - 1]!.x);
    }
    for (const c of stack.centers) {
      expect(inside(rect, c.x, c.y)).toBe(true);
      expect(c.y).toBeCloseTo(rect.y + rect.height / 2, 6);
    }
    expect(stack.centers[0]!.x - stack.radius).toBeGreaterThanOrEqual(rect.x);
  });

  it('grows from the right edge on the right column', () => {
    const stack = stackGeometry(geo, { kind: 'point', index: 13 }, 3);
    expect(stack.centers[1]!.x).toBeLessThan(stack.centers[0]!.x);
  });

  it('shows 5 checkers and a count badge for a taller stack', () => {
    const stack = stackGeometry(geo, { kind: 'point', index: 6 }, 7);
    expect(stack.centers).toHaveLength(5);
    expect(stack.badge).toBe(7);
    expect(stackGeometry(geo, { kind: 'point', index: 6 }, 15).badge).toBe(15);
  });

  it('returns the place of one checker in a stack', () => {
    const slot = { kind: 'point', index: 8 } as const;
    const all = stackGeometry(geo, slot, 3).centers;
    expect(stackPosition(geo, slot, 3, 2)).toEqual(all[2]);
    // Past the fifth checker, the last visible place.
    expect(stackPosition(geo, slot, 9, 7)).toEqual(stackGeometry(geo, slot, 9).centers[4]);
  });

  it('shrinks bar checkers to fit the bar', () => {
    const r = barCheckerRadius(geo);
    const bar = toScreenRect(geo, layout.bar.rect);
    expect(r).toBeLessThan(checkerRadius(geo));
    expect(2 * r).toBeLessThanOrEqual(bar.height);
    const stack = stackGeometry(geo, { kind: 'bar', side: 'player' }, 2);
    expect(stack.radius).toBeCloseTo(r, 6);
    const half = slotRect(geo, { kind: 'bar', side: 'player' });
    for (const c of stack.centers) expect(inside(half, c.x, c.y)).toBe(true);
    // The player's half starts at the middle and grows to the right.
    expect(stack.centers[1]!.x).toBeGreaterThan(stack.centers[0]!.x);
  });

  it('refuses round checkers in a tray', () => {
    expect(() => stackGeometry(geo, { kind: 'tray', side: 'player' }, 1)).toThrow(/tray/i);
  });
});

describe('trays', () => {
  it('fits 15 borne-off checkers in a tray', () => {
    const tray = slotRect(geo, { kind: 'tray', side: 'player' });
    const rects = trayGeometry(geo, 'player', 15);
    expect(rects).toHaveLength(15);
    for (const r of rects) {
      expect(inside(tray, r.x, r.y)).toBe(true);
      expect(inside(tray, r.x + r.width, r.y + r.height)).toBe(true);
    }
  });

  it('lands the next checker after the ones already there', () => {
    const empty = trayLanding(geo, 'player', 0);
    const two = trayLanding(geo, 'player', 2);
    expect(two.x).toBeGreaterThan(empty.x);
    // The opponent's tray fills from its right edge.
    expect(trayLanding(geo, 'opponent', 2).x).toBeLessThan(trayLanding(geo, 'opponent', 0).x);
  });
});

describe('hit-testing', () => {
  const areas = hitAreas(geo);

  it('has 28 areas: 24 points, 2 bar halves, 2 trays', () => {
    expect(areas).toHaveLength(28);
    expect(new Set(areas.map((a) => a.key)).size).toBe(28);
  });

  it('finds the slot under the center of every area', () => {
    for (const area of areas) {
      const c = center(area.rect);
      expect(hitTest(areas, c.x, c.y)).toEqual(area.slot);
    }
  });

  it('uses the same rect that holds the drawn stack', () => {
    const slot = { kind: 'point', index: 17 } as const;
    for (const c of stackGeometry(geo, slot, 5).centers) {
      expect(hitTest(areas, c.x, c.y)).toEqual(slot);
    }
  });

  it('returns null off the board', () => {
    expect(hitTest(areas, -20, -20)).toBeNull();
  });

  it('measures the distance to a rect', () => {
    const r = { x: 10, y: 10, width: 10, height: 10 };
    expect(distanceToRect(r, 15, 15)).toBe(0);
    expect(distanceToRect(r, 25, 15)).toBe(5);
    expect(distanceToRect(r, 23, 24)).toBe(5);
  });

  it('snaps to the nearest rect within the snap distance', () => {
    const rects = [
      { x: 0, y: 0, width: 10, height: 10 },
      { x: 30, y: 0, width: 10, height: 10 },
    ];
    expect(pickRect(rects, 5, 5)).toBe(0);
    expect(pickRect(rects, 20, 5)).toBe(-1);
    expect(pickRect(rects, 18, 5, 12)).toBe(0);
    expect(pickRect(rects, 26, 5, 12)).toBe(1);
    expect(pickRect(rects, 100, 5, 12)).toBe(-1);
  });
});

import { describe, expect, it } from 'vitest';

import { imageFileName, imageFileNames, pickScale } from './assets';
import { contrastRatio, relativeLuminance, resolvePalette } from './color';
import { pointTriangle, rectsOverlap, stackCenters, trayRects } from './geometry';
import type { BoardLayout, ImageAsset, PointSlot, ThemeManifest } from './types';

// A tiny square board with one point on each side, for exact numbers.
const layout = {
  aspectRatio: 1,
  checker: {
    radius: 0.05,
    stackSpacing: 0.1,
    stackInset: 0,
    maxStackDepth: 1,
    maxVisible: 5,
    trayThickness: 0.02,
  },
  pointShape: { depth: 0.5, baseInset: 0.1 },
} as unknown as BoardLayout;

const point = (base: PointSlot['base']): PointSlot => ({
  index: 1,
  rect:
    base === 'left' || base === 'right'
      ? { x: 0, y: 0, w: 0.4, h: 0.1 }
      : { x: 0, y: 0, w: 0.1, h: 0.4 },
  base,
  tone: 'dark',
});

describe('stackCenters', () => {
  it('stacks from the base at full spacing while they fit', () => {
    const s = stackCenters(layout, point('left'), 3);
    expect(s.centers.map((c) => c.x)).toEqual([0.05, 0.15, 0.25].map((n) => expect.closeTo(n, 9)));
    expect(s.centers.every((c) => Math.abs(c.y - 0.05) < 1e-9)).toBe(true);
    expect(s.badge).toBeNull();
  });

  it('squeezes 5 checkers into the slot and badges the rest', () => {
    const s = stackCenters(layout, point('right'), 9);
    expect(s.centers).toHaveLength(5);
    expect(s.badge).toBe(9);
    // Depth 0.4: first center at 0.4 - 0.05, last at 0.05.
    expect(s.centers[0]?.x).toBeCloseTo(0.35, 9);
    expect(s.centers[4]?.x).toBeCloseTo(0.05, 9);
  });

  it('works for vertical points too', () => {
    expect(stackCenters(layout, point('top'), 1).centers[0]).toEqual({ x: 0.05, y: 0.05 });
    expect(stackCenters(layout, point('bottom'), 1).centers[0]?.y).toBeCloseTo(0.35, 9);
  });

  it('returns nothing for an empty slot', () => {
    expect(stackCenters(layout, point('left'), 0)).toMatchObject({ centers: [], badge: null });
  });
});

describe('pointTriangle', () => {
  it('puts the base on the base edge and the tip in the middle', () => {
    expect(pointTriangle(layout, point('left'))).toEqual([
      { x: 0, y: expect.closeTo(0.01, 9) },
      { x: 0, y: expect.closeTo(0.09, 9) },
      { x: 0.2, y: 0.05 },
    ]);
    expect(pointTriangle(layout, point('bottom'))[2]).toEqual({
      x: 0.05,
      y: expect.closeTo(0.2, 9),
    });
  });
});

describe('trayRects', () => {
  it('lines up slices from the base and squeezes 15 into a short tray', () => {
    const slot = { rect: { x: 0.5, y: 0, w: 0.2, h: 0.1 }, base: 'right' as const };
    const slices = trayRects(layout, slot, 15);
    expect(slices).toHaveLength(15);
    expect(slices[0]?.x).toBeCloseTo(0.68, 9);
    for (const r of slices) expect(r.x).toBeGreaterThanOrEqual(0.5 - 1e-9);
  });
});

describe('rectsOverlap', () => {
  it('does not count touching edges', () => {
    const a = { x: 0, y: 0, w: 0.5, h: 0.5 };
    expect(rectsOverlap(a, { x: 0.5, y: 0, w: 0.5, h: 0.5 })).toBe(false);
    expect(rectsOverlap(a, { x: 0.49, y: 0.49, w: 0.5, h: 0.5 })).toBe(true);
  });
});

describe('color', () => {
  it('computes WCAG contrast', () => {
    expect(contrastRatio('#FFFFFF', '#000000')).toBeCloseTo(21, 5);
    expect(contrastRatio('#777777', '#777777')).toBe(1);
    expect(relativeLuminance('#FFFFFF')).toBe(1);
    expect(() => relativeLuminance('red')).toThrow();
  });

  it('resolves palette tokens and keeps the palette', () => {
    const t = { palette: { 'a.b': '#123456' }, x: ['{a.b}', '#FFFFFF'], y: { z: '{a.b}' } };
    const r = resolvePalette(t as unknown as ThemeManifest) as unknown as typeof t;
    expect(r.x).toEqual(['#123456', '#FFFFFF']);
    expect(r.y.z).toBe('#123456');
    expect(r.palette).toEqual({ 'a.b': '#123456' });
    expect(() => resolvePalette({ palette: {}, q: '{nope}' } as unknown as ThemeManifest)).toThrow(
      /q: unknown palette token "nope"/,
    );
  });
});

describe('assets', () => {
  const asset: ImageAsset = {
    file: 'board-portrait.webp',
    scales: [1, 2, 3],
    width: 10,
    height: 20,
  };

  it('names files the React Native way', () => {
    expect(imageFileName(asset, 1)).toBe('board-portrait.webp');
    expect(imageFileName(asset, 3)).toBe('board-portrait@3x.webp');
    expect(imageFileNames(asset)).toHaveLength(3);
  });

  it('picks the smallest scale that is sharp enough', () => {
    expect(pickScale(asset, 1)).toBe(1);
    expect(pickScale(asset, 2.5)).toBe(3);
    expect(pickScale(asset, 4)).toBe(3);
    expect(pickScale({ ...asset, scales: [2] }, 1)).toBe(2);
  });
});

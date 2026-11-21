import { REUSE_MAX, REUSE_MIN, servesSize, spriteSpec } from './checkerSprite';

const shadow = { color: '#000000', opacity: 0.4, dx: 0.04, dy: 0.1, blur: 0.12 };

describe('spriteSpec', () => {
  it('sizes the image in real pixels, with room for the shadow', () => {
    const spec = spriteSpec(shadow, 20, 2);
    expect(spec.px).toBe(40);
    // 1 (the checker) + 0.1 (offset) + 0.3 (blur) + 2 px edge, on each side.
    expect(spec.side).toBe(Math.ceil(2 * (1.4 + 2 / 40) * 40));
    expect(spec.reach).toBeCloseTo(spec.side / 80, 10);
    expect(spec.reach).toBeGreaterThan(1.4);
  });

  it('uses the larger shadow offset, whatever its sign', () => {
    const left = spriteSpec({ ...shadow, dx: -0.3, dy: 0.1 }, 20, 1);
    const down = spriteSpec({ ...shadow, dx: 0.1, dy: 0.3 }, 20, 1);
    expect(left.side).toBe(down.side);
  });

  it('never makes an image smaller than 8 px of radius', () => {
    expect(spriteSpec(shadow, 1, 1).px).toBe(8);
  });

  it('gives one size to radii that round to the same pixel', () => {
    expect(spriteSpec(shadow, 20.1, 2)).toEqual(spriteSpec(shadow, 19.9, 2));
  });
});

describe('servesSize', () => {
  it('an image serves its own size and near sizes', () => {
    expect(servesSize(40, 40)).toBe(true);
    expect(servesSize(40, 42)).toBe(true); // drawn 5% larger
    expect(servesSize(40, 30)).toBe(true); // drawn smaller
  });

  it('but not a size that would blur it or waste it', () => {
    expect(servesSize(40, 40 / REUSE_MIN + 1)).toBe(false);
    expect(servesSize(40, 40 / REUSE_MAX - 1)).toBe(false);
  });
});

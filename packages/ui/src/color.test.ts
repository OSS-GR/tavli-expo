import { describe, expect, it } from 'vitest';

import { withAlpha } from './color';

describe('withAlpha', () => {
  it('writes a hex color as rgba', () => {
    expect(withAlpha('#C89B45', 0.5)).toBe('rgba(200, 155, 69, 0.5)');
    expect(withAlpha('#000000', 0)).toBe('rgba(0, 0, 0, 0)');
  });

  it('keeps alpha between 0 and 1', () => {
    expect(withAlpha('#ffffff', 2)).toBe('rgba(255, 255, 255, 1)');
    expect(withAlpha('#ffffff', -1)).toBe('rgba(255, 255, 255, 0)');
  });

  it('gives other color forms back unchanged', () => {
    expect(withAlpha('#fff', 0.5)).toBe('#fff');
    expect(withAlpha('var(--colors-accent)', 0.5)).toBe('var(--colors-accent)');
  });
});

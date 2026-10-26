import { describe, expect, it } from 'vitest';

import { colors, spacing } from './tokens';

describe('design tokens', () => {
  it('uses hex colors', () => {
    for (const value of Object.values(colors)) {
      expect(value).toMatch(/^#[0-9A-F]{6}$/i);
    }
  });

  it('grows spacing from small to large', () => {
    const values = Object.values(spacing);
    expect(values).toEqual([...values].sort((a, b) => a - b));
  });
});

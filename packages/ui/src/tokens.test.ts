import { describe, expect, it } from 'vitest';

import { fonts, typography } from './tokens';

const embedded: string[] = Object.values(fonts);

describe('typography', () => {
  it('sets no fontWeight on a Piazzolla style: the family names the weight', () => {
    for (const [name, style] of Object.entries(typography)) {
      if ('fontFamily' in style && embedded.includes(style.fontFamily)) {
        expect({ name, fontWeight: 'fontWeight' in style }).toEqual({ name, fontWeight: false });
      }
    }
  });

  it('uses Piazzolla only for titles and numbers', () => {
    const piazzolla = Object.entries(typography)
      .filter(([, style]) => 'fontFamily' in style)
      .map(([name]) => name);
    expect(piazzolla).toEqual([
      'display',
      'title1',
      'title2',
      'title3',
      'sectionHeader',
      'numeral',
    ]);
  });
});

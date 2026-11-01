import i18n from '@/i18n';

import { greetingFor } from './greeting';

describe('greetingFor (#342)', () => {
  it('picks the part of the day from the hour', () => {
    expect([0, 4, 5, 11, 12, 17, 18, 23].map(greetingFor)).toEqual([
      'evening',
      'evening',
      'morning',
      'morning',
      'afternoon',
      'afternoon',
      'evening',
      'evening',
    ]);
  });

  it('has a greeting in both languages', () => {
    for (const lang of ['en', 'el'] as const) {
      const t = i18n.getFixedT(lang);
      for (const part of ['morning', 'afternoon', 'evening'] as const) {
        expect(t(`home.greeting.${part}`)).not.toBe(`home.greeting.${part}`);
      }
    }
    expect(i18n.getFixedT('el')('home.greeting.evening')).toBe('Καλησπέρα');
  });
});

import i18n from '@/i18n';

import { recordText } from './record';

describe('recordText', () => {
  const t = i18n.t.bind(i18n);

  it.each([
    [{ wins: 5, losses: 3 }, 'You lead 5–3'],
    [{ wins: 0, losses: 1 }, 'They lead 1–0'],
    [{ wins: 2, losses: 2 }, 'Even at 2–2'],
  ])('reads %j as %s', (record, text) => {
    expect(recordText(record, t)).toBe(text);
  });

  it('gives no line before the first finished match', () => {
    expect(recordText({ wins: 0, losses: 0 }, t)).toBeNull();
  });
});

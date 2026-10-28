import { winType } from './turnNotices';

describe('winType', () => {
  it('Tavli scoring: 1 is mono, 2 is diplo, more is points', () => {
    expect(winType({ points: 1 })).toBe('mono');
    expect(winType({ points: 2 })).toBe('diplo');
    expect(winType({ points: 3 })).toBe('points');
    expect(winType({ points: 2 }, 'tavli')).toBe('diplo');
  });

  it('perChecker scoring (Acey-Deucey American, #241, #245): never mono or diplo', () => {
    expect(winType({ points: 1 }, 'perChecker')).toBe('points');
    expect(winType({ points: 2 }, 'perChecker')).toBe('points');
    expect(winType({ points: 15 }, 'perChecker')).toBe('points');
  });
});

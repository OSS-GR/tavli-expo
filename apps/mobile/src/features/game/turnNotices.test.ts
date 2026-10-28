import { isStrongWin, winType } from './turnNotices';

describe('winType', () => {
  it('Tavli scoring: 1 is mono, 2 is diplo, more is points', () => {
    expect(winType({ points: 1 })).toBe('mono');
    expect(winType({ points: 2 })).toBe('diplo');
    expect(winType({ points: 3 })).toBe('points');
    expect(winType({ points: 2 }, 'tavli')).toBe('diplo');
    expect(winType({ points: 3 }, 'tavli')).toBe('points');
  });

  it('perChecker scoring (Acey-Deucey American, #241, #245): always perChecker', () => {
    for (const points of [1, 2, 3, 5, 15]) {
      expect(winType({ points }, 'perChecker')).toBe('perChecker');
    }
  });
});

describe('isStrongWin (#245)', () => {
  it('fills the chip for a diplo and a Tavli backgammon only', () => {
    expect(isStrongWin('diplo')).toBe(true);
    expect(isStrongWin('points')).toBe(true);
    expect(isStrongWin('mono')).toBe(false);
    expect(isStrongWin('perChecker')).toBe(false);
    // A per-checker win is never strong, whatever the points.
    expect(isStrongWin(winType({ points: 15 }, 'perChecker'))).toBe(false);
  });
});

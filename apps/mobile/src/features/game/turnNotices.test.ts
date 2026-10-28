import { createMatch, resolveRules } from '@tavli/engine';

import { isStrongWin, recordScoring, winType } from './turnNotices';

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

describe('recordScoring (#255)', () => {
  it('reads the scoring of the record’s own game, not of the game on the board', () => {
    // Acey-Deucey American scores per checker; the Portes game after it does not.
    const match = createMatch({
      rules: resolveRules('asodio.aceyDeuceyAmerican', {
        match: { rotation: ['asodio', 'portes'] },
      }),
      targetPoints: 30,
    });
    const record = (variant: string) =>
      ({ variant, starter: 'white', winner: 'white', points: 7, reason: 'borneOff' }) as const;
    // The board shows Portes now, but the game that ended was Asodio.
    expect(recordScoring(match, record('asodio'))).toBe('perChecker');
    expect(winType(record('asodio'), recordScoring(match, record('asodio')))).toBe('perChecker');
    expect(recordScoring(match, record('portes'))).toBe('tavli');
    // An id the engine does not know reads the match rules.
    expect(recordScoring(match, record('custom'))).toBe('perChecker');
  });
});

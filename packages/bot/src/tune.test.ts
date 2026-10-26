import { describe, expect, it } from 'vitest';

import { PORTES_DEFAULT_WEIGHTS } from './index';
import { SCALAR_WEIGHTS, playMatch, tune } from './tune';

describe('weight tuning', () => {
  it('lists only the scalar weights', () => {
    expect(SCALAR_WEIGHTS).toContain('race');
    expect(SCALAR_WEIGHTS).toContain('blotBase');
    expect(SCALAR_WEIGHTS).not.toContain('pointShape' as never);
  });

  it('plays paired matches: equal weights come out even', () => {
    const result = playMatch(PORTES_DEFAULT_WEIGHTS, PORTES_DEFAULT_WEIGHTS, 20, 3);
    expect(result).toEqual({ games: 20, wins: 10, pointsPerGame: 0 });
  });

  it('runs a tiny search and reports what it tried', () => {
    const lines: string[] = [];
    const result = tune({
      games: 4,
      rounds: 1,
      step: 0.5,
      minGain: 10, // nothing can win by 10 points per game: no change is kept
      seed: 1,
      keys: ['stack'],
      log: (text) => lines.push(text),
    });
    expect(result.weights).toEqual(PORTES_DEFAULT_WEIGHTS);
    expect(result.changes).toEqual([]);
    expect(result.check.games).toBe(8);
    expect(lines[0]).toContain('round 1');
    expect(lines.filter((line) => line.includes('stack'))).toHaveLength(2);
  });
});

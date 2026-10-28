/**
 * The evaluators' roll list (#234). The shot counts and the bear-off table
 * gave their scores with a list built by hand. The list from
 * `DISTINCT_ROLLS` must be the same, in the same order, so the scores stay
 * the same to the last bit.
 */

import { describe, expect, it } from 'vitest';

import { ROLLS } from './rolls';

/** The list the four evaluators built by hand before #234. */
function handBuiltRolls(): [number, number, number][] {
  const rolls: [number, number, number][] = [];
  for (let a = 1; a <= 6; a += 1) {
    for (let b = a; b <= 6; b += 1) rolls.push([a, b, a === b ? 1 : 2]);
  }
  return rolls;
}

describe('the evaluator rolls', () => {
  it('are the hand-built rolls, in the same order', () => {
    expect(ROLLS).toEqual(handBuiltRolls());
  });

  it('have whole weights that add up to 36', () => {
    for (const [, , outOf36] of ROLLS) expect(Number.isInteger(outOf36)).toBe(true);
    expect(ROLLS.reduce((sum, [, , outOf36]) => sum + outOf36, 0)).toBe(36);
  });

  it('cannot be changed', () => {
    expect(Object.isFrozen(ROLLS)).toBe(true);
    for (const roll of ROLLS) expect(Object.isFrozen(roll)).toBe(true);
  });
});

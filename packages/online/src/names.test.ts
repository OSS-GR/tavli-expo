// Guest names (#400): the four digits and the names of a game's sides.

import { describe, expect, it } from 'vitest';

import { guestName, isGuestNumber, usernameName } from '@tavli/contracts';
import { createSeededRng } from '@tavli/engine';
import type { Rng } from '@tavli/engine';

import { NO_NAMES, namesOf, pickGuestNumber } from './names';

/** An RNG that gives `values` in order. */
function fixedRng(values: readonly number[]): Rng {
  let i = 0;
  return {
    nextUint32: () => {
      const value = values[i];
      i += 1;
      if (value === undefined) throw new Error('no more values');
      return value;
    },
  };
}

describe('pickGuestNumber', () => {
  it('gives four digits from 1000 to 9999', () => {
    const rng = createSeededRng(7);
    for (let i = 0; i < 2000; i++) {
      const number = pickGuestNumber(rng);
      expect(isGuestNumber(number)).toBe(true);
    }
  });

  it('maps the lowest and highest values to 1000 and 9999', () => {
    expect(pickGuestNumber(fixedRng([0]))).toBe('1000');
    expect(pickGuestNumber(fixedRng([8999]))).toBe('9999');
    expect(pickGuestNumber(fixedRng([9000]))).toBe('1000');
  });

  it('draws again above the fair limit, so no number comes up more often', () => {
    const limit = 2 ** 32 - (2 ** 32 % 9000);
    expect(pickGuestNumber(fixedRng([limit, 2 ** 32 - 1, 3821]))).toBe('4821');
  });

  it('uses every first digit', () => {
    const rng = createSeededRng(11);
    const firsts = new Set<string>();
    for (let i = 0; i < 500; i++) firsts.add(pickGuestNumber(rng)[0] ?? '');
    expect([...firsts].sort()).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9']);
  });
});

describe('isGuestNumber', () => {
  it('takes four digits that do not start with 0', () => {
    expect(isGuestNumber('4821')).toBe(true);
    expect(isGuestNumber('0482')).toBe(false);
    expect(isGuestNumber('482')).toBe(false);
    expect(isGuestNumber('48210')).toBe(false);
    expect(isGuestNumber('48a1')).toBe(false);
  });
});

describe('namesOf', () => {
  it('names each side that has a number', () => {
    expect(namesOf({ white: { guestNumber: '4821' }, black: null })).toEqual({
      white: guestName('4821'),
      black: null,
    });
    expect(NO_NAMES).toEqual({ white: null, black: null });
  });

  it('names a side by its username first (#405)', () => {
    expect(namesOf({ white: { guestNumber: '4821', username: 'Νίκος' }, black: {} })).toEqual({
      white: usernameName('Νίκος'),
      black: null,
    });
  });
});

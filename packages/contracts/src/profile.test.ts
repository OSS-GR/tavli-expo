import { describe, expect, it } from 'vitest';

import {
  PROFILE_ERROR_CODES,
  USERNAME_MAX_LENGTH,
  USERNAME_MIN_LENGTH,
  isProfileErrorData,
} from './index';

describe('profile constants (#317)', () => {
  it('a username has 3 to 20 characters', () => {
    expect(USERNAME_MIN_LENGTH).toBe(3);
    expect(USERNAME_MAX_LENGTH).toBe(20);
  });

  it('has the error codes, with NOT_SIGNED_IN as in the other ports', () => {
    expect(PROFILE_ERROR_CODES).toEqual([
      'USERNAME_INVALID',
      'USERNAME_TAKEN',
      'BAD_REQUEST',
      'NOT_SIGNED_IN',
    ]);
  });
});

describe('isProfileErrorData', () => {
  it('accepts a known code with a message', () => {
    expect(isProfileErrorData({ code: 'USERNAME_TAKEN', message: 'taken' })).toBe(true);
    expect(isProfileErrorData({ code: 'NOT_SIGNED_IN', message: '' })).toBe(true);
  });

  it('rejects anything else', () => {
    expect(isProfileErrorData(null)).toBe(false);
    expect(isProfileErrorData('USERNAME_TAKEN')).toBe(false);
    expect(isProfileErrorData({ code: 'USERNAME_TAKEN' })).toBe(false);
    expect(isProfileErrorData({ code: 'NOT_FOUND', message: 'x' })).toBe(false);
    expect(isProfileErrorData({ code: 7, message: 'x' })).toBe(false);
  });
});

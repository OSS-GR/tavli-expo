import { describe, expect, it } from 'vitest';

import {
  INVITE_CODE_ALPHABET,
  INVITE_CODE_LENGTH,
  INVITE_ERROR_CODES,
  INVITE_STATUSES,
  INVITE_TIME_MS,
  isInviteErrorData,
  normalizeInviteCode,
} from './index';

describe('invite constants (#252)', () => {
  it('an invite lasts 24 hours (open question Q31)', () => {
    expect(INVITE_TIME_MS).toBe(86_400_000);
  });

  it('has the five statuses', () => {
    expect(INVITE_STATUSES).toEqual(['open', 'accepted', 'declined', 'cancelled', 'expired']);
  });

  it('codes are 8 characters from an alphabet with no look-alikes', () => {
    expect(INVITE_CODE_LENGTH).toBe(8);
    for (const char of '0O1IL') expect(INVITE_CODE_ALPHABET).not.toContain(char);
    expect(new Set(INVITE_CODE_ALPHABET).size).toBe(INVITE_CODE_ALPHABET.length);
    expect(INVITE_CODE_ALPHABET).toMatch(/^[2-9A-Z]+$/);
    expect(INVITE_CODE_ALPHABET).toHaveLength(31);
  });
});

describe('normalizeInviteCode', () => {
  it('turns a code into capital letters and drops spaces at the ends', () => {
    expect(normalizeInviteCode('abcd2345')).toBe('ABCD2345');
    expect(normalizeInviteCode('  AbCd2345 \n')).toBe('ABCD2345');
    expect(normalizeInviteCode('ABCD2345')).toBe('ABCD2345');
  });

  it('rejects a wrong length or a character outside the alphabet', () => {
    expect(normalizeInviteCode('')).toBeNull();
    expect(normalizeInviteCode('ABCD234')).toBeNull();
    expect(normalizeInviteCode('ABCD23456')).toBeNull();
    expect(normalizeInviteCode('ABCD 345')).toBeNull();
    // Look-alikes are not in the alphabet.
    expect(normalizeInviteCode('ABCD2340')).toBeNull();
    expect(normalizeInviteCode('ABCD234O')).toBeNull();
    expect(normalizeInviteCode('ABCD2341')).toBeNull();
    expect(normalizeInviteCode('ABCD234l')).toBeNull();
    expect(normalizeInviteCode('ABCD234i')).toBeNull();
    expect(normalizeInviteCode('ABCD234-')).toBeNull();
  });
});

describe('isInviteErrorData', () => {
  it('accepts every error code with a message', () => {
    for (const code of INVITE_ERROR_CODES) {
      expect(isInviteErrorData({ code, message: 'x' })).toBe(true);
    }
  });

  it('rejects other values', () => {
    expect(isInviteErrorData({ code: 'NOT_FOUND', message: 'x' })).toBe(false);
    expect(isInviteErrorData({ code: 'INVITE_EXPIRED' })).toBe(false);
    expect(isInviteErrorData('INVITE_EXPIRED')).toBe(false);
    expect(isInviteErrorData(null)).toBe(false);
  });
});

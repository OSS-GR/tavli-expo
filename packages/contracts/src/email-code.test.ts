import { describe, expect, it } from 'vitest';

import { MAX_EMAIL_LENGTH, isEmailCode, normalizeEmail } from './email-code';

describe('normalizeEmail', () => {
  it('trims and lowers an address', () => {
    expect(normalizeEmail('  Eleni.K@Example.COM ')).toBe('eleni.k@example.com');
    expect(normalizeEmail('a+tavli@mail.example.gr')).toBe('a+tavli@mail.example.gr');
  });

  it('refuses what is not an address', () => {
    for (const text of [
      '',
      'eleni',
      'eleni@',
      '@example.com',
      'eleni@example',
      'el eni@example.com',
      'a@b@example.com',
      'Eleni <eleni@example.com>',
      'eleni@example.',
    ]) {
      expect(normalizeEmail(text)).toBeNull();
    }
  });

  it('refuses an address longer than the limit', () => {
    const long = `${'a'.repeat(MAX_EMAIL_LENGTH - '@example.com'.length + 1)}@example.com`;
    expect(normalizeEmail(long)).toBeNull();
    expect(normalizeEmail(long.slice(1))).toBe(long.slice(1));
  });
});

describe('isEmailCode', () => {
  it('takes six digits only', () => {
    expect(isEmailCode('012345')).toBe(true);
    for (const text of ['12345', '1234567', '12345a', ' 12345', '١٢٣٤٥٦']) {
      expect(isEmailCode(text)).toBe(false);
    }
  });
});

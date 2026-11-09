import { describe, expect, it } from 'vitest';

import { EMAIL_CODE_TTL_MS } from '@tavli/contracts';

import {
  ADDRESS_LIMITS,
  addressKey,
  CALLER_LIMITS,
  callerKey,
  callerOf,
  codeExpiresAt,
  codeKey,
  codesPerDay,
  DAY,
  DEFAULT_CODES_PER_DAY,
  emailCodeMail,
  makeEmailCode,
  SEND_LOG_MS,
  sendWait,
} from './emailCode';

const MINUTE = 60 * 1000;
const SECRET = 'a-test-secret-that-is-long-enough-1234';

/** `random(n)` that gives these 32-bit values in turn. */
function values(...words: number[]): (bytes: number) => Uint8Array {
  let at = 0;
  return (bytes) => {
    const out = new Uint8Array(bytes);
    new DataView(out.buffer).setUint32(0, words[at++] ?? 0);
    return out;
  };
}

describe('codesPerDay', () => {
  it('reads EMAIL_CODES_PER_DAY, else the default', () => {
    expect(codesPerDay({})).toBe(DEFAULT_CODES_PER_DAY);
    expect(codesPerDay({ EMAIL_CODES_PER_DAY: ' 100 ' })).toBe(100);
    for (const bad of ['', '0', '-3', '2.5', 'many', '99999999']) {
      expect(codesPerDay({ EMAIL_CODES_PER_DAY: bad })).toBe(DEFAULT_CODES_PER_DAY);
    }
  });
});

describe('sendWait', () => {
  const limits = [{ windowMs: 15 * MINUTE, max: 3 }];
  const now = 1_000 * MINUTE;

  it('is 0 under every limit', () => {
    expect(sendWait([], limits, now)).toBe(0);
    expect(sendWait([now - MINUTE, now - 2 * MINUTE], limits, now)).toBe(0);
    // Sends that left the window do not count.
    expect(sendWait([now - 20 * MINUTE, now - MINUTE, now - 2 * MINUTE], limits, now)).toBe(0);
  });

  it('waits until the oldest send in the window leaves it', () => {
    const times = [now - MINUTE, now - 10 * MINUTE, now - 5 * MINUTE];
    expect(sendWait(times, limits, now)).toBe(5 * MINUTE);
  });

  it('takes the longest wait of all limits', () => {
    const day = Array.from({ length: 10 }, (_, i) => now - (i + 1) * 2 * 60 * MINUTE);
    expect(sendWait(day, ADDRESS_LIMITS, now)).toBe(day.at(-1)! + DAY - now);
  });

  it('keeps the log long enough for every limit', () => {
    for (const limit of [...ADDRESS_LIMITS, ...CALLER_LIMITS]) {
      expect(SEND_LOG_MS).toBeGreaterThanOrEqual(limit.windowMs);
    }
  });
});

describe('makeEmailCode', () => {
  it('gives 6 digits, with leading zeros', () => {
    expect(makeEmailCode(values(42))).toBe('000042');
    expect(makeEmailCode(values(123_456))).toBe('123456');
    expect(makeEmailCode(values(4_000_999_999))).toBe('999999');
  });

  it('draws again above the fair limit, so every code is as likely', () => {
    // 4,294,000,000 is the largest multiple of a million below 2^32.
    expect(makeEmailCode(values(4_294_000_000, 7))).toBe('000007');
    expect(makeEmailCode(values(2 ** 32 - 1, 4_293_999_999))).toBe('999999');
  });
});

describe('the hashes', () => {
  it('are stable, hide the input and differ by purpose', async () => {
    const address = await addressKey(SECRET, 'ann@example.com');
    expect(await addressKey(SECRET, 'ann@example.com')).toBe(address);
    expect(address).not.toContain('ann');
    expect(await addressKey(SECRET, 'bea@example.com')).not.toBe(address);
    expect(await addressKey('another-secret-that-is-long-enough-12', 'ann@example.com')).not.toBe(
      address,
    );
    const code = await codeKey(SECRET, address, '123456');
    expect(code).not.toContain('123456');
    expect(await codeKey(SECRET, address, '123457')).not.toBe(code);
    expect(await callerKey(SECRET, 'ann@example.com')).not.toBe(address);
  });
});

describe('callerOf', () => {
  it('is the user, else the first IP address, else null', () => {
    const headers = new Headers({ 'x-forwarded-for': ' 203.0.113.9 , 10.0.0.1' });
    expect(callerOf(headers, 'user-1')).toBe('user:user-1');
    expect(callerOf(headers, null)).toBe('ip:203.0.113.9');
    expect(callerOf(new Headers({ 'x-real-ip': '198.51.100.2' }), '')).toBe('ip:198.51.100.2');
    expect(
      callerOf(new Headers({ 'cf-connecting-ip': '192.0.2.1', 'x-real-ip': '198.51.100.2' }), null),
    ).toBe('ip:192.0.2.1');
    expect(callerOf(new Headers(), null)).toBeNull();
    expect(callerOf(undefined, null)).toBeNull();
  });
});

describe('the code email', () => {
  it('has the code in the body only, in English and Greek', () => {
    for (const language of ['en', 'el'] as const) {
      const mail = emailCodeMail('012345', language);
      expect(mail.subject).not.toContain('012345');
      expect(mail.text).toContain('012345');
      expect(mail.html).toContain('012345');
      expect(mail.html).toContain(`lang="${language}"`);
      expect(mail.text).toContain(String(EMAIL_CODE_TTL_MS / MINUTE));
    }
    expect(emailCodeMail('012345', 'en').subject).toBe('Your Tavlaki sign-in code');
    expect(emailCodeMail('012345', 'el').subject).toBe('Ο κωδικός σύνδεσης στο Tavlaki');
  });

  it('runs out after the code time', () => {
    expect(codeExpiresAt(1_000)).toBe(1_000 + EMAIL_CODE_TTL_MS);
  });
});

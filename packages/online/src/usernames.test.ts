// Usernames (#405): the rules of a name, its unique key, the block list
// and one pick or change.

import { describe, expect, it } from 'vitest';

import { TERMS_VERSION, USERNAME_CHANGE_MS } from '@tavli/contracts';

import {
  checkUsername,
  isAllowedUsername,
  myUsernameOf,
  nextUsernameChange,
  planUsername,
  usernameKey,
} from './usernames';
import type { UsernameRecord } from './usernames';

describe('checkUsername', () => {
  it('takes Latin and Greek names with digits and _', () => {
    for (const name of [
      'Alex',
      'nikos_77',
      'Νίκος',
      'ΜΑΡΙΑ_1',
      'José',
      'abc',
      'a234567890123456',
    ]) {
      expect(checkUsername(name)).toEqual({ ok: true, name: name.normalize('NFC') });
    }
  });

  it('counts 3 to 16 characters, an accented letter as one', () => {
    expect(checkUsername('ab')).toEqual({ ok: false, problem: 'short' });
    expect(checkUsername('')).toEqual({ ok: false, problem: 'short' });
    expect(checkUsername('a2345678901234567')).toEqual({ ok: false, problem: 'long' });
    // "ά" typed as α + a mark is one character.
    expect(checkUsername('ά'.normalize('NFD') + 'βγ')).toEqual({ ok: true, name: 'άβγ' });
  });

  it('wants a letter first', () => {
    expect(checkUsername('1alex')).toEqual({ ok: false, problem: 'start' });
    expect(checkUsername('_alex')).toEqual({ ok: false, problem: 'start' });
  });

  it('refuses other characters', () => {
    for (const name of ['al ex', 'alex.', 'al-ex', 'alex😀', 'Алекс', 'ølex', 'ﬁne', 'a​bc']) {
      expect(checkUsername(name)).toEqual({ ok: false, problem: 'chars' });
    }
  });

  it('refuses a stack of accents', () => {
    expect(checkUsername('alé́́x')).toEqual({ ok: false, problem: 'chars' });
    expect(checkUsername('ΐου')).toEqual({ ok: true, name: 'ΐου' });
    expect(checkUsername('a1́bc')).toEqual({ ok: false, problem: 'chars' });
  });

  it('wants one alphabet per name', () => {
    // A Greek capital alpha in a Latin name.
    expect(checkUsername('Αlex')).toEqual({ ok: false, problem: 'mixed' });
    expect(checkUsername('Νikos')).toEqual({ ok: false, problem: 'mixed' });
  });
});

describe('usernameKey', () => {
  it('ignores case and accents', () => {
    expect(usernameKey('Alex')).toBe(usernameKey('aLEX'));
    expect(usernameKey('José')).toBe(usernameKey('jose'));
    expect(usernameKey('Νίκος')).toBe(usernameKey('ΝΙΚΟΣ'));
    expect(usernameKey('νικος')).toBe(usernameKey('νίκος'));
  });

  it('maps letters that look the same to one', () => {
    // Greek capitals that look Latin.
    expect(usernameKey('ΑΒΕΚΜΗ')).toBe(usernameKey('abekmh'));
    expect(usernameKey('ΤΟΧΥ')).toBe(usernameKey('toxy'));
    expect(usernameKey('Alice')).toBe(usernameKey('AIice'));
    expect(usernameKey('bob1')).toBe(usernameKey('bobl'));
    expect(usernameKey('l0ve')).toBe(usernameKey('love'));
    expect(usernameKey('modern')).toBe(usernameKey('modem'));
    expect(usernameKey('vvin')).toBe(usernameKey('win'));
  });

  it('keeps different names apart', () => {
    expect(usernameKey('alex')).not.toBe(usernameKey('alexa'));
    expect(usernameKey('nikos')).not.toBe(usernameKey('Νίκος'));
    expect(usernameKey('ab_c')).not.toBe(usernameKey('abc'));
  });
});

describe('isAllowedUsername', () => {
  it('allows common names and words', () => {
    for (const name of [
      'Alex',
      'Νίκος',
      'Pomegranate',
      'Scorpion',
      'cocktail',
      'Sussex',
      'Dickens',
      'torpedo',
      'therapist',
      'Μαρία',
      'Γάμος',
      'tavli_fan',
    ]) {
      expect(isAllowedUsername(name)).toBe(true);
    }
  });

  it('refuses reserved names, also with look-alikes and digits', () => {
    for (const name of [
      'admin',
      'Adm1n',
      'ADMINISTRATOR',
      'support_team',
      'Tavlaki',
      'tavlakiHQ',
      'tavli',
      'Guest_4821',
      'Guest4821',
      'Moderator',
      'mod',
      'bot_1',
      'Ταβλάκι',
      'Επισκέπτης',
      'Διαχειριστής',
    ]) {
      expect(isAllowedUsername(name)).toBe(false);
    }
  });

  it('refuses blocked words anywhere, in English, Greek and Greeklish', () => {
    for (const name of [
      'fuckyou',
      'bigfuck',
      'fuck_99',
      'SH1T',
      'Μαλάκας',
      'malakas',
      'gamw_to',
      'sex',
      'Sex_1',
      'xPornx',
    ]) {
      expect(isAllowedUsername(name)).toBe(false);
    }
  });
});

const NOW = Date.UTC(2026, 10, 9, 12);
const DAY = 24 * 60 * 60 * 1000;
const ACCEPTED = { acceptTerms: TERMS_VERSION, ageChecked: true } as const;

describe('planUsername', () => {
  it('refuses a guest', () => {
    expect(
      planUsername({
        record: null,
        saved: false,
        request: { name: 'Alex', ...ACCEPTED },
        now: NOW,
      }),
    ).toMatchObject({ ok: false, code: 'NOT_SAVED' });
  });

  it('refuses a bad name and a blocked one', () => {
    const plan = (name: string) =>
      planUsername({ record: null, saved: true, request: { name, ...ACCEPTED }, now: NOW });
    expect(plan('a b')).toMatchObject({ ok: false, code: 'BAD_NAME' });
    expect(plan('admin')).toMatchObject({ ok: false, code: 'NOT_ALLOWED' });
  });

  it('needs the terms and the age the first time', () => {
    const plan = (request: { acceptTerms?: string; ageChecked?: boolean }) =>
      planUsername({ record: null, saved: true, request: { name: 'Alex', ...request }, now: NOW });
    expect(plan({ ageChecked: true })).toMatchObject({ ok: false, code: 'TERMS_NEEDED' });
    expect(plan({ acceptTerms: 'old', ageChecked: true })).toMatchObject({
      ok: false,
      code: 'TERMS_NEEDED',
    });
    expect(plan({ acceptTerms: TERMS_VERSION })).toMatchObject({ ok: false, code: 'AGE_NEEDED' });
    expect(plan(ACCEPTED)).toEqual({
      ok: true,
      key: usernameKey('Alex'),
      patch: {
        termsVersion: TERMS_VERSION,
        termsAcceptedAt: NOW,
        ageCheckedAt: NOW,
        username: 'Alex',
        usernameKey: usernameKey('Alex'),
      },
    });
  });

  it('asks the age once, and the terms again only for a new version', () => {
    const record: UsernameRecord = {
      username: 'Alex',
      usernameKey: 'aiex',
      ageCheckedAt: NOW - DAY,
      termsVersion: TERMS_VERSION,
    };
    expect(planUsername({ record, saved: true, request: { name: 'Alexis' }, now: NOW })).toEqual({
      ok: true,
      key: usernameKey('Alexis'),
      patch: { username: 'Alexis', usernameKey: usernameKey('Alexis'), usernameChangedAt: NOW },
    });
    const oldTerms = { ...record, termsVersion: '2020-01-01' };
    expect(
      planUsername({ record: oldTerms, saved: true, request: { name: 'Alexis' }, now: NOW }),
    ).toMatchObject({ ok: false, code: 'TERMS_NEEDED' });
  });

  it('lets the first pick change once at once, then once in 30 days', () => {
    const picked: UsernameRecord = {
      username: 'Alex',
      usernameKey: usernameKey('Alex'),
      ageCheckedAt: NOW,
      termsVersion: TERMS_VERSION,
    };
    expect(nextUsernameChange(picked, NOW)).toBeNull();
    const first = planUsername({
      record: picked,
      saved: true,
      request: { name: 'Alexis' },
      now: NOW,
    });
    expect(first.ok).toBe(true);
    const changed: UsernameRecord = { ...picked, ...(first.ok ? first.patch : {}) };
    expect(nextUsernameChange(changed, NOW)).toBe(NOW + USERNAME_CHANGE_MS);
    expect(
      planUsername({ record: changed, saved: true, request: { name: 'Alex2' }, now: NOW + DAY }),
    ).toMatchObject({ ok: false, code: 'TOO_SOON' });
    expect(
      planUsername({
        record: changed,
        saved: true,
        request: { name: 'Alex2' },
        now: NOW + USERNAME_CHANGE_MS,
      }),
    ).toMatchObject({ ok: true, key: usernameKey('Alex2') });
  });

  it('treats the same text as no change, also in the 30 days', () => {
    const record: UsernameRecord = {
      username: 'Alex',
      usernameKey: usernameKey('Alex'),
      usernameChangedAt: NOW,
      ageCheckedAt: NOW,
      termsVersion: TERMS_VERSION,
    };
    expect(
      planUsername({ record, saved: true, request: { name: 'Alex' }, now: NOW + DAY }),
    ).toEqual({
      ok: true,
      key: null,
      patch: {},
    });
    // Another case is another text: a change.
    expect(
      planUsername({ record, saved: true, request: { name: 'ALEX' }, now: NOW + DAY }),
    ).toMatchObject({ ok: false, code: 'TOO_SOON' });
  });

  it('lets a player pick again at once after the owner cleared the name', () => {
    const cleared: UsernameRecord = {
      usernameChangedAt: NOW,
      ageCheckedAt: NOW,
      termsVersion: TERMS_VERSION,
    };
    expect(
      planUsername({ record: cleared, saved: true, request: { name: 'Alex' }, now: NOW + DAY }),
    ).toMatchObject({ ok: true });
  });
});

describe('myUsernameOf', () => {
  it('says what the username step still needs', () => {
    expect(myUsernameOf(null, false, NOW)).toEqual({
      saved: false,
      name: null,
      nextChangeAt: null,
      ageChecked: false,
      termsVersion: null,
      guestNumber: null,
    });
    expect(
      myUsernameOf(
        {
          username: 'Alex',
          usernameChangedAt: NOW,
          ageCheckedAt: NOW,
          termsVersion: TERMS_VERSION,
          guestNumber: '4821',
        },
        true,
        NOW + DAY,
      ),
    ).toEqual({
      saved: true,
      name: 'Alex',
      nextChangeAt: NOW + USERNAME_CHANGE_MS,
      ageChecked: true,
      termsVersion: TERMS_VERSION,
      guestNumber: '4821',
    });
  });
});

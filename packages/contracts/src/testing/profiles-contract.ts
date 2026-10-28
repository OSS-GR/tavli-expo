/**
 * The `Profiles` port contract (#317), as plain async checks that work in
 * any test runner (Vitest in packages, Jest in the app).
 *
 *   for (const check of profilesContract()) {
 *     it(check.name, () => check.run(makeSubject()));
 *   }
 *
 * Make a new subject for each check: both players start with no profile.
 * A check rejects with an `Error` when the adapter breaks the contract.
 */
import { USERNAME_MAX_LENGTH, USERNAME_MIN_LENGTH, isProfileErrorData } from '../profile';
import type { Profile, ProfileErrorCode, Profiles } from '../profile';

/** `me` is the player the checks act as; `other` is a second player. */
export type ProfilesContractPlayer = 'me' | 'other';

export interface ProfilesContractSubject {
  /** The `Profiles` of one signed-in player. Neither has a profile yet. */
  readonly profilesFor: (who: ProfilesContractPlayer) => Profiles;
}

export interface ProfilesContractCheck {
  readonly name: string;
  readonly run: (subject: ProfilesContractSubject) => Promise<void>;
}

function same(actual: unknown, expected: unknown, what: string): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${what}: expected ${e}, got ${a}`);
}

/** Expects `call` to reject with `ProfileErrorData` of this code. */
async function rejectsWith(
  call: Promise<unknown>,
  code: ProfileErrorCode,
  what: string,
): Promise<void> {
  let failed = false;
  let reason: unknown;
  try {
    await call;
  } catch (error) {
    failed = true;
    reason = error;
  }
  if (!failed) throw new Error(`${what}: expected a ${code} rejection, but the call resolved`);
  if (!isProfileErrorData(reason)) {
    throw new Error(`${what}: the rejection is not ProfileErrorData: ${String(reason)}`);
  }
  same(reason.code, code, `${what}: error code`);
}

function profile(username: string): Profile {
  return { username };
}

export function profilesContract(): ProfilesContractCheck[] {
  return [
    {
      name: 'getMyProfile resolves null before the player picks a username',
      run: async (subject) => {
        same(await subject.profilesFor('me').getMyProfile(), null, 'the profile');
      },
    },
    {
      name: 'setMyUsername keeps the case, drops spaces at the ends, and getMyProfile shows it',
      run: async (subject) => {
        const me = subject.profilesFor('me');
        same(await me.setMyUsername('  Maria_1 '), profile('Maria_1'), 'the saved profile');
        same(await me.getMyProfile(), profile('Maria_1'), 'getMyProfile');
        same(await subject.profilesFor('other').getMyProfile(), null, 'the other profile');
      },
    },
    {
      name: `a username of ${USERNAME_MIN_LENGTH} to ${USERNAME_MAX_LENGTH} Latin or Greek letters, digits and _ is valid`,
      run: async (subject) => {
        const me = subject.profilesFor('me');
        const names = [
          'abc',
          'A'.repeat(USERNAME_MAX_LENGTH),
          'Nikos_77',
          '007',
          'Μαρία',
          'Γιώργος_3',
          'ά'.repeat(USERNAME_MAX_LENGTH),
        ];
        for (const name of names) {
          same(await me.setMyUsername(name), profile(name), `the name ${name}`);
        }
      },
    },
    {
      name: 'a username that breaks the rules gets USERNAME_INVALID, and nothing changes',
      run: async (subject) => {
        const me = subject.profilesFor('me');
        await me.setMyUsername('Nikos');
        const bad = [
          '',
          '   ',
          'a'.repeat(USERNAME_MIN_LENGTH - 1),
          'a'.repeat(USERNAME_MAX_LENGTH + 1),
          'two words',
          'a-b-c',
          'José',
          'ab​cd',
          // Latin and Greek letters in one name (a Greek "ο" in "Nikos").
          'Nikοs',
          'tavli🎲',
        ];
        for (const name of bad) {
          await rejectsWith(me.setMyUsername(name), 'USERNAME_INVALID', JSON.stringify(name));
        }
        same(await me.getMyProfile(), profile('Nikos'), 'the profile after the rejected calls');
      },
    },
    {
      name: 'a name another player has gets USERNAME_TAKEN, in any case',
      run: async (subject) => {
        await subject.profilesFor('other').setMyUsername('Maria');
        const me = subject.profilesFor('me');
        await rejectsWith(me.setMyUsername('Maria'), 'USERNAME_TAKEN', 'the same name');
        await rejectsWith(me.setMyUsername('maria'), 'USERNAME_TAKEN', 'in lower case');
        await rejectsWith(me.setMyUsername(' MARIA '), 'USERNAME_TAKEN', 'in capitals');
        same(await me.getMyProfile(), null, 'my profile after the rejected calls');
      },
    },
    {
      name: 'Greek names clash without accents, with a final ς, and with Latin look-alikes',
      run: async (subject) => {
        const me = subject.profilesFor('me');
        await subject.profilesFor('other').setMyUsername('Νίκος');
        await rejectsWith(me.setMyUsername('ΝΙΚΟΣ'), 'USERNAME_TAKEN', 'in capitals, no accent');
        await rejectsWith(me.setMyUsername('νικοσ'), 'USERNAME_TAKEN', 'σ for ς');
        await me.setMyUsername('abe');
        await rejectsWith(
          subject.profilesFor('other').setMyUsername('ΑΒΕ'),
          'USERNAME_TAKEN',
          'Greek look-alikes of a Latin name',
        );
      },
    },
    {
      name: 'a player may change their name, also to another case; the old name is free again',
      run: async (subject) => {
        const me = subject.profilesFor('me');
        const other = subject.profilesFor('other');
        await me.setMyUsername('maria');
        same(await me.setMyUsername('Maria'), profile('Maria'), 'another case of my name');
        same(await me.getMyProfile(), profile('Maria'), 'the profile after the case change');
        await rejectsWith(other.setMyUsername('MARIA'), 'USERNAME_TAKEN', 'my name, by another');
        same(await me.setMyUsername('Nikos'), profile('Nikos'), 'a new name');
        same(await other.setMyUsername('MARIA'), profile('MARIA'), 'my old name, by another');
      },
    },
    {
      name: 'a name kept for the app gets USERNAME_TAKEN, in any case',
      run: async (subject) => {
        const me = subject.profilesFor('me');
        for (const name of ['admin', 'Tavlaki', 'SUPPORT']) {
          await rejectsWith(me.setMyUsername(name), 'USERNAME_TAKEN', name);
        }
        same(await me.getMyProfile(), null, 'the profile after the rejected calls');
      },
    },
    {
      name: 'a profile is a copy: changing it changes nothing on the server',
      run: async (subject) => {
        const me = subject.profilesFor('me');
        const saved = await me.setMyUsername('Eleni');
        (saved as { username: string }).username = 'Hacked';
        const read = await me.getMyProfile();
        if (read !== null) (read as { username: string }).username = 'Hacked';
        same(await me.getMyProfile(), profile('Eleni'), 'the profile on the server');
      },
    },
  ];
}

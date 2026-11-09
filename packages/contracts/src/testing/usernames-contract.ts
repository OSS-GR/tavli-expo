/**
 * The `Usernames` port contract (#405), as plain async checks that work
 * in any test runner (Vitest in packages, Jest in the app).
 *
 *   for (const check of usernamesContract()) {
 *     it(check.name, () => check.run(makeSubject()));
 *   }
 *
 * Make a new subject for each check: two saved accounts and a guest on
 * one server, none with a username yet. A check rejects with an `Error`
 * when the adapter breaks the contract. The checks never wait on a real
 * clock: they move the server clock with `subject.passTime`.
 */
import type { Invites, NewInvite } from '../invite';
import { usernameName } from '../player-name';
import { TERMS_VERSION, USERNAME_CHANGE_MS, isUsernameErrorData } from '../username';
import type { MyUsername, UsernameErrorCode, Usernames } from '../username';

/**
 * - `saved`, `other`: two saved accounts (with a sign-in key).
 * - `guest`: a guest account.
 */
export type UsernamesContractPlayer = 'saved' | 'other' | 'guest';

export interface UsernamesContractSubject {
  /** The port as a signed-in player, or with nobody signed in (`null`). */
  readonly usernamesFor: (player: UsernamesContractPlayer | null) => Usernames;
  /** The `Invites` of a saved player, on the same server. */
  readonly invitesFor: (player: 'saved' | 'other') => Invites;
  /** Moves the server clock forward by `ms`. Never wait on a real clock here. */
  readonly passTime: (ms: number) => Promise<void>;
}

export interface UsernamesContractCheck {
  readonly name: string;
  readonly run: (subject: UsernamesContractSubject) => Promise<void>;
}

const GAME: NewInvite = { choice: 'portes', targetPoints: 3, turnTimeMinutes: null };
/** The answers of a first pick. */
const STEP = { acceptTerms: TERMS_VERSION, ageChecked: true } as const;
const DAY = 24 * 60 * 60 * 1000;

/** JSON with the keys of each object sorted: a server may send them in any order. */
function sortedJson(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) =>
    typeof item === 'object' && item !== null && !Array.isArray(item)
      ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : item,
  );
}

function same(actual: unknown, expected: unknown, what: string): void {
  const a = sortedJson(actual);
  const e = sortedJson(expected);
  if (a !== e) throw new Error(`${what}: expected ${e}, got ${a}`);
}

/** `call` rejects with `code`, as plain JSON data. */
async function failsWith(
  call: Promise<unknown>,
  code: UsernameErrorCode,
  what: string,
): Promise<void> {
  const reason = await call.then(
    () => {
      throw new Error(`${what}: expected a ${code} rejection, but the call resolved`);
    },
    (error: unknown) => error,
  );
  if (reason instanceof Error && reason.message.startsWith(what)) throw reason;
  if (!isUsernameErrorData(reason) || reason.code !== code) {
    throw new Error(`${what}: expected ${code}, got ${JSON.stringify(reason)}`);
  }
  same(JSON.parse(JSON.stringify(reason)), reason, `${what}: the error is plain JSON`);
}

function named(state: MyUsername, name: string | null, what: string): void {
  same(state.name, name, `${what}: name`);
}

export function usernamesContract(): readonly UsernamesContractCheck[] {
  return [
    {
      name: 'refuses every call with nobody signed in',
      run: async (subject) => {
        const usernames = subject.usernamesFor(null);
        await failsWith(usernames.mine(), 'NOT_SIGNED_IN', 'mine()');
        await failsWith(usernames.setMine({ name: 'Alex', ...STEP }), 'NOT_SIGNED_IN', 'setMine()');
      },
    },
    {
      name: 'a guest has no username and may not pick one',
      run: async (subject) => {
        const usernames = subject.usernamesFor('guest');
        same(
          await usernames.mine(),
          { saved: false, name: null, nextChangeAt: null, ageChecked: false, termsVersion: null },
          'mine()',
        );
        await failsWith(usernames.setMine({ name: 'Alex', ...STEP }), 'NOT_SAVED', 'setMine()');
      },
    },
    {
      name: 'a saved player picks a name after the terms and the age',
      run: async (subject) => {
        const usernames = subject.usernamesFor('saved');
        same(
          await usernames.mine(),
          { saved: true, name: null, nextChangeAt: null, ageChecked: false, termsVersion: null },
          'mine() before',
        );
        await failsWith(
          usernames.setMine({ name: 'Alex', ageChecked: true }),
          'TERMS_NEEDED',
          'setMine() with no terms',
        );
        await failsWith(
          usernames.setMine({ name: 'Alex', acceptTerms: TERMS_VERSION }),
          'AGE_NEEDED',
          'setMine() with no age',
        );
        named(await usernames.mine(), null, 'mine() after the refusals');
        const picked = await usernames.setMine({ name: 'Νίκος_7', ...STEP });
        same(
          picked,
          {
            saved: true,
            name: 'Νίκος_7',
            nextChangeAt: null,
            ageChecked: true,
            termsVersion: TERMS_VERSION,
          },
          'setMine()',
        );
        same(await usernames.mine(), picked, 'mine() after');
      },
    },
    {
      name: 'refuses a name that breaks the rules or is not allowed',
      run: async (subject) => {
        const usernames = subject.usernamesFor('saved');
        await failsWith(usernames.setMine({ name: 'a b', ...STEP }), 'BAD_NAME', 'a space');
        await failsWith(usernames.setMine({ name: 'ab', ...STEP }), 'BAD_NAME', 'too short');
        await failsWith(usernames.setMine({ name: '7up', ...STEP }), 'BAD_NAME', 'a digit first');
        await failsWith(usernames.setMine({ name: 'Admin', ...STEP }), 'NOT_ALLOWED', 'reserved');
        named(await usernames.mine(), null, 'mine()');
      },
    },
    {
      name: 'a name is unique ignoring case, accents and look-alikes',
      run: async (subject) => {
        await subject.usernamesFor('saved').setMine({ name: 'Alexis', ...STEP });
        const other = subject.usernamesFor('other');
        for (const name of ['alexis', 'ALEXÍS', 'AIexis']) {
          await failsWith(other.setMine({ name, ...STEP }), 'TAKEN', `"${name}"`);
        }
        named(await other.mine(), null, 'the other player');
        named(await other.setMine({ name: 'Alexia', ...STEP }), 'Alexia', 'another name');
      },
    },
    {
      name: 'the first pick may change at once, then once in 30 days',
      run: async (subject) => {
        const usernames = subject.usernamesFor('saved');
        await usernames.setMine({ name: 'Alex', ...STEP });
        const changed = await usernames.setMine({ name: 'Alexander' });
        named(changed, 'Alexander', 'the first change');
        if (changed.nextChangeAt === null) throw new Error('first change: no next change time');
        await failsWith(usernames.setMine({ name: 'Sandro' }), 'TOO_SOON', 'a second change');
        await subject.passTime(DAY);
        await failsWith(usernames.setMine({ name: 'Sandro' }), 'TOO_SOON', 'a day later');
        await subject.passTime(USERNAME_CHANGE_MS - DAY);
        named(await usernames.setMine({ name: 'Sandro' }), 'Sandro', '30 days later');
      },
    },
    {
      name: 'a dropped name is free for others at once',
      run: async (subject) => {
        const usernames = subject.usernamesFor('saved');
        await usernames.setMine({ name: 'Alex', ...STEP });
        await usernames.setMine({ name: 'Alexander' });
        named(
          await subject.usernamesFor('other').setMine({ name: 'alex', ...STEP }),
          'alex',
          'the other player',
        );
      },
    },
    {
      name: 'the same name again is no change',
      run: async (subject) => {
        const usernames = subject.usernamesFor('saved');
        await usernames.setMine({ name: 'Alex', ...STEP });
        await usernames.setMine({ name: 'Alexander' });
        const again = await usernames.setMine({ name: 'Alexander' });
        named(again, 'Alexander', 'the same name');
      },
    },
    {
      name: 'other players see the username on an invite',
      run: async (subject) => {
        await subject.usernamesFor('saved').setMine({ name: 'Μαρία', ...STEP });
        const code = await subject.invitesFor('saved').createInvite(GAME);
        const view = await subject.invitesFor('other').getInvite(code);
        same(view?.fromName, usernameName('Μαρία'), 'fromName');
      },
    },
  ];
}

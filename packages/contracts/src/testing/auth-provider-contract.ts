/**
 * The `AuthProvider` port contract (#131), as plain async checks that
 * work in any test runner (Vitest in packages, Jest in the app).
 *
 *   for (const check of authProviderContract()) {
 *     it(check.name, () => check.run(makeSubject()));
 *   }
 *
 * Make a new subject for each check: it starts with nobody signed in. A
 * check rejects with an `Error` when the provider breaks the contract.
 * The checks never wait on a clock: they call `subject.settle()` in a
 * loop while they wait for a change.
 */
import type { AuthProvider, AuthUser } from '../auth';

export interface AuthProviderContractSubject {
  /** The provider under test. Nobody is signed in yet. */
  readonly auth: AuthProvider;
  /**
   * A new provider that reads the same saved session, like the app after
   * a restart.
   */
  readonly restart: () => AuthProvider;
  /** The player id a token names: its `subject` (`sub`). */
  readonly tokenSubject: (token: string) => string;
  /**
   * Lets the provider deliver. Default: wait one microtask. Never wait on
   * a real clock here.
   */
  readonly settle?: () => Promise<void>;
}

export interface AuthProviderContractCheck {
  readonly name: string;
  readonly run: (subject: AuthProviderContractSubject) => Promise<void>;
}

/** `settle()` calls before a check gives up waiting. */
const MAX_SETTLES = 200;
/** `settle()` calls that must pass with no change, to show that none comes. */
const QUIET_SETTLES = 20;

function same(actual: unknown, expected: unknown, what: string): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${what}: expected ${e}, got ${a}`);
}

function settler(subject: AuthProviderContractSubject): () => Promise<void> {
  return subject.settle ?? (() => Promise.resolve());
}

async function waitUntil(
  subject: AuthProviderContractSubject,
  done: () => boolean,
  what: string,
): Promise<void> {
  const settle = settler(subject);
  for (let i = 0; i < MAX_SETTLES; i++) {
    if (done()) return;
    await settle();
  }
  if (!done()) throw new Error(`gave up waiting for ${what}`);
}

async function stayQuiet(subject: AuthProviderContractSubject): Promise<void> {
  const settle = settler(subject);
  for (let i = 0; i < QUIET_SETTLES; i++) await settle();
}

function checkGuest(user: AuthUser, what: string): void {
  if (typeof user.id !== 'string' || user.id.trim() === '') {
    throw new Error(`${what}: the user id is empty`);
  }
  same(user.isGuest, true, `${what}: isGuest`);
}

async function tokenOf(auth: AuthProvider, what: string): Promise<string> {
  const token = await auth.getToken();
  if (typeof token !== 'string' || token === '') throw new Error(`${what}: no token`);
  return token;
}

export function authProviderContract(): AuthProviderContractCheck[] {
  return [
    {
      name: 'starts signed out: no user and no token',
      run: async ({ auth }) => {
        same(await auth.ready(), null, 'ready()');
        same(auth.currentUser(), null, 'currentUser()');
        same(await auth.getToken(), null, 'getToken()');
      },
    },
    {
      name: 'a guest sign-in gives a guest user and a token whose subject is the user id',
      run: async (subject) => {
        const { auth } = subject;
        await auth.ready();
        const user = await auth.signInAsGuest();
        checkGuest(user, 'signInAsGuest()');
        same(auth.currentUser(), user, 'currentUser()');
        const token = await tokenOf(auth, 'getToken()');
        same(subject.tokenSubject(token), user.id, 'the token subject');
        const fresh = await auth.getToken({ forceRefresh: true });
        if (fresh === null) throw new Error('getToken({ forceRefresh }): no token');
        same(subject.tokenSubject(fresh), user.id, 'the subject of a refreshed token');
      },
    },
    {
      name: 'a second guest sign-in keeps the same user',
      run: async ({ auth }) => {
        await auth.ready();
        const first = await auth.signInAsGuest();
        const second = await auth.signInAsGuest();
        same(second, first, 'the second signInAsGuest()');
        same(auth.currentUser(), first, 'currentUser()');
      },
    },
    {
      name: 'sign-out clears the user and the token; a new guest gets a new id',
      run: async ({ auth }) => {
        await auth.ready();
        const first = await auth.signInAsGuest();
        await auth.signOut();
        same(auth.currentUser(), null, 'currentUser() after signOut()');
        same(await auth.getToken(), null, 'getToken() after signOut()');
        // Signing out again does nothing.
        await auth.signOut();
        const second = await auth.signInAsGuest();
        checkGuest(second, 'signInAsGuest() after signOut()');
        if (second.id === first.id) throw new Error('the new guest got the old id');
      },
    },
    {
      name: 'onChange reports each sign-in and sign-out, later, until stopped',
      run: async (subject) => {
        const { auth } = subject;
        await auth.ready();
        const seen: (AuthUser | null)[] = [];
        const stop = auth.onChange((user) => seen.push(user));
        same(seen, [], 'calls inside onChange()');
        const user = await auth.signInAsGuest();
        await waitUntil(subject, () => seen.some((u) => u !== null), 'the sign-in change');
        same(seen[seen.length - 1], user, 'the user after sign-in');
        await auth.signOut();
        await waitUntil(subject, () => seen[seen.length - 1] === null, 'the sign-out change');
        stop();
        const count = seen.length;
        await auth.signInAsGuest();
        await stayQuiet(subject);
        same(seen.length, count, 'calls after stop()');
      },
    },
    {
      name: 'a restart keeps the session',
      run: async (subject) => {
        await subject.auth.ready();
        const user = await subject.auth.signInAsGuest();
        const again = subject.restart();
        same(await again.ready(), user, 'ready() after a restart');
        same(again.currentUser(), user, 'currentUser() after a restart');
        const token = await tokenOf(again, 'getToken() after a restart');
        same(subject.tokenSubject(token), user.id, 'the token subject after a restart');
      },
    },
    {
      name: 'a restart after sign-out starts signed out',
      run: async (subject) => {
        await subject.auth.ready();
        await subject.auth.signInAsGuest();
        await subject.auth.signOut();
        const again = subject.restart();
        same(await again.ready(), null, 'ready() after a restart');
        same(again.currentUser(), null, 'currentUser() after a restart');
      },
    },
    {
      name: 'a user is a copy: changing it changes nothing in the provider',
      run: async ({ auth }) => {
        await auth.ready();
        const user = await auth.signInAsGuest();
        const id = user.id;
        (user as { id: string }).id = 'someone-else';
        same(auth.currentUser()?.id, id, 'currentUser().id');
      },
    },
  ];
}

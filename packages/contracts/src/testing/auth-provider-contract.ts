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
import { isAuthErrorData } from '../auth';
import type {
  AuthErrorCode,
  AuthErrorData,
  AuthKeyCredential,
  AuthProvider,
  AuthUser,
  GuestMoveOffer,
} from '../auth';

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
   * An Apple id token for the Apple user `sub` that carries `nonce`, as
   * the Apple sheet gives it. The provider (or its fake server) accepts it.
   */
  readonly appleIdToken: (sub: string, nonce: string) => Promise<string>;
  /**
   * The code in the newest email that `requestEmailCode` sent to `email`
   * (in lower case), read from the fake mail service (#399). Never real
   * mail. Rejects when no code went there.
   */
  readonly emailCode: (email: string) => Promise<string>;
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

function checkSaved(user: AuthUser, what: string): void {
  if (typeof user.id !== 'string' || user.id.trim() === '') {
    throw new Error(`${what}: the user id is empty`);
  }
  same(user.isGuest, false, `${what}: isGuest`);
}

/** A fresh Apple credential for `sub`: a new nonce, then a token that carries it. */
async function apple(
  subject: AuthProviderContractSubject,
  sub: string,
): Promise<AuthKeyCredential> {
  const nonce = await subject.auth.keyNonce();
  if (typeof nonce !== 'string' || nonce === '') throw new Error('keyNonce(): no nonce');
  return { provider: 'apple', idToken: await subject.appleIdToken(sub, nonce), nonce };
}

/** A fresh email credential: a code is sent to `email`, then read from the fake inbox. */
async function emailKey(
  subject: AuthProviderContractSubject,
  email: string,
): Promise<AuthKeyCredential> {
  await subject.auth.requestEmailCode(email, 'en');
  return { provider: 'email', email, code: await subject.emailCode(email.trim().toLowerCase()) };
}

/** A code of 6 digits that is not `code`. */
function otherCode(code: string): string {
  return code === '000000' ? '000001' : '000000';
}

async function rejectsWith(
  call: Promise<unknown>,
  code: AuthErrorCode,
  what: string,
): Promise<AuthErrorData> {
  let error: unknown;
  try {
    await call;
  } catch (caught) {
    error = caught;
  }
  if (error === undefined) throw new Error(`${what}: expected ${code}, but it resolved`);
  if (!isAuthErrorData(error)) {
    throw new Error(`${what}: expected AuthErrorData ${code}, got ${String(error)}`);
  }
  same(error.code, code, `${what}: the error code`);
  return error;
}

/** The move offer of a guest's `KEY_BELONGS_TO_OTHER` (#403). */
function offerOf(error: AuthErrorData, what: string): GuestMoveOffer {
  const move = error.move;
  if (move === undefined) throw new Error(`${what}: no move offer`);
  if (typeof move.ticket !== 'string' || move.ticket === '') {
    throw new Error(`${what}: the offer has no ticket`);
  }
  for (const count of [move.activeGames, move.openInvites]) {
    if (!Number.isInteger(count) || count < 0) throw new Error(`${what}: a count is ${count}`);
  }
  return move;
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
    {
      name: 'an Apple sign-in gives a saved user; the same Apple id on a new phone gives the same user',
      run: async (subject) => {
        const { auth } = subject;
        await auth.ready();
        const user = await auth.signInWithKey(await apple(subject, 'apple-a'));
        checkSaved(user, 'signInWithKey()');
        same(auth.currentUser(), user, 'currentUser()');
        const token = await tokenOf(auth, 'getToken()');
        same(subject.tokenSubject(token), user.id, 'the token subject');
        same(await auth.listKeys(), [{ provider: 'apple' }], 'listKeys()');
        await auth.signOut();
        const again = await auth.signInWithKey(await apple(subject, 'apple-a'));
        same(again, user, 'signInWithKey() with the same Apple id');
      },
    },
    {
      name: 'a key sign-in turns down a used nonce and a token without the nonce',
      run: async (subject) => {
        const { auth } = subject;
        await auth.ready();
        const used = await apple(subject, 'apple-a');
        await auth.signInWithKey(used);
        await auth.signOut();
        await rejectsWith(auth.signInWithKey(used), 'REJECTED', 'a used nonce');
        const nonce = await auth.keyNonce();
        const other = await auth.keyNonce();
        const wrong = {
          provider: 'apple' as const,
          idToken: await subject.appleIdToken('apple-a', other),
          nonce,
        };
        await rejectsWith(auth.signInWithKey(wrong), 'REJECTED', 'a token with another nonce');
        same(auth.currentUser(), null, 'currentUser() after the refusals');
      },
    },
    {
      name: 'a key sign-in while signed in is SIGNED_IN and changes nothing',
      run: async (subject) => {
        const { auth } = subject;
        await auth.ready();
        const guest = await auth.signInAsGuest();
        await rejectsWith(
          auth.signInWithKey(await apple(subject, 'apple-a')),
          'SIGNED_IN',
          'signInWithKey()',
        );
        same(auth.currentUser(), guest, 'currentUser()');
      },
    },
    {
      name: 'a guest saves a key and keeps the same id; onChange reports it',
      run: async (subject) => {
        const { auth } = subject;
        await auth.ready();
        const guest = await auth.signInAsGuest();
        same(await auth.listKeys(), [], 'listKeys() of a guest');
        const seen: (AuthUser | null)[] = [];
        const stop = auth.onChange((user) => seen.push(user));
        const saved = await auth.saveKey(await apple(subject, 'apple-a'));
        same(saved, { id: guest.id, isGuest: false }, 'saveKey()');
        same(auth.currentUser(), saved, 'currentUser()');
        await waitUntil(subject, () => seen.some((u) => u?.isGuest === false), 'the save change');
        stop();
        same(await auth.listKeys(), [{ provider: 'apple' }], 'listKeys()');
        // Saving the same key again changes nothing.
        same(await auth.saveKey(await apple(subject, 'apple-a')), saved, 'saveKey() again');
        // The key now signs in to this account.
        await auth.signOut();
        same(await auth.signInWithKey(await apple(subject, 'apple-a')), saved, 'a later sign-in');
      },
    },
    {
      name: "saving another account's key is KEY_BELONGS_TO_OTHER and changes nothing",
      run: async (subject) => {
        const { auth } = subject;
        await auth.ready();
        const owner = await auth.signInWithKey(await apple(subject, 'apple-a'));
        await auth.signOut();
        const guest = await auth.signInAsGuest();
        await rejectsWith(
          auth.saveKey(await apple(subject, 'apple-a')),
          'KEY_BELONGS_TO_OTHER',
          'saveKey()',
        );
        same(auth.currentUser(), guest, 'currentUser()');
        same(await auth.listKeys(), [], 'listKeys()');
        await auth.signOut();
        same(
          await auth.signInWithKey(await apple(subject, 'apple-a')),
          owner,
          'the owner signs in',
        );
      },
    },
    {
      name: 'a guest with another account’s key gets a move offer, and the move signs in there',
      run: async (subject) => {
        const { auth } = subject;
        await auth.ready();
        const owner = await auth.signInWithKey(await apple(subject, 'apple-a'));
        await auth.signOut();
        const guest = await auth.signInAsGuest();
        const error = await rejectsWith(
          auth.saveKey(await apple(subject, 'apple-a')),
          'KEY_BELONGS_TO_OTHER',
          'saveKey()',
        );
        const offer = offerOf(error, 'saveKey()');
        same(auth.currentUser(), guest, 'currentUser() before the move');

        same(await auth.moveGuest(offer), owner, 'moveGuest()');
        same(auth.currentUser(), owner, 'currentUser() after the move');
        same(subject.tokenSubject(await tokenOf(auth, 'the move')), owner.id, 'the token subject');
        same(await auth.listKeys(), [{ provider: 'apple' }], 'listKeys()');
        // The offer worked once: the account is no guest.
        await rejectsWith(auth.moveGuest(offer), 'REJECTED', 'a second move');
        const again = subject.restart();
        same(await again.ready(), owner, 'ready() after a restart');
      },
    },
    {
      name: 'a saved account gets no move offer; another guest’s offer is refused',
      run: async (subject) => {
        const { auth } = subject;
        await auth.ready();
        await auth.signInWithKey(await apple(subject, 'apple-a'));
        await auth.signOut();
        const other = await auth.signInWithKey(await apple(subject, 'apple-b'));
        const saved = await rejectsWith(
          auth.saveKey(await apple(subject, 'apple-a')),
          'KEY_BELONGS_TO_OTHER',
          'a saved account',
        );
        same(saved.move, undefined, 'the offer of a saved account');
        await rejectsWith(
          auth.moveGuest({ ticket: 'not-a-ticket', activeGames: 0, openInvites: 0 }),
          'REJECTED',
          'a move of a saved account',
        );
        same(auth.currentUser(), other, 'currentUser() of the saved account');
        await auth.signOut();

        await auth.signInAsGuest();
        const offer = offerOf(
          await rejectsWith(
            auth.saveKey(await apple(subject, 'apple-a')),
            'KEY_BELONGS_TO_OTHER',
            'the first guest',
          ),
          'the first guest',
        );
        await auth.signOut();
        const second = await auth.signInAsGuest();
        await rejectsWith(auth.moveGuest(offer), 'REJECTED', 'another guest’s offer');
        await rejectsWith(
          auth.moveGuest({ ...offer, ticket: `${offer.ticket}x` }),
          'REJECTED',
          'a changed ticket',
        );
        same(auth.currentUser(), second, 'currentUser() after the refusals');
        same(await auth.listKeys(), [], 'listKeys() of the second guest');
      },
    },
    {
      name: 'saving a key needs a sign-in; a second Apple id is refused',
      run: async (subject) => {
        const { auth } = subject;
        await auth.ready();
        await rejectsWith(
          auth.saveKey(await apple(subject, 'apple-a')),
          'REJECTED',
          'saveKey() signed out',
        );
        same(await auth.listKeys(), [], 'listKeys() signed out');
        await auth.signInWithKey(await apple(subject, 'apple-a'));
        await rejectsWith(
          auth.saveKey(await apple(subject, 'apple-b')),
          'REJECTED',
          'a second Apple id',
        );
      },
    },
    {
      name: 'the last key cannot be removed; removing a missing key does nothing',
      run: async (subject) => {
        const { auth } = subject;
        await auth.ready();
        await rejectsWith(auth.removeKey('apple'), 'REJECTED', 'removeKey() signed out');
        await auth.signInAsGuest();
        await auth.removeKey('apple');
        await auth.saveKey(await apple(subject, 'apple-a'));
        await rejectsWith(auth.removeKey('apple'), 'LAST_KEY', 'removeKey() of the last key');
        same(await auth.listKeys(), [{ provider: 'apple' }], 'listKeys()');
      },
    },
    {
      name: 'an email code signs in to a new saved account; a new code later finds it again',
      run: async (subject) => {
        const { auth } = subject;
        await auth.ready();
        const first = await auth.signInWithKey(await emailKey(subject, ' Eleni@Example.com '));
        checkSaved(first, 'the first email sign-in');
        same(
          subject.tokenSubject(await tokenOf(auth, 'getToken()')),
          first.id,
          'the token subject',
        );
        same(await auth.listKeys(), [{ provider: 'email' }], 'listKeys()');
        same(await subject.restart().ready(), first, 'ready() after a restart');
        await auth.signOut();
        const second = await auth.signInWithKey(await emailKey(subject, 'eleni@example.com'));
        same(second, first, 'the second email sign-in');
      },
    },
    {
      name: 'an email code works once; a wrong code is WRONG_CODE until the last try',
      run: async (subject) => {
        const { auth } = subject;
        await auth.ready();
        const used = await emailKey(subject, 'ann@example.com');
        await auth.signInWithKey(used);
        await auth.signOut();
        await rejectsWith(auth.signInWithKey(used), 'REJECTED', 'a used code');

        const live = await emailKey(subject, 'ann@example.com');
        if (live.provider !== 'email') throw new Error('not an email key');
        const wrong = { ...live, code: otherCode(live.code) };
        await rejectsWith(auth.signInWithKey(wrong), 'WRONG_CODE', 'the first wrong code');
        await rejectsWith(auth.signInWithKey(wrong), 'WRONG_CODE', 'the second wrong code');
        await rejectsWith(auth.signInWithKey(wrong), 'REJECTED', 'the last wrong code');
        await rejectsWith(auth.signInWithKey(live), 'REJECTED', 'the right code after that');
        same(auth.currentUser(), null, 'currentUser() after the refusals');

        // A new code replaces the old one. Another address: a server
        // sends one address only a few codes in a short time.
        const old = await emailKey(subject, 'bea@example.com');
        const fresh = await emailKey(subject, 'bea@example.com');
        if (old.provider === 'email' && fresh.provider === 'email' && old.code !== fresh.code) {
          await rejectsWith(auth.signInWithKey(old), 'WRONG_CODE', 'the replaced code');
        }
        checkSaved(await auth.signInWithKey(fresh), 'the new code');
      },
    },
    {
      name: 'a bad address is REJECTED; a known and a new address get the same answer',
      run: async (subject) => {
        const { auth } = subject;
        await auth.ready();
        for (const email of ['', 'eleni', 'eleni@example', 'a b@example.com']) {
          await rejectsWith(auth.requestEmailCode(email, 'en'), 'REJECTED', `"${email}"`);
        }
        await auth.signInWithKey(await emailKey(subject, 'known@example.com'));
        await auth.signOut();
        same(await auth.requestEmailCode('known@example.com', 'el'), undefined, 'a known address');
        same(await auth.requestEmailCode('new@example.com', 'el'), undefined, 'a new address');
        same(auth.currentUser(), null, 'currentUser()');
      },
    },
    {
      name: 'a guest saves an email key and keeps its id; an email sign-in while signed in is SIGNED_IN',
      run: async (subject) => {
        const { auth } = subject;
        await auth.ready();
        const guest = await auth.signInAsGuest();
        await rejectsWith(
          auth.signInWithKey(await emailKey(subject, 'kostas@example.com')),
          'SIGNED_IN',
          'an email sign-in as a guest',
        );
        const saved = await auth.saveKey(await emailKey(subject, 'kostas@example.com'));
        same(saved, { id: guest.id, isGuest: false }, 'saveKey() with an email code');
        // A second key kind; then either one may go.
        await auth.saveKey(await apple(subject, 'apple-kostas'));
        const kinds = (await auth.listKeys()).map((key) => key.provider).sort();
        same(kinds, ['apple', 'email'], 'listKeys()');
        await auth.removeKey('email');
        same(await auth.listKeys(), [{ provider: 'apple' }], 'listKeys() after removeKey()');
      },
    },
    {
      name: 'a guest with another account’s email gets a move offer',
      run: async (subject) => {
        const { auth } = subject;
        await auth.ready();
        const owner = await auth.signInWithKey(await emailKey(subject, 'maria@example.com'));
        await auth.signOut();
        await auth.signInAsGuest();
        const error = await rejectsWith(
          auth.saveKey(await emailKey(subject, 'maria@example.com')),
          'KEY_BELONGS_TO_OTHER',
          'saveKey() with the account’s email',
        );
        const moved = await auth.moveGuest(offerOf(error, 'the offer'));
        same(moved, owner, 'moveGuest()');
      },
    },
    {
      name: 'a restart keeps a saved account',
      run: async (subject) => {
        await subject.auth.ready();
        await subject.auth.signInAsGuest();
        const saved = await subject.auth.saveKey(await apple(subject, 'apple-a'));
        const again = subject.restart();
        same(await again.ready(), saved, 'ready() after a restart');
        same(again.currentUser(), saved, 'currentUser() after a restart');
      },
    },
  ];
}

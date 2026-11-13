/**
 * The sign-in port (#131, ADR-0004, ADR-0008).
 *
 * Online play needs a signed-in user. The server reads the player id from
 * the sign-in token, never from an argument. A guest (anonymous) account is
 * enough to play. A guest can save their account by adding a sign-in key
 * (`saveKey`, #397) and keeps the same id; a phone with no session signs
 * in with a key (`signInWithKey`). Keys: Apple, the email code (#399:
 * `requestEmailCode`, then the code as the credential), and Google (#410)
 * later.
 *
 * The Better Auth adapter is `@tavli/auth-better-auth`. The in-memory
 * provider below is for tests and for the app before the server is live.
 * The contract checks are `authProviderContract` in `@tavli/contracts/testing`.
 * See "Sign-in" in `docs/architecture/online-game-service.md`.
 */

import { EMAIL_CODE_TRIES, isEmailCodeLanguage, normalizeEmail } from './email-code';
import type { EmailCodeLanguage } from './email-code';

/** The signed-in user. Plain JSON. */
export interface AuthUser {
  /**
   * The player id. It is the `subject` (`sub`) of the token from
   * `getToken`, the id the server uses. It stays the same while the user
   * stays signed in to this account, also when a guest saves it.
   */
  readonly id: string;
  /**
   * True for a guest (anonymous) account: one with no sign-in key. A guest
   * that signs out loses the account.
   */
  readonly isGuest: boolean;
}

/** The kinds of sign-in key. Google (#410) comes later. */
export const AUTH_KEY_PROVIDERS = ['apple', 'email'] as const;

export type AuthKeyProvider = (typeof AUTH_KEY_PROVIDERS)[number];

/**
 * Proof that the player owns an Apple key, from the Sign in with Apple
 * sheet on the phone (#401). Get the nonce from `keyNonce()` first and
 * give it to the sheet: the id token must carry it.
 */
export interface AppleKeyCredential {
  readonly provider: 'apple';
  /** The id token (a JWT) from the provider's sheet. */
  readonly idToken: string;
  /** The nonce from `keyNonce()`, as it was before the sheet hashed it. */
  readonly nonce: string;
  /**
   * Apple's one-time code from the same sheet (#398, #401). After the
   * sign-in or the save, the provider sends it to the server once, so the
   * server can revoke Apple's token on account delete. A failed send does
   * not fail the sign-in. Never log it.
   */
  readonly authorizationCode?: string;
}

/**
 * Proof that the player owns an email address (#399): the code from
 * `requestEmailCode`, sent to that address. A code works once, for
 * `EMAIL_CODE_TTL_MS`, and takes `EMAIL_CODE_TRIES` wrong tries.
 */
export interface EmailKeyCredential {
  readonly provider: 'email';
  /** The address, as the player typed it (the provider normalizes it). */
  readonly email: string;
  /** The 6 digits from the email. Never log it. */
  readonly code: string;
}

/** Proof that the player owns a key. */
export type AuthKeyCredential = AppleKeyCredential | EmailKeyCredential;

/** A sign-in key of the signed-in account. Plain JSON. */
export interface AuthKey {
  readonly provider: AuthKeyProvider;
}

/** Why a sign-in call failed. */
export const AUTH_ERROR_CODES = [
  /** The auth server could not be reached. Try again later. */
  'NETWORK',
  /** The auth server said no (a bad or used credential, no session, …). */
  'REJECTED',
  /** `signInWithKey` while a user is signed in: sign out first, or `saveKey`. */
  'SIGNED_IN',
  /**
   * `saveKey` with a key that another account has. Nothing changed. The
   * player can sign in to that account instead (#403).
   */
  'KEY_BELONGS_TO_OTHER',
  /** `removeKey` of the account's last key. An account keeps at least one. */
  'LAST_KEY',
  /**
   * An email code that is not the one sent (#399). The code still works:
   * the player may type it again. After the last wrong try the code is
   * used up, and the answer is `REJECTED`.
   */
  'WRONG_CODE',
  /** `requestEmailCode` too often for this address, phone or server. Try again later. */
  'RATE_LIMITED',
  /**
   * This kind of key is off on the server (#462): Apple with no Services
   * ID, or email with no mail service. Another kind may still work.
   */
  'KEY_OFF',
] as const;

export type AuthErrorCode = (typeof AUTH_ERROR_CODES)[number];

/** The data of a failed sign-in call. */
export interface AuthErrorData {
  readonly code: AuthErrorCode;
  readonly message: string;
  /**
   * With `KEY_BELONGS_TO_OTHER` from `saveKey` when the signed-in user is
   * a guest (#403): what the guest would move into the account that has
   * the key. A saved account never gets one: two saved accounts never
   * merge.
   */
  readonly move?: GuestMoveOffer;
  /**
   * With `RATE_LIMITED`, when the server says: how long to wait before the
   * next code may go out, ms.
   */
  readonly retryAfterMs?: number;
}

/** What a guest has, now that it might move into an account (#403). Plain JSON. */
export interface GuestMoveCounts {
  /** The guest's online games in progress. */
  readonly activeGames: number;
  /** The guest's open invites. */
  readonly openInvites: number;
}

/**
 * A guest may move into the account that has the key it tried to save
 * (#403). Show the counts and ask; nothing moves before `moveGuest`.
 */
export interface GuestMoveOffer extends GuestMoveCounts {
  /**
   * The server's proof that this guest proved the key, for `moveGuest`.
   * It works for a few minutes, for this guest only. Never log it.
   */
  readonly ticket: string;
}

export function isAuthErrorData(value: unknown): value is AuthErrorData {
  if (typeof value !== 'object' || value === null) return false;
  const { code, message } = value as { code?: unknown; message?: unknown };
  return (
    typeof message === 'string' &&
    typeof code === 'string' &&
    (AUTH_ERROR_CODES as readonly string[]).includes(code)
  );
}

export interface AuthProvider {
  /**
   * Resolves once the provider has loaded a saved session (at app start),
   * with the user or `null`. Call it before `currentUser`. It never
   * rejects: `null` may also mean it could not reach the server. To tell
   * an ended session from no network, use `loadSession()`.
   */
  ready(): Promise<AuthUser | null>;
  /**
   * Like `ready()`, but sure: `null` means the server has no session for
   * this phone (there was none, it ended, or the user signed out). When
   * the last load did not reach the server, it asks again, and rejects
   * with `NETWORK` when it still cannot. `ready()` gives `null` then too.
   */
  loadSession(): Promise<AuthUser | null>;
  /** The signed-in user, or `null`. */
  currentUser(): AuthUser | null;
  /**
   * Signs in as a guest. When a user is signed in already, resolves to
   * that user and makes no new account. Rejects with `AuthErrorData`.
   */
  signInAsGuest(): Promise<AuthUser>;
  /**
   * A new one-time nonce from the server, for the provider's sheet. It
   * works for one `signInWithKey` or `saveKey`, for a few minutes.
   * Rejects with `AuthErrorData`.
   */
  keyNonce(): Promise<string>;
  /**
   * Sends a sign-in code to `email` (#399), in `language`, for
   * `signInWithKey` or `saveKey` with an `EmailKeyCredential`. The answer
   * is the same whether or not the address has an account. A new code
   * replaces the last one. Rejects with `REJECTED` for an address that is
   * not valid (`normalizeEmail`) or when email codes are off on the
   * server, `RATE_LIMITED` when asked too often, and `NETWORK` when the
   * server or the mail service could not be reached.
   */
  requestEmailCode(email: string, language: EmailCodeLanguage): Promise<void>;
  /**
   * Signs in with a key, when nobody is signed in: to the account that
   * has the key, or to a new saved account. Rejects with `SIGNED_IN` when
   * a user is signed in (to keep a guest's games, call `saveKey`), with
   * `WRONG_CODE` for a wrong email code that may be typed again, and with
   * `REJECTED` for a bad or used credential.
   */
  signInWithKey(credential: AuthKeyCredential): Promise<AuthUser>;
  /**
   * Adds a key to the signed-in user, who keeps the same id. A guest is
   * then no longer a guest. Rejects with `KEY_BELONGS_TO_OTHER` when
   * another account has the key (nothing changes), and with `REJECTED`
   * when nobody is signed in, the credential is bad or used, or the
   * account has a key of this kind already. An email code may also give
   * `WRONG_CODE`; any key credential is used up by the call, also when it
   * gives `KEY_BELONGS_TO_OTHER`. Saving a key the user has already
   * resolves and changes nothing.
   */
  saveKey(credential: AuthKeyCredential): Promise<AuthUser>;
  /**
   * Moves the signed-in guest into the account of `offer` (#403, from a
   * `KEY_BELONGS_TO_OTHER` of `saveKey`), then signs in to that account.
   * The guest's games, invites, blocks and reports become the account's;
   * a game in progress between the two ends with the guest resigning.
   * Then the guest is gone. Rejects with `REJECTED` when nobody or a
   * saved account is signed in, or the offer is not this guest's, used or
   * too old: nothing changes then.
   */
  moveGuest(offer: GuestMoveOffer): Promise<AuthUser>;
  /** The signed-in account's keys; `[]` for a guest or when nobody is signed in. */
  listKeys(): Promise<readonly AuthKey[]>;
  /**
   * Removes the account's key of this kind. Rejects with `LAST_KEY` for
   * its last key. Does nothing when the account has no such key. Rejects
   * with `REJECTED` when nobody is signed in.
   */
  removeKey(provider: AuthKeyProvider): Promise<void>;
  /**
   * Signs out. Does nothing when nobody is signed in. Rejects with
   * `AuthErrorData` when it fails; the user then stays signed in.
   */
  signOut(): Promise<void>;
  /**
   * A token for the backend client (Convex `setAuth`), or `null` when
   * nobody is signed in. `forceRefresh` asks for a new token even if the
   * saved one is still valid (the backend client does this when the
   * server refused the old one).
   */
  getToken(options?: { readonly forceRefresh?: boolean }): Promise<string | null>;
  /**
   * Calls `listener` with the new user (or `null`) after every sign-in,
   * sign-out and saved key. Never inside `onChange` itself. Returns a
   * function that stops the calls.
   */
  onChange(listener: (user: AuthUser | null) => void): () => void;
}

/** The token format of the in-memory provider: this prefix, then the user id. */
export const MEMORY_AUTH_TOKEN_PREFIX = 'memory-token:';

/**
 * The id token format of the in-memory provider's fake Apple: this prefix,
 * then `<sub>:<nonce>`. `memoryAppleIdToken` makes one.
 */
export const MEMORY_APPLE_TOKEN_PREFIX = 'memory-apple:';

/** A fake Apple id token for `sub` that the in-memory provider accepts with `nonce`. */
export function memoryAppleIdToken(sub: string, nonce: string): string {
  return `${MEMORY_APPLE_TOKEN_PREFIX}${sub}:${nonce}`;
}

/**
 * Where the in-memory provider keeps its session, like the phone's secure
 * store, and its accounts, like the server. Pass the same store to a
 * second provider to act out an app restart.
 */
export interface MemoryAuthStore {
  session: AuthUser | null;
  /** Guest accounts made so far; the next id is `guest-<n + 1>`. */
  guests: number;
  /** Saved accounts made by a key sign-in so far; the next id is `user-<n + 1>`. */
  users: number;
  /** Each key's account: `<provider>:<sub>` → user id. */
  keys: Record<string, string>;
  /** Nonces made so far; the next is `nonce-<n + 1>`. */
  nonces: number;
  /** Nonces made and not used yet. */
  openNonces: string[];
  /** Apple codes the provider sent to the "server", oldest first (`authorizationCode`). */
  appleCodes: string[];
  /** Move tickets made (#403) and not used yet. */
  openMoveTickets: string[];
  /**
   * The email codes sent so far, oldest first (#399): the inbox a test
   * reads. A code is `100000 + n`.
   */
  sentEmailCodes: { email: string; code: string; language: EmailCodeLanguage }[];
  /** The live code of each address and its wrong tries. */
  emailCodes: Record<string, { code: string; tries: number }>;
  /** Kinds of key that are off on this "server" (#462): their calls give `KEY_OFF`. */
  offKeys: AuthKeyProvider[];
  /** No network: `loadSession()` rejects with `NETWORK` (`ready()` still answers). */
  offline: boolean;
}

/**
 * The game server side of a guest move (#403), for the in-memory
 * provider: the memory game server's `guestMoveCounts` and `moveGuest`.
 * Without it a guest has nothing to count or move.
 */
export interface MemoryAuthGuestMoves {
  counts(playerId: string): GuestMoveCounts;
  move(source: string, target: string): void;
}

export function createMemoryAuthStore(): MemoryAuthStore {
  return {
    session: null,
    guests: 0,
    users: 0,
    keys: {},
    nonces: 0,
    openNonces: [],
    appleCodes: [],
    openMoveTickets: [],
    sentEmailCodes: [],
    emailCodes: {},
    offKeys: [],
    offline: false,
  };
}

function authError(code: AuthErrorCode, message: string): AuthErrorData {
  return { code, message };
}

/**
 * An `AuthProvider` in memory: guest ids `guest-1`, `guest-2`, …, saved
 * accounts `user-1`, …, and the token `memory-token:<id>`. Its fake Apple
 * accepts `memoryAppleIdToken(sub, nonce)` with a nonce from `keyNonce()`.
 * Its email codes go to `store.sentEmailCodes` (no mail, no limits).
 * Listeners get each change on a later microtask, like a real client.
 * `guestMoves` counts and moves a guest's games (#403).
 */
export function createMemoryAuthProvider(
  store: MemoryAuthStore = createMemoryAuthStore(),
  guestMoves?: MemoryAuthGuestMoves,
): AuthProvider {
  const listeners = new Set<(user: AuthUser | null) => void>();

  function changed(user: AuthUser | null): void {
    const copy = user === null ? null : { ...user };
    for (const listener of [...listeners]) {
      void Promise.resolve().then(() => {
        if (listeners.has(listener)) listener(copy === null ? null : { ...copy });
      });
    }
  }

  /** The key an email credential proves (`email:<address>`), using up its code. */
  function provenEmail(credential: EmailKeyCredential): string {
    const email = normalizeEmail(credential.email);
    const live = email === null ? undefined : store.emailCodes[email];
    if (email === null || live === undefined) {
      throw authError('REJECTED', 'no code for this address');
    }
    if (live.code !== credential.code) {
      live.tries += 1;
      if (live.tries < EMAIL_CODE_TRIES) throw authError('WRONG_CODE', 'the code is wrong');
      delete store.emailCodes[email];
      throw authError('REJECTED', 'the code is used up');
    }
    delete store.emailCodes[email];
    return `email:${email}`;
  }

  /** The key a credential proves (`<provider>:<sub>`), using up its nonce or code. */
  function provenKey(credential: AuthKeyCredential): string {
    if (store.offKeys.includes(credential.provider)) throw authError('KEY_OFF', 'this key is off');
    if (credential.provider === 'email') return provenEmail(credential);
    const prefix = MEMORY_APPLE_TOKEN_PREFIX;
    const at = store.openNonces.indexOf(credential.nonce);
    const body = credential.idToken.startsWith(prefix)
      ? credential.idToken.slice(prefix.length)
      : '';
    const sub = body.slice(0, body.lastIndexOf(':'));
    const nonce = body.slice(body.lastIndexOf(':') + 1);
    if (credential.provider !== 'apple' || at < 0 || sub === '' || nonce !== credential.nonce) {
      throw authError('REJECTED', 'the id token or its nonce is not valid');
    }
    store.openNonces.splice(at, 1);
    return `${credential.provider}:${sub}`;
  }

  function keysOf(userId: string): AuthKey[] {
    return Object.entries(store.keys)
      .filter(([, owner]) => owner === userId)
      .map(([key]) => ({ provider: key.slice(0, key.indexOf(':')) as AuthKeyProvider }));
  }

  return {
    ready: () => Promise.resolve(store.session === null ? null : { ...store.session }),
    async loadSession() {
      await Promise.resolve();
      if (store.offline) throw authError('NETWORK', 'could not load the session');
      return store.session === null ? null : { ...store.session };
    },
    currentUser: () => (store.session === null ? null : { ...store.session }),
    async signInAsGuest() {
      await Promise.resolve();
      if (store.session === null) {
        store.guests += 1;
        store.session = { id: `guest-${store.guests}`, isGuest: true };
        changed(store.session);
      }
      return { ...store.session };
    },
    async keyNonce() {
      await Promise.resolve();
      store.nonces += 1;
      const nonce = `nonce-${store.nonces}`;
      store.openNonces.push(nonce);
      return nonce;
    },
    async requestEmailCode(email, language) {
      await Promise.resolve();
      if (store.offKeys.includes('email')) throw authError('KEY_OFF', 'email codes are off');
      const address = normalizeEmail(email);
      if (address === null || !isEmailCodeLanguage(language)) {
        throw authError('REJECTED', 'not a valid address');
      }
      const code = String(100000 + store.sentEmailCodes.length + 1);
      store.sentEmailCodes.push({ email: address, code, language });
      store.emailCodes[address] = { code, tries: 0 };
    },
    async signInWithKey(credential) {
      await Promise.resolve();
      if (store.session !== null) throw authError('SIGNED_IN', 'sign out first');
      const key = provenKey(credential);
      let id = store.keys[key];
      if (id === undefined) {
        store.users += 1;
        id = `user-${store.users}`;
        store.keys[key] = id;
      }
      store.session = { id, isGuest: false };
      if (credential.provider === 'apple' && credential.authorizationCode !== undefined) {
        store.appleCodes.push(credential.authorizationCode);
      }
      changed(store.session);
      return { ...store.session };
    },
    async saveKey(credential) {
      await Promise.resolve();
      const user = store.session;
      if (user === null) throw authError('REJECTED', 'sign in first');
      const key = provenKey(credential);
      const owner = store.keys[key];
      if (owner !== undefined && owner !== user.id) {
        const error = authError('KEY_BELONGS_TO_OTHER', 'this key belongs to another account');
        if (!user.isGuest) throw error;
        // A guest may move into the owner's account (#403).
        const ticket = `memory-move:${user.id}:${owner}:${store.openMoveTickets.length + 1}`;
        store.openMoveTickets.push(ticket);
        const counts = guestMoves?.counts(user.id) ?? { activeGames: 0, openInvites: 0 };
        throw { ...error, move: { ticket, ...counts } } satisfies AuthErrorData;
      }
      if (owner === undefined) {
        if (keysOf(user.id).some((k) => k.provider === credential.provider)) {
          throw authError('REJECTED', 'this account has a key of this kind already');
        }
        store.keys[key] = user.id;
      }
      if (credential.provider === 'apple' && credential.authorizationCode !== undefined) {
        store.appleCodes.push(credential.authorizationCode);
      }
      if (user.isGuest) {
        store.session = { id: user.id, isGuest: false };
        changed(store.session);
      }
      return { ...store.session! };
    },
    async moveGuest(offer) {
      await Promise.resolve();
      const user = store.session;
      const at = store.openMoveTickets.indexOf(offer.ticket);
      const [, source, target] = offer.ticket.split(':');
      if (user === null || !user.isGuest || at < 0 || source !== user.id || target === undefined) {
        throw authError('REJECTED', 'this move is not valid');
      }
      store.openMoveTickets.splice(at, 1);
      guestMoves?.move(source, target);
      store.session = { id: target, isGuest: false };
      changed(store.session);
      return { ...store.session };
    },
    listKeys: () => Promise.resolve(store.session === null ? [] : keysOf(store.session.id)),
    async removeKey(provider) {
      await Promise.resolve();
      const user = store.session;
      if (user === null) throw authError('REJECTED', 'sign in first');
      const keys = keysOf(user.id);
      if (!keys.some((k) => k.provider === provider)) return;
      if (keys.length <= 1) throw authError('LAST_KEY', 'an account keeps at least one key');
      for (const [key, owner] of Object.entries(store.keys)) {
        if (owner === user.id && key.startsWith(`${provider}:`)) delete store.keys[key];
      }
    },
    async signOut() {
      await Promise.resolve();
      if (store.session === null) return;
      store.session = null;
      changed(null);
    },
    getToken: () =>
      Promise.resolve(
        store.session === null ? null : `${MEMORY_AUTH_TOKEN_PREFIX}${store.session.id}`,
      ),
    onChange(listener) {
      const own = (user: AuthUser | null) => listener(user);
      listeners.add(own);
      return () => {
        listeners.delete(own);
      };
    },
  };
}

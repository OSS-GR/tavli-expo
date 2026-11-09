/**
 * The sign-in port (#131, ADR-0004, ADR-0008).
 *
 * Online play needs a signed-in user. The server reads the player id from
 * the sign-in token, never from an argument. A guest (anonymous) account is
 * enough to play. A guest can save their account by adding a sign-in key
 * (`saveKey`, #397) and keeps the same id; a phone with no session signs
 * in with a key (`signInWithKey`). Keys: Apple now, the email code (#399)
 * and Google (#410) later.
 *
 * The Better Auth adapter is `@tavli/auth-better-auth`. The in-memory
 * provider below is for tests and for the app before the server is live.
 * The contract checks are `authProviderContract` in `@tavli/contracts/testing`.
 * See "Sign-in" in `docs/architecture/online-game-service.md`.
 */

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

/** The kinds of sign-in key. Google (#410) and the email code (#399) come later. */
export const AUTH_KEY_PROVIDERS = ['apple'] as const;

export type AuthKeyProvider = (typeof AUTH_KEY_PROVIDERS)[number];

/**
 * Proof that the player owns a key, from the provider's sheet on the
 * phone (Sign in with Apple, #401). Get the nonce from `keyNonce()` first
 * and give it to the sheet: the id token must carry it.
 */
export interface AuthKeyCredential {
  readonly provider: AuthKeyProvider;
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
] as const;

export type AuthErrorCode = (typeof AUTH_ERROR_CODES)[number];

/** The data of a failed sign-in call. */
export interface AuthErrorData {
  readonly code: AuthErrorCode;
  readonly message: string;
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
   * with the user or `null`. Call it before `currentUser`.
   */
  ready(): Promise<AuthUser | null>;
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
   * Signs in with a key, when nobody is signed in: to the account that
   * has the key, or to a new saved account. Rejects with `SIGNED_IN` when
   * a user is signed in (to keep a guest's games, call `saveKey`), and
   * with `REJECTED` for a bad or used credential.
   */
  signInWithKey(credential: AuthKeyCredential): Promise<AuthUser>;
  /**
   * Adds a key to the signed-in user, who keeps the same id. A guest is
   * then no longer a guest. Rejects with `KEY_BELONGS_TO_OTHER` when
   * another account has the key (nothing changes), and with `REJECTED`
   * when nobody is signed in, the credential is bad or used, or the
   * account has a key of this kind already. Saving a key the user has
   * already resolves and changes nothing.
   */
  saveKey(credential: AuthKeyCredential): Promise<AuthUser>;
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
  };
}

function authError(code: AuthErrorCode, message: string): AuthErrorData {
  return { code, message };
}

/**
 * An `AuthProvider` in memory: guest ids `guest-1`, `guest-2`, …, saved
 * accounts `user-1`, …, and the token `memory-token:<id>`. Its fake Apple
 * accepts `memoryAppleIdToken(sub, nonce)` with a nonce from `keyNonce()`.
 * Listeners get each change on a later microtask, like a real client.
 */
export function createMemoryAuthProvider(
  store: MemoryAuthStore = createMemoryAuthStore(),
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

  /** The key a credential proves (`<provider>:<sub>`), using up its nonce. */
  function provenKey(credential: AuthKeyCredential): string {
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
      if (credential.authorizationCode !== undefined) {
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
        throw authError('KEY_BELONGS_TO_OTHER', 'this key belongs to another account');
      }
      if (owner === undefined) {
        if (keysOf(user.id).some((k) => k.provider === credential.provider)) {
          throw authError('REJECTED', 'this account has a key of this kind already');
        }
        store.keys[key] = user.id;
      }
      if (credential.authorizationCode !== undefined) {
        store.appleCodes.push(credential.authorizationCode);
      }
      if (user.isGuest) {
        store.session = { id: user.id, isGuest: false };
        changed(store.session);
      }
      return { ...store.session! };
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

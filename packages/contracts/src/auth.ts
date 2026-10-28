/**
 * The sign-in port (#131, ADR-0004).
 *
 * Online play needs a signed-in user. The server reads the player id from
 * the sign-in token, never from an argument. A guest (anonymous) account is
 * enough to play; Apple, Google and email magic link come later.
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
   * stays signed in to this account.
   */
  readonly id: string;
  /** True for a guest (anonymous) account. A guest that signs out loses the account. */
  readonly isGuest: boolean;
}

/** Why a sign-in call failed. */
export const AUTH_ERROR_CODES = [
  /** The auth server could not be reached. Try again later. */
  'NETWORK',
  /** The auth server said no. */
  'REJECTED',
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
   * Calls `listener` with the new user (or `null`) after every sign-in and
   * sign-out. Never inside `onChange` itself. Returns a function that
   * stops the calls.
   */
  onChange(listener: (user: AuthUser | null) => void): () => void;
}

/** The token format of the in-memory provider: this prefix, then the user id. */
export const MEMORY_AUTH_TOKEN_PREFIX = 'memory-token:';

/**
 * Where the in-memory provider keeps its session, like the phone's secure
 * store. Pass the same store to a second provider to act out an app restart.
 */
export interface MemoryAuthStore {
  session: AuthUser | null;
  /** Guest accounts made so far; the next id is `guest-<n + 1>`. */
  guests: number;
}

export function createMemoryAuthStore(): MemoryAuthStore {
  return { session: null, guests: 0 };
}

/**
 * An `AuthProvider` in memory: guest ids `guest-1`, `guest-2`, …, and the
 * token `memory-token:<id>`. Listeners get each change on a later
 * microtask, like a real client.
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

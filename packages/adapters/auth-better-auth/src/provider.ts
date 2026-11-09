/**
 * The `AuthProvider` port on a Better Auth client (#131, ADR-0004).
 *
 * This file has no vendor import: it works on any object with the client
 * methods below (`BetterAuthClient`). `client.ts` builds the real Expo
 * client; the tests pass a fake.
 *
 * Sign-in keys (#397): `signInWithKey` is Better Auth's id token sign-in
 * (`/sign-in/social`). The nonce, the save, the list and the remove are
 * our own routes (`/key/*`, `apps/server/convex/keyPlugin.ts`).
 */
import { AUTH_KEY_PROVIDERS } from '@tavli/contracts';
import type {
  AuthErrorCode,
  AuthErrorData,
  AuthKey,
  AuthKeyCredential,
  AuthKeyProvider,
  AuthProvider,
  AuthUser,
} from '@tavli/contracts';

/** A Better Auth call result: `data`, or an `error` (HTTP status and message). */
export interface BetterAuthResult<T> {
  readonly data: T | null;
  readonly error: {
    readonly status?: number | undefined;
    readonly message?: string | undefined;
    /** The server's error code, for example `KEY_BELONGS_TO_OTHER`. */
    readonly code?: string | undefined;
  } | null;
}

/** The user fields this adapter reads. */
export interface BetterAuthUserData {
  readonly id: string;
  /** Set by the anonymous plugin. */
  readonly isAnonymous?: boolean | null | undefined;
}

/** The fetch options this adapter passes: errors come back as `error`, never thrown. */
export interface BetterAuthCallOptions {
  readonly fetchOptions: { readonly throw: false };
}

/** The body of an id token sign-in (`signIn.social`) and of `/key/save`. */
export interface BetterAuthIdTokenInput {
  readonly provider: AuthKeyProvider;
  readonly idToken: { readonly token: string; readonly nonce: string };
}

/** The reply of `signIn.social`. The redirect flow (no `user`) is never used here. */
export interface BetterAuthSocialData {
  readonly redirect?: boolean;
  readonly user?: BetterAuthUserData;
}

/** The options of a plain `$fetch` call. Errors come back as `error`. */
export interface BetterAuthFetchOptions {
  readonly method: 'GET' | 'POST';
  readonly body?: object;
  readonly throw: false;
}

/** The Better Auth client methods this adapter uses. Tests pass a fake. */
export interface BetterAuthClient {
  getSession(
    options: BetterAuthCallOptions,
  ): Promise<BetterAuthResult<{ readonly user: BetterAuthUserData }>>;
  readonly signIn: {
    anonymous(
      options: BetterAuthCallOptions,
    ): Promise<BetterAuthResult<{ readonly user: BetterAuthUserData }>>;
    /** The id token sign-in (`/sign-in/social`). */
    social(
      input: BetterAuthIdTokenInput & BetterAuthCallOptions,
    ): Promise<BetterAuthResult<BetterAuthSocialData>>;
  };
  /** A call to any route under the base URL, with the session cookie. */
  $fetch<T>(path: string, options: BetterAuthFetchOptions): Promise<BetterAuthResult<T>>;
  signOut(options: BetterAuthCallOptions): Promise<BetterAuthResult<unknown>>;
  /** The Convex plugin (`convexClient()`): a JWT for the Convex client. */
  readonly convex: {
    token(options: BetterAuthCallOptions): Promise<BetterAuthResult<{ readonly token: string }>>;
  };
}

const NO_THROW: BetterAuthCallOptions = { fetchOptions: { throw: false } };

/** A token is renewed when it has less than this left (ms). */
const TOKEN_MARGIN_MS = 30 * 1000;

function toUser(data: BetterAuthUserData): AuthUser {
  return { id: data.id, isGuest: data.isAnonymous === true };
}

function copy(user: AuthUser | null): AuthUser | null {
  return user === null ? null : { ...user };
}

/** Server error codes that keep their name in `AuthErrorData`. */
const PASSED_CODES: readonly AuthErrorCode[] = ['KEY_BELONGS_TO_OTHER', 'LAST_KEY'];

/**
 * A failed call as `AuthErrorData`: an HTTP status means the server said
 * no (`REJECTED`, or the server's code when the port has it).
 */
function authError(
  error: BetterAuthResult<unknown>['error'] | unknown,
  what: string,
): AuthErrorData {
  const status = (error as { status?: unknown } | null)?.status;
  const rejected = typeof status === 'number' && status >= 400;
  const text = (error as { message?: unknown } | null)?.message;
  const message = typeof text === 'string' && text !== '' ? `${what}: ${text}` : what;
  const serverCode = (error as { code?: unknown } | null)?.code;
  const passed = PASSED_CODES.find((code) => code === serverCode);
  return { code: !rejected ? 'NETWORK' : (passed ?? 'REJECTED'), message };
}

function isKeyProvider(value: unknown): value is AuthKeyProvider {
  return (AUTH_KEY_PROVIDERS as readonly unknown[]).includes(value);
}

function idTokenInput(credential: AuthKeyCredential): BetterAuthIdTokenInput {
  return {
    provider: credential.provider,
    idToken: { token: credential.idToken, nonce: credential.nonce },
  };
}

const BASE64URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/** Decodes base64url text (a JWT part) to a string of byte values. */
function decodeBase64Url(text: string): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const char of text) {
    const digit = BASE64URL.indexOf(char);
    if (digit < 0) throw new Error('not base64url');
    value = (value << 6) | digit;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out += String.fromCharCode((value >> bits) & 0xff);
    }
  }
  return out;
}

/** The payload of a JWT, read without a signature check (the server checks it). */
export function jwtPayload(token: string): Record<string, unknown> {
  const bytes = decodeBase64Url(token.split('.')[1] ?? '');
  // The payload is UTF-8 JSON; the fields read here are ASCII.
  return JSON.parse(bytes) as Record<string, unknown>;
}

/** When a JWT runs out (epoch ms), or `null` if it does not say. */
function expiresAt(token: string): number | null {
  try {
    const exp = jwtPayload(token)['exp'];
    return typeof exp === 'number' ? exp * 1000 : null;
  } catch {
    return null;
  }
}

export interface FromBetterAuthClientOptions {
  /** The clock, in epoch ms, for token expiry. Default: `Date.now`. */
  readonly now?: () => number;
  /**
   * The app's bundle id: Apple's `client_id` for the code trade
   * (`/key/apple-code`, #398). Without it the provider sends no Apple code.
   */
  readonly appleClientId?: string | null;
}

/** An `AuthProvider` on a Better Auth client. */
export function fromBetterAuthClient(
  client: BetterAuthClient,
  options: FromBetterAuthClientOptions = {},
): AuthProvider {
  const now = options.now ?? (() => Date.now());
  const appleClientId = options.appleClientId ?? null;
  const listeners = new Set<(user: AuthUser | null) => void>();
  let user: AuthUser | null = null;
  let token: { readonly value: string; readonly expiresAt: number | null } | null = null;
  let loading: Promise<AuthUser | null> | null = null;
  /** The session load failed on the network: a guest sign-in must not replace a saved session. */
  let loadFailed = false;
  let signingIn: Promise<AuthUser> | null = null;
  let fetching: Promise<string | null> | null = null;
  /** Goes up each time the user changes, so a token fetched for an old user is dropped. */
  let epoch = 0;

  function set(next: AuthUser | null): void {
    const changed = JSON.stringify(next) !== JSON.stringify(user);
    if (next?.id !== user?.id) {
      epoch += 1;
      token = null;
      fetching = null;
    }
    user = next;
    if (!changed) return;
    for (const listener of [...listeners]) {
      const value = copy(next);
      void Promise.resolve().then(() => {
        if (listeners.has(listener)) listener(value);
      });
    }
  }

  function ready(): Promise<AuthUser | null> {
    loading ??= client.getSession(NO_THROW).then(
      ({ data, error }) => {
        if (data?.user) set(toUser(data.user));
        // No HTTP status: the server was not reached. The next call loads again.
        else if (error !== null && typeof error.status !== 'number') failLoad();
        else loadFailed = false;
        return copy(user);
      },
      () => {
        failLoad();
        return copy(user);
      },
    );
    return loading.then(() => copy(user));
  }

  function failLoad(): void {
    loadFailed = true;
    loading = null;
  }

  async function signIn(): Promise<AuthUser> {
    await ready();
    if (user !== null) return { ...user };
    // A saved session may exist: a new guest now would lose it.
    if (loadFailed) throw authError(null, 'could not load the session');
    let result: BetterAuthResult<{ readonly user: BetterAuthUserData }>;
    try {
      result = await client.signIn.anonymous(NO_THROW);
    } catch (error) {
      throw authError(error, 'guest sign-in failed');
    }
    if (result.error !== null || !result.data?.user) {
      throw authError(result.error, 'guest sign-in failed');
    }
    set(toUser(result.data.user));
    return { ...toUser(result.data.user) };
  }

  /** A `$fetch` call; a throw (no network) becomes `AuthErrorData`. */
  async function fetchRoute<T>(path: string, what: string, body?: object): Promise<T> {
    let result: BetterAuthResult<T>;
    try {
      result = await client.$fetch<T>(path, {
        method: body === undefined ? 'GET' : 'POST',
        ...(body === undefined ? {} : { body }),
        throw: false,
      });
    } catch (error) {
      throw authError(error, what);
    }
    if (result.error !== null || result.data === null) throw authError(result.error, what);
    return result.data;
  }

  /**
   * Runs a sign-in after the one under way, if any: two at once would
   * make two sessions. The later one then sees the earlier one's user.
   */
  function queue(run: () => Promise<AuthUser>): Promise<AuthUser> {
    const before = signingIn;
    const shared = (before === null ? run() : before.then(run, run)).finally(() => {
      if (signingIn === shared) signingIn = null;
    });
    signingIn = shared;
    return shared;
  }

  async function keySignIn(credential: AuthKeyCredential): Promise<AuthUser> {
    await ready();
    if (user !== null)
      throw { code: 'SIGNED_IN', message: 'sign out first' } satisfies AuthErrorData;
    // A saved session may exist: a key sign-in now would replace it.
    if (loadFailed) throw authError(null, 'could not load the session');
    let result: BetterAuthResult<BetterAuthSocialData>;
    try {
      result = await client.signIn.social({ ...idTokenInput(credential), ...NO_THROW });
    } catch (error) {
      throw authError(error, 'key sign-in failed');
    }
    const data = result.data?.user;
    if (result.error !== null || data === undefined) {
      throw authError(result.error, 'key sign-in failed');
    }
    set(toUser(data));
    await sendAppleCode(credential);
    return toUser(data);
  }

  /**
   * Sends Apple's one-time code after a sign-in or a save with an Apple
   * key (#398), so the server keeps Apple's token to revoke it later. Best
   * effort: the player is signed in either way, and a failed send is only
   * a token the server cannot revoke.
   */
  async function sendAppleCode(credential: AuthKeyCredential): Promise<void> {
    const code = credential.authorizationCode;
    if (credential.provider !== 'apple' || code === undefined || code === '') return;
    if (appleClientId === null || appleClientId === '') return;
    try {
      await client.$fetch('/key/apple-code', {
        method: 'POST',
        body: { authorizationCode: code, clientId: appleClientId },
        throw: false,
      });
    } catch {
      // No network: the sign-in stands.
    }
  }

  async function signedIn(what: string): Promise<AuthUser> {
    await ready();
    if (user === null)
      throw { code: 'REJECTED', message: `${what}: sign in first` } satisfies AuthErrorData;
    return user;
  }

  async function fetchToken(forEpoch: number): Promise<string | null> {
    let result: BetterAuthResult<{ readonly token: string }>;
    try {
      result = await client.convex.token(NO_THROW);
    } catch {
      return null;
    }
    // The user changed during the fetch: this token is not theirs.
    if (forEpoch !== epoch) return null;
    if (result.error?.status === 401) {
      // The session ended on the server (it ran out or was revoked).
      set(null);
      return null;
    }
    const value = result.data?.token;
    if (typeof value !== 'string' || value === '') return null;
    token = { value, expiresAt: expiresAt(value) };
    return value;
  }

  return {
    ready,
    currentUser: () => copy(user),
    signInAsGuest() {
      // Two taps at once make one guest, not two: the second finds the first's user.
      return queue(signIn);
    },
    async keyNonce() {
      const data = await fetchRoute<{ readonly nonce?: unknown }>('/key/nonce', 'no nonce', {});
      if (typeof data.nonce !== 'string' || data.nonce === '') {
        throw authError(null, 'no nonce in the reply');
      }
      return data.nonce;
    },
    signInWithKey(credential) {
      return queue(() => keySignIn(credential));
    },
    async saveKey(credential) {
      await signedIn('save the key');
      const data = await fetchRoute<{ readonly user?: BetterAuthUserData }>(
        '/key/save',
        'saving the key failed',
        idTokenInput(credential),
      );
      if (data.user === undefined) throw authError(null, 'no user in the reply');
      set(toUser(data.user));
      await sendAppleCode(credential);
      return toUser(data.user);
    },
    async listKeys() {
      await ready();
      if (user === null) return [];
      const data = await fetchRoute<{ readonly keys?: readonly { readonly provider?: unknown }[] }>(
        '/key/list',
        'listing the keys failed',
      );
      const keys: AuthKey[] = [];
      for (const key of data.keys ?? []) {
        if (isKeyProvider(key.provider)) keys.push({ provider: key.provider });
      }
      return keys;
    },
    async removeKey(provider) {
      await signedIn('remove the key');
      await fetchRoute('/key/remove', 'removing the key failed', { provider });
    },
    async signOut() {
      await ready();
      if (user === null) return;
      let result: BetterAuthResult<unknown>;
      try {
        result = await client.signOut(NO_THROW);
      } catch (error) {
        throw authError(error, 'sign-out failed');
      }
      // On a failure the user stays signed in, here and in the saved session.
      if (result.error !== null) throw authError(result.error, 'sign-out failed');
      set(null);
    },
    async getToken(request) {
      await ready();
      if (user === null) return null;
      const saved = token;
      const fresh =
        saved !== null &&
        request?.forceRefresh !== true &&
        (saved.expiresAt === null || saved.expiresAt - TOKEN_MARGIN_MS > now());
      if (fresh) return saved.value;
      // Calls at the same time share one fetch, so they cannot save out of order.
      if (fetching === null) {
        const started = fetchToken(epoch);
        fetching = started;
        void started.finally(() => {
          if (fetching === started) fetching = null;
        });
      }
      return fetching;
    },
    onChange(listener) {
      const own = (next: AuthUser | null) => listener(next);
      listeners.add(own);
      return () => {
        listeners.delete(own);
      };
    },
  };
}

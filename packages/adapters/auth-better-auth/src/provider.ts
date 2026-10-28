/**
 * The `AuthProvider` port on a Better Auth client (#131, ADR-0004).
 *
 * This file has no vendor import: it works on any object with the client
 * methods below (`BetterAuthClient`). `client.ts` builds the real Expo
 * client; the tests pass a fake.
 */
import type { AuthErrorData, AuthProvider, AuthUser } from '@tavli/contracts';

/** A Better Auth call result: `data`, or an `error` (HTTP status and message). */
export interface BetterAuthResult<T> {
  readonly data: T | null;
  readonly error: {
    readonly status?: number | undefined;
    readonly message?: string | undefined;
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

/** The Better Auth client methods this adapter uses. Tests pass a fake. */
export interface BetterAuthClient {
  getSession(
    options: BetterAuthCallOptions,
  ): Promise<BetterAuthResult<{ readonly user: BetterAuthUserData }>>;
  readonly signIn: {
    anonymous(
      options: BetterAuthCallOptions,
    ): Promise<BetterAuthResult<{ readonly user: BetterAuthUserData }>>;
  };
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

/** A failed call as `AuthErrorData`: an HTTP status means the server said no. */
function authError(
  error: BetterAuthResult<unknown>['error'] | unknown,
  what: string,
): AuthErrorData {
  const status = (error as { status?: unknown } | null)?.status;
  const rejected = typeof status === 'number' && status >= 400;
  const text = (error as { message?: unknown } | null)?.message;
  const message = typeof text === 'string' && text !== '' ? `${what}: ${text}` : what;
  return { code: rejected ? 'REJECTED' : 'NETWORK', message };
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
}

/** An `AuthProvider` on a Better Auth client. */
export function fromBetterAuthClient(
  client: BetterAuthClient,
  options: FromBetterAuthClientOptions = {},
): AuthProvider {
  const now = options.now ?? (() => Date.now());
  const listeners = new Set<(user: AuthUser | null) => void>();
  let user: AuthUser | null = null;
  let token: { readonly value: string; readonly expiresAt: number | null } | null = null;
  let loading: Promise<AuthUser | null> | null = null;
  let signingIn: Promise<AuthUser> | null = null;

  function set(next: AuthUser | null): void {
    const changed = JSON.stringify(next) !== JSON.stringify(user);
    user = next;
    if (next === null) token = null;
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
      ({ data }) => {
        // A failed load counts as signed out; a sign-in tries again.
        if (data?.user) set(toUser(data.user));
        return copy(user);
      },
      () => copy(user),
    );
    return loading.then(() => copy(user));
  }

  async function signIn(): Promise<AuthUser> {
    await ready();
    if (user !== null) return { ...user };
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

  return {
    ready,
    currentUser: () => copy(user),
    signInAsGuest() {
      // Two taps at once make one guest, not two.
      signingIn ??= signIn().finally(() => {
        signingIn = null;
      });
      return signingIn;
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
      let result: BetterAuthResult<{ readonly token: string }>;
      try {
        result = await client.convex.token(NO_THROW);
      } catch {
        return null;
      }
      if (result.error?.status === 401) {
        // The session ended on the server (it ran out or was revoked).
        set(null);
        return null;
      }
      const value = result.data?.token;
      if (typeof value !== 'string' || value === '') return null;
      token = { value, expiresAt: expiresAt(value) };
      return value;
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

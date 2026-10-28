import type { AuthErrorData } from '@tavli/contracts';
import { isAuthErrorData } from '@tavli/contracts';
import { authProviderContract } from '@tavli/contracts/testing';
import { describe, expect, it } from 'vitest';

import { fromBetterAuthClient, jwtPayload } from './provider';
import type { BetterAuthClient, BetterAuthResult } from './provider';

// A fake Better Auth server and Expo client. The server keeps users and
// sessions; each client keeps its session cookie in a phone store, so a
// second client on the same store acts like the app after a restart.

const BASE64URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/** base64url of ASCII text (enough for the fake tokens). */
function encode(text: string): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const char of text) {
    value = (value << 8) | char.charCodeAt(0);
    bits += 8;
    while (bits >= 6) {
      bits -= 6;
      out += BASE64URL.charAt((value >> bits) & 63);
    }
  }
  if (bits > 0) out += BASE64URL.charAt((value << (6 - bits)) & 63);
  return out;
}

function jwt(payload: object): string {
  return `${encode('{"alg":"RS256"}')}.${encode(JSON.stringify(payload))}.signature`;
}

interface FakeServer {
  clock: number;
  guests: number;
  /** Session id → user id. */
  sessions: Map<string, string>;
  /** Token lifetime, ms. */
  tokenTime: number;
  /** The next calls of this name fail with this result error (or throw when `'throw'`). */
  failures: Map<string, { status?: number; message?: string } | 'throw'>;
  calls: string[];
}

function createServer(): FakeServer {
  return {
    clock: Date.UTC(2026, 9, 28),
    guests: 0,
    sessions: new Map(),
    tokenTime: 15 * 60 * 1000,
    failures: new Map(),
    calls: [],
  };
}

function ok<T>(data: T): BetterAuthResult<T> {
  return { data, error: null };
}

function createClient(server: FakeServer, phone: { cookie: string | null }): BetterAuthClient {
  async function call<T>(
    name: string,
    run: () => BetterAuthResult<T>,
  ): Promise<BetterAuthResult<T>> {
    await Promise.resolve();
    server.calls.push(name);
    const failure = server.failures.get(name);
    if (failure !== undefined) {
      server.failures.delete(name);
      if (failure === 'throw') throw new TypeError('Network request failed');
      return { data: null, error: failure };
    }
    return run();
  }
  const userOf = () => (phone.cookie === null ? undefined : server.sessions.get(phone.cookie));
  return {
    getSession: () =>
      call('getSession', () => {
        const id = userOf();
        return id === undefined
          ? { data: null, error: null }
          : ok({ user: { id, isAnonymous: true } });
      }),
    signIn: {
      anonymous: () =>
        call('signIn.anonymous', () => {
          if (userOf() !== undefined) {
            return { data: null, error: { status: 400, message: 'already signed in' } };
          }
          server.guests += 1;
          const id = `user-${server.guests}`;
          const session = `session-${server.guests}`;
          server.sessions.set(session, id);
          phone.cookie = session;
          return ok({ user: { id, isAnonymous: true } });
        }),
    },
    signOut: () =>
      call('signOut', () => {
        if (phone.cookie !== null) server.sessions.delete(phone.cookie);
        phone.cookie = null;
        return ok({ success: true });
      }),
    convex: {
      token: () =>
        call('convex.token', () => {
          const id = userOf();
          if (id === undefined)
            return { data: null, error: { status: 401, message: 'no session' } };
          const exp = Math.floor((server.clock + server.tokenTime) / 1000);
          return ok({ token: jwt({ sub: id, exp, n: server.calls.length }) });
        }),
    },
  };
}

function subject(server = createServer()) {
  const phone = { cookie: null as string | null };
  const now = () => server.clock;
  return {
    server,
    phone,
    auth: fromBetterAuthClient(createClient(server, phone), { now }),
    restart: () => fromBetterAuthClient(createClient(server, phone), { now }),
    tokenSubject: (token: string) => String(jwtPayload(token)['sub']),
  };
}

async function rejection(call: Promise<unknown>): Promise<AuthErrorData> {
  const error: unknown = await call.then(
    () => {
      throw new Error('expected a rejection');
    },
    (e: unknown) => e,
  );
  if (!isAuthErrorData(error)) throw new Error(`not AuthErrorData: ${String(error)}`);
  return error;
}

describe('the Better Auth AuthProvider passes the contract (fake client)', () => {
  for (const check of authProviderContract()) {
    it(check.name, () => check.run(subject()));
  }
});

describe('fromBetterAuthClient', () => {
  it('maps a guest: the user id is the Better Auth user id and the token subject', async () => {
    const { auth } = subject();
    expect(await auth.signInAsGuest()).toEqual({ id: 'user-1', isGuest: true });
    const token = await auth.getToken();
    expect(jwtPayload(token ?? '')['sub']).toBe('user-1');
  });

  it('two sign-ins at once make one guest', async () => {
    const { auth, server } = subject();
    const [a, b] = await Promise.all([auth.signInAsGuest(), auth.signInAsGuest()]);
    expect(a).toEqual(b);
    expect(server.calls.filter((c) => c === 'signIn.anonymous')).toHaveLength(1);
  });

  it('keeps a token until near its expiry; forceRefresh gets a new one', async () => {
    const { auth, server } = subject();
    await auth.signInAsGuest();
    const first = await auth.getToken();
    expect(await auth.getToken()).toBe(first);
    expect(server.calls.filter((c) => c === 'convex.token')).toHaveLength(1);

    const forced = await auth.getToken({ forceRefresh: true });
    expect(forced).not.toBe(first);

    // 30 seconds before the end, the token is renewed.
    server.clock += server.tokenTime - 30 * 1000;
    const renewed = await auth.getToken();
    expect(renewed).not.toBe(forced);
    expect(server.calls.filter((c) => c === 'convex.token')).toHaveLength(3);
  });

  it('a session that ended on the server signs the user out', async () => {
    const { auth, server } = subject();
    await auth.signInAsGuest();
    const seen: unknown[] = [];
    auth.onChange((user) => seen.push(user));
    server.sessions.clear();
    expect(await auth.getToken()).toBeNull();
    expect(auth.currentUser()).toBeNull();
    await Promise.resolve();
    await Promise.resolve();
    expect(seen).toEqual([null]);
  });

  it('a network failure on the token gives null and keeps the user', async () => {
    const { auth, server } = subject();
    const user = await auth.signInAsGuest();
    server.failures.set('convex.token', 'throw');
    expect(await auth.getToken()).toBeNull();
    expect(auth.currentUser()).toEqual(user);
    expect(await auth.getToken()).not.toBeNull();
  });

  it('a failed sign-in rejects: REJECTED for a server answer, NETWORK when unreachable', async () => {
    const { auth, server } = subject();
    server.failures.set('signIn.anonymous', { status: 500, message: 'boom' });
    expect(await rejection(auth.signInAsGuest())).toMatchObject({ code: 'REJECTED' });
    server.failures.set('signIn.anonymous', 'throw');
    expect(await rejection(auth.signInAsGuest())).toMatchObject({ code: 'NETWORK' });
    expect(auth.currentUser()).toBeNull();
    // It works once the server answers again.
    expect((await auth.signInAsGuest()).isGuest).toBe(true);
  });

  it('a failed sign-out rejects and keeps the user signed in', async () => {
    const { auth, server, restart } = subject();
    const user = await auth.signInAsGuest();
    server.failures.set('signOut', 'throw');
    expect(await rejection(auth.signOut())).toMatchObject({ code: 'NETWORK' });
    expect(auth.currentUser()).toEqual(user);
    expect(await restart().ready()).toEqual(user);
  });

  it('a failed session load counts as signed out; the next call loads again', async () => {
    const server = createServer();
    const first = subject(server);
    const user = await first.auth.signInAsGuest();
    server.failures.set('getSession', 'throw');
    const again = first.restart();
    expect(await again.ready()).toBeNull();
    // The sign-in loads the saved session again and makes no second guest.
    expect(await again.signInAsGuest()).toEqual(user);
    expect(server.guests).toBe(1);
  });

  it('a guest sign-in never replaces a session it could not load', async () => {
    const server = createServer();
    const first = subject(server);
    await first.auth.signInAsGuest();
    const again = first.restart();
    server.failures.set('getSession', 'throw');
    expect(await again.ready()).toBeNull();
    server.failures.set('getSession', { message: 'offline' });
    expect(await rejection(again.signInAsGuest())).toMatchObject({ code: 'NETWORK' });
    expect(server.calls.filter((c) => c === 'signIn.anonymous')).toHaveLength(1);
    expect(server.guests).toBe(1);
  });

  it('calls at the same time share one token fetch', async () => {
    const { auth, server } = subject();
    await auth.signInAsGuest();
    const [a, b] = await Promise.all([auth.getToken(), auth.getToken()]);
    expect(a).toBe(b);
    expect(server.calls.filter((c) => c === 'convex.token')).toHaveLength(1);
  });

  it('drops a token fetched for a user who signed out during the fetch', async () => {
    const server = createServer();
    const phone = { cookie: null as string | null };
    const client = createClient(server, phone);
    // Hold the first token answer until the test lets it go.
    let release = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let first = true;
    const realToken = client.convex.token.bind(client.convex);
    const gated: BetterAuthClient = {
      ...client,
      convex: {
        async token(options) {
          const result = await realToken(options);
          if (first) {
            first = false;
            await held;
          }
          return result;
        },
      },
    };
    const auth = fromBetterAuthClient(gated, { now: () => server.clock });
    const old = await auth.signInAsGuest();
    const stale = auth.getToken();
    await auth.signOut();
    const next = await auth.signInAsGuest();
    expect(next.id).not.toBe(old.id);
    release();
    expect(await stale).toBeNull();
    const token = await auth.getToken();
    expect(jwtPayload(token ?? '')['sub']).toBe(next.id);
  });
});

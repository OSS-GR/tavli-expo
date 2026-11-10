import type { AuthErrorData, AuthProvider } from '@tavli/contracts';
import { EMAIL_CODE_TRIES, isAuthErrorData, normalizeEmail } from '@tavli/contracts';
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
  /** User ids that are guests. */
  anonymous: Set<string>;
  /** `apple:<sub>` or `email:<address>` → user id. */
  keys: Map<string, string>;
  /** Live email codes (#399): ticket → address, code and wrong tries. */
  emailCodes: Map<string, { email: string; code: string; tries: number }>;
  /** Every code sent: the fake inbox. */
  sentCodes: { email: string; code: string; language: unknown }[];
  /** Nonces made and not used yet. */
  nonces: Set<string>;
  /** Token lifetime, ms. */
  tokenTime: number;
  /** The Apple codes sent to `/key/apple-code`: user id, client id and code. */
  appleCodes: { user: string; clientId: unknown; code: unknown }[];
  /** The next calls of this name fail with this result error (or throw when `'throw'`). */
  failures: Map<
    string,
    { status?: number; message?: string; code?: string; retryAfterMs?: number } | 'throw'
  >;
  /** Move tickets (#403) not used yet: ticket → guest and account. */
  moveTickets: Map<string, { source: string; target: string }>;
  calls: string[];
}

function createServer(): FakeServer {
  return {
    clock: Date.UTC(2026, 9, 28),
    guests: 0,
    sessions: new Map(),
    anonymous: new Set(),
    keys: new Map(),
    emailCodes: new Map(),
    sentCodes: [],
    nonces: new Set(),
    tokenTime: 15 * 60 * 1000,
    appleCodes: [],
    failures: new Map(),
    moveTickets: new Map(),
    calls: [],
  };
}

function ok<T>(data: T): BetterAuthResult<T> {
  return { data, error: null };
}

function refused<T>(status: number, code: string, extra: object = {}): BetterAuthResult<T> {
  return { data: null, error: { status, code, message: code, ...extra } };
}

/** The fake Apple's id token: `fake-apple.<sub>.<nonce>`. */
function fakeAppleToken(sub: string, nonce: string): string {
  return `fake-apple.${sub}.${nonce}`;
}

/** The Apple `sub` a token proves, using up its nonce; `null` when it is not valid. */
function provenSub(server: FakeServer, idToken: { token: string; nonce: string }): string | null {
  const [kind, sub, nonce] = idToken.token.split('.');
  if (kind !== 'fake-apple' || sub === undefined || nonce !== idToken.nonce) return null;
  if (!server.nonces.delete(nonce)) return null;
  return sub;
}

/** The address an email code proves, using the code up; else the server's error. */
function provenEmail(
  server: FakeServer,
  body: Record<string, unknown> | undefined,
): string | BetterAuthResult<unknown> {
  const email = normalizeEmail(String(body?.['email'] ?? ''));
  if (email === null) return refused(400, 'INVALID_EMAIL');
  const ticket = String(body?.['ticket'] ?? '');
  const live = server.emailCodes.get(ticket);
  if (live === undefined || live.email !== email) return refused(401, 'CODE_EXPIRED');
  if (live.code !== body?.['code']) {
    live.tries += 1;
    if (live.tries < EMAIL_CODE_TRIES) return refused(401, 'WRONG_CODE');
    server.emailCodes.delete(ticket);
    return refused(401, 'CODE_EXPIRED');
  }
  server.emailCodes.delete(ticket);
  return email;
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
  const userData = (id: string) => ({ id, isAnonymous: server.anonymous.has(id) });
  function newSession(id: string): void {
    const session = `session-${server.sessions.size + 1}-${id}`;
    server.sessions.set(session, id);
    phone.cookie = session;
  }
  function route(
    path: string,
    body: Record<string, unknown> | undefined,
  ): BetterAuthResult<unknown> {
    const id = userOf();
    if (path === '/key/nonce') {
      const nonce = `n${server.calls.length}`;
      server.nonces.add(nonce);
      return ok({ nonce });
    }
    if (path === '/key/email-code') {
      const email = normalizeEmail(String(body?.['email'] ?? ''));
      if (email === null) return refused(400, 'INVALID_EMAIL');
      const code = String(200000 + server.sentCodes.length + 1);
      server.sentCodes.push({ email, code, language: body?.['language'] });
      const ticket = `ticket-${server.sentCodes.length}`;
      server.emailCodes.set(ticket, { email, code, tries: 0 });
      return ok({ sent: true, ticket });
    }
    if (path === '/key/email-sign-in') {
      if (id !== undefined) return refused(409, 'SIGNED_IN');
      const email = provenEmail(server, body);
      if (typeof email !== 'string') return email;
      let owner = server.keys.get(`email:${email}`);
      if (owner === undefined) {
        server.guests += 1;
        owner = `user-${server.guests}`;
        server.keys.set(`email:${email}`, owner);
      }
      newSession(owner);
      return ok({ token: phone.cookie, user: userData(owner) });
    }
    if (id === undefined) return refused(401, 'UNAUTHORIZED');
    const keysOf = () => [...server.keys].filter(([, owner]) => owner === id).map(([key]) => key);
    const providerOf = (key: string) => key.split(':')[0]!;
    if (path === '/key/list') {
      return ok({ keys: keysOf().map((key) => ({ provider: providerOf(key) })) });
    }
    if (path === '/key/save') {
      let key: string;
      if (body?.['provider'] === 'email') {
        const email = provenEmail(server, body);
        if (typeof email !== 'string') return email;
        key = `email:${email}`;
      } else {
        const sub = provenSub(server, body?.['idToken'] as { token: string; nonce: string });
        if (sub === null) return refused(401, 'INVALID_TOKEN');
        key = `apple:${sub}`;
      }
      const owner = server.keys.get(key);
      if (owner !== undefined && owner !== id) {
        // A guest gets a move offer (#403).
        if (!server.anonymous.has(id) || keysOf().length > 0) {
          return refused(409, 'KEY_BELONGS_TO_OTHER');
        }
        const ticket = `ticket-${server.moveTickets.size + 1}`;
        server.moveTickets.set(ticket, { source: id, target: owner });
        return refused(409, 'KEY_BELONGS_TO_OTHER', {
          move: { ticket, activeGames: 2, openInvites: 1 },
        });
      }
      if (owner === undefined && keysOf().some((own) => providerOf(own) === providerOf(key))) {
        return refused(409, 'PROVIDER_TAKEN');
      }
      server.keys.set(key, id);
      server.anonymous.delete(id);
      return ok({ user: userData(id) });
    }
    if (path === '/key/move') {
      const move = server.moveTickets.get(String(body?.['ticket']));
      if (move === undefined || move.source !== id) return refused(400, 'BAD_TICKET');
      server.moveTickets.delete(String(body?.['ticket']));
      // The guest goes, with its sessions.
      for (const [session, owner] of server.sessions) {
        if (owner === id) server.sessions.delete(session);
      }
      server.anonymous.delete(id);
      newSession(move.target);
      return ok({ token: phone.cookie, user: userData(move.target) });
    }
    if (path === '/key/apple-code') {
      server.appleCodes.push({
        user: id,
        clientId: body?.['clientId'],
        code: body?.['authorizationCode'],
      });
      return ok({ saved: true });
    }
    if (path === '/key/remove') {
      const keys = keysOf();
      const target = keys.find((key) => providerOf(key) === body?.['provider']);
      if (target === undefined) return ok({ removed: false });
      if (keys.length <= 1) return refused(409, 'LAST_KEY');
      server.keys.delete(target);
      return ok({ removed: true });
    }
    return refused(404, 'NOT_FOUND');
  }
  return {
    getSession: () =>
      call('getSession', () => {
        const id = userOf();
        return id === undefined ? { data: null, error: null } : ok({ user: userData(id) });
      }),
    $fetch: <T>(path: string, options: { body?: object }) =>
      call(`fetch ${path}`, () => route(path, options.body as Record<string, unknown>)) as Promise<
        BetterAuthResult<T>
      >,
    signIn: {
      anonymous: () =>
        call('signIn.anonymous', () => {
          if (userOf() !== undefined) {
            return { data: null, error: { status: 400, message: 'already signed in' } };
          }
          server.guests += 1;
          const id = `user-${server.guests}`;
          server.anonymous.add(id);
          newSession(id);
          return ok({ user: userData(id) });
        }),
      social: (input) =>
        call('signIn.social', () => {
          const sub = provenSub(server, input.idToken);
          if (sub === null) return refused(401, 'INVALID_TOKEN');
          let id = server.keys.get(`apple:${sub}`);
          if (id === undefined) {
            server.guests += 1;
            id = `user-${server.guests}`;
            server.keys.set(`apple:${sub}`, id);
          }
          newSession(id);
          return ok({ user: userData(id) });
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

function subject(server = createServer(), appleClientId: string | null = null) {
  const phone = { cookie: null as string | null };
  const now = () => server.clock;
  return {
    server,
    phone,
    auth: fromBetterAuthClient(createClient(server, phone), { now, appleClientId }),
    restart: () => fromBetterAuthClient(createClient(server, phone), { now }),
    tokenSubject: (token: string) => String(jwtPayload(token)['sub']),
    appleIdToken: (sub: string, nonce: string) => Promise.resolve(fakeAppleToken(sub, nonce)),
    emailCode: (email: string) => {
      const sent = server.sentCodes.filter((code) => code.email === email).at(-1);
      if (sent === undefined) throw new Error('no code was sent to this address');
      return Promise.resolve(sent.code);
    },
  };
}

async function appleCredential(auth: AuthProvider, sub: string) {
  const nonce = await auth.keyNonce();
  return { provider: 'apple' as const, idToken: fakeAppleToken(sub, nonce), nonce };
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

  it('maps the server codes KEY_BELONGS_TO_OTHER and LAST_KEY; others are REJECTED', async () => {
    const { auth, server } = subject();
    await auth.signInWithKey(await appleCredential(auth, 'a'));
    await auth.signOut();
    await auth.signInAsGuest();
    expect(await rejection(auth.saveKey(await appleCredential(auth, 'a')))).toMatchObject({
      code: 'KEY_BELONGS_TO_OTHER',
    });
    expect(
      await rejection(auth.saveKey({ provider: 'apple', idToken: 'bad', nonce: 'n' })),
    ).toMatchObject({ code: 'REJECTED' });
    await auth.saveKey(await appleCredential(auth, 'b'));
    expect(await rejection(auth.removeKey('apple'))).toMatchObject({ code: 'LAST_KEY' });
    server.failures.set('fetch /key/list', 'throw');
    expect(await rejection(auth.listKeys())).toMatchObject({ code: 'NETWORK' });
  });

  it('maps the email code errors (#399): wrong and rate limits pass, a mail failure is NETWORK', async () => {
    const { auth, server } = subject();
    await auth.requestEmailCode('eleni@example.com', 'el');
    expect(server.sentCodes).toEqual([
      { email: 'eleni@example.com', code: '200001', language: 'el' },
    ]);
    expect(server.calls).toContain('fetch /key/email-code');
    const wrong = { provider: 'email' as const, email: 'eleni@example.com', code: '000000' };
    expect(await rejection(auth.signInWithKey(wrong))).toMatchObject({ code: 'WRONG_CODE' });
    server.failures.set('fetch /key/email-code', {
      status: 429,
      code: 'RATE_LIMITED',
      retryAfterMs: 60_000,
    });
    expect(await rejection(auth.requestEmailCode('eleni@example.com', 'el'))).toEqual({
      code: 'RATE_LIMITED',
      message: expect.any(String),
      retryAfterMs: 60_000,
    });
    server.failures.set('fetch /key/email-code', { status: 502, code: 'MAIL_FAILED' });
    expect(await rejection(auth.requestEmailCode('eleni@example.com', 'el'))).toMatchObject({
      code: 'NETWORK',
    });
    server.failures.set('fetch /key/email-code', { status: 503, code: 'EMAIL_OFF' });
    expect(await rejection(auth.requestEmailCode('eleni@example.com', 'el'))).toMatchObject({
      code: 'KEY_OFF',
    });
    // An email key sends no Apple code.
    await auth.signInWithKey({ ...wrong, code: '200001' });
    expect(server.calls).not.toContain('fetch /key/apple-code');
  });

  it('sends the code with the ticket this phone got, so another phone cannot use it (#399)', async () => {
    const asker = subject();
    await asker.auth.requestEmailCode(' Eleni@Example.com ', 'en');
    const [sent] = asker.server.sentCodes;
    // A second phone on the same server knows the address and the code, not the ticket.
    const other = subject(asker.server).auth;
    const credential = { provider: 'email' as const, email: 'eleni@example.com', code: sent!.code };
    expect(await rejection(other.signInWithKey(credential))).toMatchObject({
      code: 'REJECTED',
    });
    // The asker's code still works: the other phone's try reached no code.
    await asker.auth.signInWithKey(credential);
    expect((await asker.auth.ready())?.isGuest).toBe(false);
  });

  it('passes the move offer of a guest’s KEY_BELONGS_TO_OTHER, and drops a broken one (#403)', async () => {
    const { auth, server } = subject();
    await auth.signInWithKey(await appleCredential(auth, 'a'));
    await auth.signOut();
    await auth.signInAsGuest();
    expect(await rejection(auth.saveKey(await appleCredential(auth, 'a')))).toMatchObject({
      code: 'KEY_BELONGS_TO_OTHER',
      move: { ticket: 'ticket-1', activeGames: 2, openInvites: 1 },
    });
    // A reply whose offer is not whole carries none.
    server.failures.set('fetch /key/save', {
      status: 409,
      code: 'KEY_BELONGS_TO_OTHER',
      move: { ticket: 'x', activeGames: -1, openInvites: 0 },
    } as { status: number });
    const broken = await rejection(auth.saveKey(await appleCredential(auth, 'a')));
    expect(broken).toMatchObject({ code: 'KEY_BELONGS_TO_OTHER' });
    expect(broken).not.toHaveProperty('move');
  });

  it('passes KEY_OFF when the server has that kind of key off (#462)', async () => {
    const { auth, server } = subject();
    await auth.signInAsGuest();
    server.failures.set('fetch /key/save', { status: 503, code: 'KEY_OFF' } as { status: number });
    expect(await rejection(auth.saveKey(await appleCredential(auth, 'a')))).toMatchObject({
      code: 'KEY_OFF',
    });
    await auth.signOut();
    // Better Auth's own sign-in with no Apple provider.
    server.failures.set('signIn.social', { status: 404, code: 'PROVIDER_NOT_FOUND' } as {
      status: number;
    });
    expect(await rejection(auth.signInWithKey(await appleCredential(auth, 'b')))).toMatchObject({
      code: 'KEY_OFF',
    });
  });

  it('after a move the token is the account’s, and a failed move keeps the guest', async () => {
    const { auth, server } = subject();
    const owner = await auth.signInWithKey(await appleCredential(auth, 'a'));
    await auth.signOut();
    const guest = await auth.signInAsGuest();
    expect(jwtPayload((await auth.getToken()) ?? '')['sub']).toBe(guest.id);
    const error = await rejection(auth.saveKey(await appleCredential(auth, 'a')));
    const offer = (error as { move: { ticket: string; activeGames: number; openInvites: number } })
      .move;
    server.failures.set('fetch /key/move', 'throw');
    expect(await rejection(auth.moveGuest(offer))).toMatchObject({ code: 'NETWORK' });
    expect(auth.currentUser()).toEqual(guest);
    expect(await auth.moveGuest(offer)).toEqual(owner);
    expect(jwtPayload((await auth.getToken()) ?? '')['sub']).toBe(owner.id);
  });

  it('a key sign-in never replaces a session it could not load', async () => {
    const server = createServer();
    const first = subject(server);
    const guest = await first.auth.signInAsGuest();
    const again = first.restart();
    server.failures.set('getSession', 'throw');
    expect(await again.ready()).toBeNull();
    server.failures.set('getSession', { message: 'offline' });
    const credential = await appleCredential(again, 'a');
    expect(await rejection(again.signInWithKey(credential))).toMatchObject({ code: 'NETWORK' });
    expect(server.calls).not.toContain('signIn.social');
    expect(await again.ready()).toEqual(guest);
  });

  it('a key sign-in during a guest sign-in waits, then is SIGNED_IN', async () => {
    const { auth, server } = subject();
    const credential = await appleCredential(auth, 'a');
    const guest = auth.signInAsGuest();
    const key = auth.signInWithKey(credential);
    expect((await guest).isGuest).toBe(true);
    expect(await rejection(key)).toMatchObject({ code: 'SIGNED_IN' });
    expect(server.calls).not.toContain('signIn.social');
  });

  it('a saved key moves a new token to the same user', async () => {
    const { auth } = subject();
    const guest = await auth.signInAsGuest();
    const before = await auth.getToken();
    const saved = await auth.saveKey(await appleCredential(auth, 'a'));
    expect(saved).toEqual({ id: guest.id, isGuest: false });
    // The id did not change, so the token stays valid.
    expect(await auth.getToken()).toBe(before);
  });

  it('sends the Apple code once after a key sign-in or a save, with the bundle id', async () => {
    const { auth, server } = subject(createServer(), 'com.tavlaki');
    const signIn = await appleCredential(auth, 'a');
    const user = await auth.signInWithKey({ ...signIn, authorizationCode: 'code-a' });
    await auth.signOut();
    await auth.signInAsGuest();
    const guest = auth.currentUser()!;
    await auth.saveKey({ ...(await appleCredential(auth, 'b')), authorizationCode: 'code-b' });
    expect(server.appleCodes).toEqual([
      { user: user.id, clientId: 'com.tavlaki', code: 'code-a' },
      { user: guest.id, clientId: 'com.tavlaki', code: 'code-b' },
    ]);
  });

  it('sends no code without one or without a bundle id; a failed send keeps the sign-in', async () => {
    const plain = subject();
    await plain.auth.signInWithKey({
      ...(await appleCredential(plain.auth, 'a')),
      authorizationCode: 'code-a',
    });
    expect(plain.server.calls).not.toContain('fetch /key/apple-code');

    const { auth, server } = subject(createServer(), 'com.tavlaki');
    await auth.signInWithKey(await appleCredential(auth, 'a'));
    expect(server.calls).not.toContain('fetch /key/apple-code');
    await auth.signOut();
    server.failures.set('fetch /key/apple-code', 'throw');
    const user = await auth.signInWithKey({
      ...(await appleCredential(auth, 'a')),
      authorizationCode: 'code-a',
    });
    expect(auth.currentUser()).toEqual(user);
    server.failures.set('fetch /key/apple-code', { status: 401, message: 'INVALID_CODE' });
    await auth.signOut();
    await auth.signInWithKey({
      ...(await appleCredential(auth, 'a')),
      authorizationCode: 'code-a',
    });
    expect(auth.currentUser()?.isGuest).toBe(false);
  });
});

// Shared test code for Sign in with Apple (#397): a fake Apple that signs
// id tokens with a key made in the test, and the HTTP calls of the app.
// Two dots in the name: Convex does not deploy it.

import betterAuthTest from '@convex-dev/better-auth/test';
import { convexTest } from 'convex-test';
import type { TestConvex } from 'convex-test';
import type { GenericSchema, SchemaDefinition } from 'convex/server';
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair } from 'jose';
import type { CryptoKey, JWK } from 'jose';
import { vi } from 'vitest';

import { setAppleKeys } from './auth';
import { APPLE_ISSUER } from './model/appleIdToken';
import schema from './schema';
import { modules } from './test.setup';

export type Convex = TestConvex<SchemaDefinition<GenericSchema, boolean>>;

export const SERVICES_ID = 'com.tavlaki.signin';
const ORIGIN = 'tavlaki://';

/** A fake Apple: its signing key, and its public key set for the server. */
export interface FakeApple {
  readonly privateKey: CryptoKey;
  readonly jwk: JWK;
}

export async function fakeApple(kid = 'test-key'): Promise<FakeApple> {
  const { privateKey, publicKey } = await generateKeyPair('RS256');
  const jwk = { ...(await exportJWK(publicKey)), kid, alg: 'RS256' };
  return { privateKey, jwk };
}

/** Points the server at `apple`'s keys, and sets the env the server reads. */
export function useFakeApple(apple: FakeApple): void {
  setAppleKeys(createLocalJWKSet({ keys: [apple.jwk] }));
  vi.stubEnv('BETTER_AUTH_SECRET', 'a-test-secret-that-is-long-enough-0123456789');
  vi.stubEnv('CONVEX_SITE_URL', 'http://127.0.0.1:3211');
  vi.stubEnv('APPLE_SERVICES_ID', SERVICES_ID);
}

export function stopFakeApple(): void {
  setAppleKeys(null);
  vi.unstubAllEnvs();
}

export interface AppleTokenOptions {
  readonly sub: string;
  readonly nonce?: string | undefined;
  readonly aud?: string;
  readonly iss?: string;
  readonly email?: string;
  /** Seconds since the epoch. Default: now. */
  readonly iat?: number;
  readonly signWith?: CryptoKey;
}

/** An id token like the one the Apple sheet gives the app. */
export async function appleToken(apple: FakeApple, options: AppleTokenOptions): Promise<string> {
  const iat = options.iat ?? Math.floor(Date.now() / 1000);
  const claims: Record<string, unknown> = { email_verified: 'true', is_private_email: 'true' };
  if (options.nonce !== undefined) claims['nonce'] = options.nonce;
  claims['email'] = options.email ?? `${options.sub}@privaterelay.appleid.com`;
  return await new SignJWT(claims)
    .setProtectedHeader({ alg: 'RS256', kid: apple.jwk.kid ?? 'test-key' })
    .setIssuer(options.iss ?? APPLE_ISSUER)
    .setAudience(options.aud ?? 'com.tavlaki')
    .setSubject(options.sub)
    .setIssuedAt(iat)
    .setExpirationTime(iat + 600)
    .sign(options.signWith ?? apple.privateKey);
}

export function setup(): Convex {
  const t = convexTest(schema, modules);
  betterAuthTest.register(t);
  return t;
}

/** A phone: it keeps the session cookie, like the Expo client. */
export interface Phone {
  cookie: string;
}

export function newPhone(): Phone {
  return { cookie: '' };
}

/** The `name=value` pairs of a response's cookies. */
function cookiesOf(response: Response): Map<string, string> {
  const pairs = new Map<string, string>();
  const header = response.headers.get('set-cookie') ?? '';
  for (const part of header.split(/,(?=\s*[^;,=\s]+=)/)) {
    const [pair] = part.trim().split(';');
    const at = pair?.indexOf('=') ?? -1;
    if (pair === undefined || at <= 0) continue;
    pairs.set(pair.slice(0, at), pair.slice(at + 1));
  }
  return pairs;
}

function keep(phone: Phone, response: Response): void {
  const next = cookiesOf(response);
  if (next.size === 0) return;
  const now = new Map<string, string>();
  for (const pair of phone.cookie.split('; ')) {
    const at = pair.indexOf('=');
    if (at > 0) now.set(pair.slice(0, at), pair.slice(at + 1));
  }
  for (const [name, value] of next) {
    if (value === '') now.delete(name);
    else now.set(name, value);
  }
  phone.cookie = [...now].map(([name, value]) => `${name}=${value}`).join('; ');
}

/**
 * A `fetch` for Better Auth's real client that sends each request to the
 * test server as `phone`: the app's origin, the session cookie, and the
 * cookies each reply sets (what the Expo plugin does on a phone).
 */
export function phoneFetch(t: Convex, phone: Phone): typeof fetch {
  return async (input, init) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    const headers = new Headers(request.headers);
    headers.set('origin', ORIGIN);
    if (phone.cookie !== '') headers.set('cookie', phone.cookie);
    const body = request.method === 'GET' ? undefined : await request.text();
    const response = await t.fetch(`${url.pathname}${url.search}`, {
      method: request.method,
      headers,
      ...(body === undefined || body === '' ? {} : { body }),
    });
    keep(phone, response);
    return response;
  };
}

export interface Reply {
  readonly status: number;
  readonly body: Record<string, unknown>;
}

/** One call to `/api/auth/<path>` from `phone`. */
export async function call(t: Convex, phone: Phone, path: string, body?: object): Promise<Reply> {
  const headers: Record<string, string> = { origin: ORIGIN };
  if (phone.cookie !== '') headers['cookie'] = phone.cookie;
  if (body !== undefined) headers['content-type'] = 'application/json';
  const response = await t.fetch(`/api/auth/${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  keep(phone, response);
  const text = await response.text();
  let parsed: Record<string, unknown> = {};
  try {
    parsed = text === '' ? {} : (JSON.parse(text) as Record<string, unknown>);
  } catch {
    parsed = { text };
  }
  return { status: response.status, body: parsed };
}

export async function nonce(t: Convex, phone: Phone): Promise<string> {
  const reply = await call(t, phone, 'key/nonce', {});
  const value = reply.body['nonce'];
  if (reply.status !== 200 || typeof value !== 'string') {
    throw new Error(`no nonce: ${reply.status} ${JSON.stringify(reply.body)}`);
  }
  return value;
}

/** The user in a sign-in or save reply. */
export function userOf(reply: Reply): { id: string; isAnonymous: boolean } {
  const user = reply.body['user'] as { id?: unknown; isAnonymous?: unknown } | undefined;
  if (typeof user?.id !== 'string') {
    throw new Error(`no user: ${reply.status} ${JSON.stringify(reply.body)}`);
  }
  return { id: user.id, isAnonymous: user.isAnonymous === true };
}

/** Signs `phone` in as a new guest. */
export async function guest(t: Convex, phone: Phone): Promise<string> {
  return userOf(await call(t, phone, 'sign-in/anonymous', {})).id;
}

/** Signs `phone` in with Apple (Better Auth's id token sign-in). */
export async function signInWithApple(
  t: Convex,
  apple: FakeApple,
  phone: Phone,
  sub: string,
  more: { email?: string } = {},
): Promise<Reply> {
  const value = await nonce(t, phone);
  const token = await appleToken(apple, { ...more, sub, nonce: value });
  return await call(t, phone, 'sign-in/social', {
    provider: 'apple',
    idToken: { token, nonce: value },
  });
}

/** Saves an Apple key on `phone`'s signed-in user. */
export async function saveApple(
  t: Convex,
  apple: FakeApple,
  phone: Phone,
  sub: string,
): Promise<Reply> {
  const value = await nonce(t, phone);
  const token = await appleToken(apple, { sub, nonce: value });
  return await call(t, phone, 'key/save', { provider: 'apple', idToken: { token, nonce: value } });
}

/** The `sub` and other claims of a JWT (no signature check). */
export function payloadOf(token: string): Record<string, unknown> {
  const payload = token.split('.')[1] ?? '';
  const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
  return JSON.parse(json) as Record<string, unknown>;
}

/** The Convex token of `phone`'s session. */
export async function convexToken(t: Convex, phone: Phone): Promise<string> {
  const reply = await call(t, phone, 'convex/token');
  const token = reply.body['token'];
  if (typeof token !== 'string') throw new Error(`no token: ${reply.status}`);
  return token;
}

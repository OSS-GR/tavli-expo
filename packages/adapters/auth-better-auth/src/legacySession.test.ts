import { describe, expect, it } from 'vitest';

import type { SessionStorage } from './client';

// React Native and Expo are stubs here (`vitest.config.ts`).
const { createBetterAuthClient } = await import('./client');

/** A phone's secure store as a map. */
function memoryStorage(saved: Map<string, string>): SessionStorage {
  return {
    getItem: (key) => saved.get(key) ?? null,
    setItem: (key, value) => {
      saved.set(key, value);
    },
    getItemAsync: (key) => Promise.resolve(saved.get(key) ?? null),
    setItemAsync: (key, value) => {
      saved.set(key, value);
      return Promise.resolve();
    },
  };
}

/** 1.6's chunk marker: a control character, so no JSON value starts with it. */
const CHUNK_MARKER = '\u0001ba-chunks:';

const LATER = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

/**
 * The cookie value @better-auth/expo 1.6 saved: JSON, cookie name →
 * `{ value, expires }` (its `getSetCookie`).
 */
function cookieJson(convexJwt: string): string {
  return JSON.stringify({
    'better-auth.session_token': { value: 'session-token.signature', expires: LATER },
    'better-auth.convex_jwt': { value: convexJwt, expires: LATER },
  });
}

/**
 * Splits `value` like 1.6's `storageAdapter.setItem`: 1,800 characters
 * per key, `<key>.0` … `<key>.<n - 1>`, and the marker `\u0001ba-chunks:<n>`
 * under the key.
 */
function saveLike16(saved: Map<string, string>, key: string, value: string): void {
  const limit = 1800;
  if (value.length <= limit) {
    saved.set(key, value);
    return;
  }
  const count = Math.ceil(value.length / limit);
  for (let i = 0; i < count; i++) saved.set(`${key}.${i}`, value.slice(i * limit, (i + 1) * limit));
  saved.set(key, `${CHUNK_MARKER}${count}`);
}

function clientOn(saved: Map<string, string>) {
  return createBetterAuthClient({
    baseURL: 'https://example.convex.site',
    scheme: 'tavlaki',
    storage: memoryStorage(saved),
  });
}

// A guest has no key to sign in again, so an app update must keep the
// session that 1.6 saved (#418).
describe('a session saved by @better-auth/expo 1.6', () => {
  it('reads a short cookie value', async () => {
    const saved = new Map<string, string>();
    saveLike16(saved, 'tavlaki_cookie', cookieJson('short.jwt'));
    expect(saved.get('tavlaki_cookie')?.startsWith('{')).toBe(true);

    const cookie = await clientOn(saved).getCookie();

    expect(cookie).toBe(
      'better-auth.session_token=session-token.signature; better-auth.convex_jwt=short.jwt',
    );
  });

  it('reads a cookie value split into chunks', async () => {
    const saved = new Map<string, string>();
    // A Convex JWT is long: with it the value passes 1,800 characters.
    const jwt = `header.${'p'.repeat(3000)}.signature`;
    saveLike16(saved, 'tavlaki_cookie', cookieJson(jwt));
    expect(saved.get('tavlaki_cookie')).toBe(`${CHUNK_MARKER}2`);

    const cookie = await clientOn(saved).getCookie();

    expect(cookie).toBe(
      `better-auth.session_token=session-token.signature; better-auth.convex_jwt=${jwt}`,
    );
  });
});

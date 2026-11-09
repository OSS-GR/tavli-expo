// The Better Auth adapter (`@tavli/auth-better-auth`) on Better Auth's
// real client, against the real sign-in routes, offline (#397). The
// client's fetch goes to convex-test as a phone that keeps its cookies
// (`phoneFetch`), and the fake Apple signs the id tokens. The
// `AuthProvider` contract checks (`@tavli/contracts/testing`) run on top.
// The adapter's own tests use a hand-written client; this one checks that
// the real client and our routes agree on paths, bodies and error codes.

import { convexClient } from '@convex-dev/better-auth/client/plugins';
import { createAuthClient } from 'better-auth/client';
import { anonymousClient } from 'better-auth/client/plugins';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { fromBetterAuthClient, jwtPayload } from '@tavli/auth-better-auth/provider';
import type { BetterAuthClient } from '@tavli/auth-better-auth/provider';
import { isAuthErrorData } from '@tavli/contracts';
import type { AuthProvider } from '@tavli/contracts';
import { authProviderContract } from '@tavli/contracts/testing';
import type { AuthProviderContractSubject } from '@tavli/contracts/testing';

import {
  appleToken,
  fakeApple,
  newPhone,
  phoneFetch,
  setup,
  stopFakeApple,
  useFakeApple,
} from './test.apple';
import type { Convex, FakeApple, Phone } from './test.apple';

let apple: FakeApple;

beforeAll(async () => {
  apple = await fakeApple();
});

beforeEach(() => {
  useFakeApple(apple);
});

afterEach(() => {
  stopFakeApple();
});

/** The app's client, minus the Expo plugin (it needs the phone): `phoneFetch` does its part. */
function realClient(t: Convex, phone: Phone): BetterAuthClient {
  return createAuthClient({
    baseURL: `${process.env['CONVEX_SITE_URL']}/api/auth`,
    plugins: [anonymousClient(), convexClient()],
    fetchOptions: { customFetchImpl: phoneFetch(t, phone) },
  });
}

function subject(): AuthProviderContractSubject & { t: Convex } {
  const t = setup();
  const phone = newPhone();
  return {
    t,
    auth: fromBetterAuthClient(realClient(t, phone)),
    restart: () => fromBetterAuthClient(realClient(t, phone)),
    tokenSubject: (token: string) => String(jwtPayload(token)['sub']),
    appleIdToken: (sub: string, nonce: string) => appleToken(apple, { sub, nonce }),
  };
}

async function failure(call: Promise<unknown>): Promise<string> {
  try {
    await call;
  } catch (error) {
    if (isAuthErrorData(error)) return error.code;
    throw error;
  }
  throw new Error('expected the call to fail');
}

async function saveAs(auth: AuthProvider, sub: string) {
  const nonce = await auth.keyNonce();
  const idToken = await appleToken(apple, { sub, nonce });
  return auth.saveKey({ provider: 'apple', idToken, nonce });
}

describe('the Better Auth adapter on the real client and routes', () => {
  for (const check of authProviderContract()) {
    it(check.name, () => check.run(subject()));
  }

  it('the server codes reach the port: KEY_BELONGS_TO_OTHER, LAST_KEY, REJECTED', async () => {
    const { t, auth } = subject();
    await auth.signInAsGuest();
    await saveAs(auth, 'apple-ann');
    expect(await failure(auth.removeKey('apple'))).toBe('LAST_KEY');
    // A second Apple id on the same account (PROVIDER_TAKEN on the server).
    expect(await failure(saveAs(auth, 'apple-bob'))).toBe('REJECTED');

    const other = fromBetterAuthClient(realClient(t, newPhone()));
    await other.signInAsGuest();
    expect(await failure(saveAs(other, 'apple-ann'))).toBe('KEY_BELONGS_TO_OTHER');
    expect(other.currentUser()?.isGuest).toBe(true);
  });
});

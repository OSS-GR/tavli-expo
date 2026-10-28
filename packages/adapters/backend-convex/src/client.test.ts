// The app factory: a ConvexClient on the URL, signed in through the
// AuthProvider. `convex/browser` is mocked, so no socket opens.

import { getFunctionName } from 'convex/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createMemoryAuthProvider } from '@tavli/contracts';

import { authTokenFetcher, createConvexClient, createConvexGameTransportFromUrl } from './client';
import type { ConvexTokenFetcher } from './client';

const made = vi.hoisted(() => [] as FakeConvexClient[]);

interface FakeConvexClient {
  readonly url: string;
  fetchToken: ConvexTokenFetcher | null;
  /** How many times `setAuth` was called. */
  authSets: number;
  readonly mutations: { name: string; args: unknown }[];
}

vi.mock('convex/browser', () => ({
  ConvexClient: class {
    readonly url: string;
    fetchToken: ConvexTokenFetcher | null = null;
    authSets = 0;
    readonly mutations: { name: string; args: unknown }[] = [];
    constructor(url: string) {
      this.url = url;
      made.push(this);
    }
    setAuth(fetchToken: ConvexTokenFetcher) {
      this.fetchToken = fetchToken;
      this.authSets += 1;
    }
    onUpdate() {
      return () => undefined;
    }
    mutation(fn: Parameters<typeof getFunctionName>[0], args: unknown) {
      this.mutations.push({ name: getFunctionName(fn), args });
      return Promise.resolve(7);
    }
  },
}));

beforeEach(() => {
  made.length = 0;
});

describe('authTokenFetcher', () => {
  it('gives null while nobody is signed in, then the user token', async () => {
    const auth = createMemoryAuthProvider();
    const fetchToken = authTokenFetcher(auth);
    await expect(fetchToken({ forceRefreshToken: false })).resolves.toBeNull();
    const user = await auth.signInAsGuest();
    await expect(fetchToken({ forceRefreshToken: false })).resolves.toBe(`memory-token:${user.id}`);
  });

  it('passes forceRefreshToken on as forceRefresh', async () => {
    const getToken = vi.fn((options?: { readonly forceRefresh?: boolean }) =>
      Promise.resolve(options?.forceRefresh === true ? 'new' : 'saved'),
    );
    const fetchToken = authTokenFetcher({ getToken });
    await expect(fetchToken({ forceRefreshToken: true })).resolves.toBe('new');
    await expect(fetchToken({ forceRefreshToken: false })).resolves.toBe('saved');
    expect(getToken.mock.calls).toEqual([[{ forceRefresh: true }], [{ forceRefresh: false }]]);
  });
});

describe('createConvexGameTransportFromUrl', () => {
  it('makes one client on the URL, sets its auth, and calls through it', async () => {
    const auth = createMemoryAuthProvider();
    const user = await auth.signInAsGuest();
    const transport = createConvexGameTransportFromUrl('https://tavlaki.convex.cloud', auth);
    expect(made).toHaveLength(1);
    const client = made[0] as FakeConvexClient;
    expect(client.url).toBe('https://tavlaki.convex.cloud');
    await expect(client.fetchToken?.({ forceRefreshToken: false })).resolves.toBe(
      `memory-token:${user.id}`,
    );
    await transport.resign('g1');
    expect(client.mutations).toEqual([{ name: 'games:resign', args: { gameId: 'g1' } }]);
  });
});

describe('createConvexClient', () => {
  // Convex 1.46 asks for a token on `setAuth`, and again only when the
  // server refuses one: a first `null` leaves the client signed out for
  // good. So a sign-in after the client was made must call `setAuth` again.
  it('sets the auth again on each sign-in and sign-out', async () => {
    const auth = createMemoryAuthProvider();
    createConvexClient('https://tavlaki.convex.cloud', auth);
    const client = made[0] as FakeConvexClient;
    expect(client.authSets).toBe(1);
    await expect(client.fetchToken?.({ forceRefreshToken: false })).resolves.toBeNull();

    const user = await auth.signInAsGuest();
    expect(client.authSets).toBe(2);
    await expect(client.fetchToken?.({ forceRefreshToken: false })).resolves.toBe(
      `memory-token:${user.id}`,
    );

    await auth.signOut();
    expect(client.authSets).toBe(3);
  });
});

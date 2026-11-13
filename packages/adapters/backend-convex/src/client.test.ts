// The app factory: a ConvexClient on the URL, signed in through the
// AuthProvider. `convex/browser` is mocked, so no socket opens.

import { getFunctionName } from 'convex/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createMemoryAuthProvider } from '@tavli/contracts';

import { authTokenFetcher, createConvexClient, createConvexGameTransportFromUrl } from './client';
import type { ConvexTokenFetcher } from './client';

const made = vi.hoisted(() => [] as FakeConvexClient[]);

interface FakeConvexClient {
  readonly url: string;
  fetchToken: ConvexTokenFetcher | null;
  /** The `onChange` of the last `setAuth`: the client reports signed in or not. */
  onAuth: ((isAuthenticated: boolean) => void) | null;
  /** How many times `setAuth` was called. */
  authSets: number;
  readonly mutations: { name: string; args: unknown }[];
}

vi.mock('convex/browser', () => ({
  ConvexClient: class {
    readonly url: string;
    fetchToken: ConvexTokenFetcher | null = null;
    onAuth: ((isAuthenticated: boolean) => void) | null = null;
    authSets = 0;
    readonly mutations: { name: string; args: unknown }[] = [];
    constructor(url: string) {
      this.url = url;
      made.push(this);
    }
    setAuth(fetchToken: ConvexTokenFetcher, onChange?: (isAuthenticated: boolean) => void) {
      this.fetchToken = fetchToken;
      this.onAuth = onChange ?? null;
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

describe('createConvexClient after a failed token refresh', () => {
  // Convex 1.49 refreshes the token before it ends. When that one fetch
  // gives `null` (the phone was asleep or offline), it reports "not signed
  // in" and never asks again: every query then fails with NOT_SIGNED_IN
  // until the app restarts. The client must set the auth again.
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('sets the auth again, waiting longer each time, while a user is signed in', async () => {
    const auth = createMemoryAuthProvider();
    await auth.signInAsGuest();
    createConvexClient('https://tavlaki.convex.cloud', auth);
    const client = made[0] as FakeConvexClient;
    expect(client.authSets).toBe(1);

    client.onAuth?.(false);
    vi.advanceTimersByTime(999);
    expect(client.authSets).toBe(1);
    vi.advanceTimersByTime(1);
    expect(client.authSets).toBe(2);

    // Still refused: the next try waits twice as long.
    client.onAuth?.(false);
    vi.advanceTimersByTime(1999);
    expect(client.authSets).toBe(2);
    vi.advanceTimersByTime(1);
    expect(client.authSets).toBe(3);

    // Signed in again: the wait starts over.
    client.onAuth?.(true);
    client.onAuth?.(false);
    vi.advanceTimersByTime(1000);
    expect(client.authSets).toBe(4);
  });

  it('never waits more than 30 seconds', () => {
    const auth = createMemoryAuthProvider();
    createConvexClient('https://tavlaki.convex.cloud', auth);
    const client = made[0] as FakeConvexClient;
    return auth.signInAsGuest().then(async () => {
      await Promise.resolve();
      const sets = client.authSets;
      for (let i = 0; i < 10; i++) {
        client.onAuth?.(false);
        vi.advanceTimersByTime(30_000);
      }
      expect(client.authSets).toBe(sets + 10);
    });
  });

  it('does nothing when nobody is signed in', () => {
    const auth = createMemoryAuthProvider();
    createConvexClient('https://tavlaki.convex.cloud', auth);
    const client = made[0] as FakeConvexClient;
    client.onAuth?.(false);
    vi.advanceTimersByTime(60_000);
    expect(client.authSets).toBe(1);
  });

  it('drops a planned try when the sign-in changes', async () => {
    const auth = createMemoryAuthProvider();
    await auth.signInAsGuest();
    createConvexClient('https://tavlaki.convex.cloud', auth);
    const client = made[0] as FakeConvexClient;
    client.onAuth?.(false);
    await auth.signOut();
    await Promise.resolve();
    expect(client.authSets).toBe(2);
    vi.advanceTimersByTime(60_000);
    expect(client.authSets).toBe(2);
  });
});

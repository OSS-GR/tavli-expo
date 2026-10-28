// Online play wiring (#266): built on first use, no guest at start, and
// the Jest fake of `@/services` (test/onlineFake.ts).
import {
  createMemoryAuthProvider,
  createMemoryAuthStore,
  type AuthProvider,
  type GameTransport,
  type OnlineGameView,
} from '@tavli/contracts';
import { createSeededRng } from '@tavli/engine';
import { createMemoryGameServer } from '@tavli/online';

import { onlineFake } from '../test/onlineFake';

import { createOnlineServices, once, type OnlineAdapters } from './onlineServices';
import { auth as servicesAuth, games as servicesGames } from './services';

const SERVER = {
  url: 'https://superb-dog-503.eu-west-1.convex.cloud',
  siteUrl: 'https://superb-dog-503.eu-west-1.convex.site',
};
const PLAYERS = { white: 'guest-1', black: 'bob' };

/** Adapters on the in-memory sign-in and server, which record each call. */
function memoryAdapters() {
  const authStore = createMemoryAuthStore();
  const server = createMemoryGameServer({ rng: createSeededRng(3), now: () => 0 });
  const made: string[] = [];
  const adapters: OnlineAdapters<{ readonly auth: AuthProvider }> = {
    createAuth: (siteUrl) => {
      made.push(`auth ${siteUrl}`);
      return createMemoryAuthProvider(authStore);
    },
    createClient: (url, auth) => {
      made.push(`client ${url}`);
      return { auth };
    },
    createGames: ({ auth }): GameTransport => {
      made.push('games');
      // Like the Convex adapter: each call comes from the signed-in user.
      const caller = () => server.transportFor(auth.currentUser()?.id ?? 'nobody');
      return {
        subscribe: (gameId, onView, onError) => caller().subscribe(gameId, onView, onError),
        sendTurn: (request) => caller().sendTurn(request),
        sendAnswer: (request) => caller().sendAnswer(request),
        resign: (gameId) => caller().resign(gameId),
      };
    },
  };
  return { adapters, authStore, server, made };
}

/** Waits until the in-memory server has answered (it answers on later microtasks). */
async function settle(): Promise<void> {
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
}

describe('once', () => {
  it('calls make once, on the first call', () => {
    const make = jest.fn(() => ({ n: 1 }));
    const get = once(make);
    expect(make).not.toHaveBeenCalled();
    const first = get();
    expect(get()).toBe(first);
    expect(make).toHaveBeenCalledTimes(1);
  });
});

describe('createOnlineServices', () => {
  it('is undefined (online is off) when the build has no server', () => {
    const { adapters, made } = memoryAdapters();
    expect(createOnlineServices(undefined, adapters)).toBeUndefined();
    expect(made).toEqual([]);
  });

  it('makes nothing at start', () => {
    const { adapters, made } = memoryAdapters();
    expect(createOnlineServices(SERVER, adapters)).toBeDefined();
    expect(made).toEqual([]);
  });

  it('makes the sign-in on the site URL on its first call, and no client yet', async () => {
    const { adapters, made, authStore } = memoryAdapters();
    const online = createOnlineServices(SERVER, adapters)!;
    await expect(online.auth.ready()).resolves.toBeNull();
    expect(online.auth.currentUser()).toBeNull();
    expect(made).toEqual([`auth ${SERVER.siteUrl}`]);
    // No guest until a screen asks for one.
    expect(authStore.guests).toBe(0);
  });

  it('opens one client on the deployment URL on the first game call', async () => {
    const { adapters, made, server, authStore } = memoryAdapters();
    const online = createOnlineServices(SERVER, adapters)!;
    const gameId = server.createGame('guest-1', PLAYERS, 'portes', 3, 'live');
    const errors: unknown[] = [];
    const stop = online.games.subscribe(
      gameId,
      () => {},
      (error) => errors.push(error),
    );
    expect(made).toEqual([`auth ${SERVER.siteUrl}`, `client ${SERVER.url}`, 'games']);
    await settle();
    // Signed out: the server does not know the caller.
    expect(errors).toEqual([expect.objectContaining({ code: 'NOT_A_PLAYER' })]);
    stop();
    expect(authStore.guests).toBe(0);

    await online.auth.signInAsGuest();
    const views: OnlineGameView[] = [];
    online.games.subscribe(gameId, (view) => views.push(view));
    await settle();
    expect(views.map((view) => view.gameId)).toEqual([gameId]);
    await online.games.resign(gameId);
    // Still the same client: nothing new was made.
    expect(made).toHaveLength(3);
  });

  it('passes every sign-in call through', async () => {
    const { adapters } = memoryAdapters();
    const online = createOnlineServices(SERVER, adapters)!;
    const seen: (string | null)[] = [];
    const stop = online.auth.onChange((user) => seen.push(user?.id ?? null));
    await expect(online.auth.getToken()).resolves.toBeNull();
    await expect(online.auth.signInAsGuest()).resolves.toEqual({ id: 'guest-1', isGuest: true });
    await expect(online.auth.getToken({ forceRefresh: true })).resolves.toBe(
      'memory-token:guest-1',
    );
    await online.auth.signOut();
    await settle();
    expect(seen).toEqual(['guest-1', null]);
    stop();
  });
});

describe('the Jest fake of @/services', () => {
  it('gives the in-memory sign-in and games', () => {
    expect(servicesAuth).toBe(onlineFake.auth);
    expect(servicesGames).toBe(onlineFake.games);
  });

  it('starts each test with nobody signed in and a new server', async () => {
    expect(onlineFake.auth.currentUser()).toBeNull();
    await onlineFake.auth.signInAsGuest();
    // The first guest of each test is `guest-1`.
    expect(onlineFake.auth.currentUser()).toEqual({ id: 'guest-1', isGuest: true });
    expect(onlineFake.server().getGame('game-1')).toBeNull();
    onlineFake.server().createGame('guest-1', PLAYERS, 'portes', 3, 'live');
  });

  it('refuses game calls while nobody is signed in', async () => {
    const gameId = onlineFake.server().createGame('guest-1', PLAYERS, 'portes', 3, 'live');
    const errors: unknown[] = [];
    onlineFake.games.subscribe(
      gameId,
      () => {},
      (error) => errors.push(error),
    );
    // Never inside `subscribe`.
    expect(errors).toEqual([]);
    await settle();
    expect(errors).toEqual([expect.objectContaining({ code: 'NOT_SIGNED_IN' })]);
    await expect(onlineFake.games.resign(gameId)).rejects.toMatchObject({ code: 'NOT_SIGNED_IN' });
  });

  it('plays as the signed-in guest', async () => {
    const gameId = onlineFake.server().createGame('guest-1', PLAYERS, 'portes', 3, 'live');
    await onlineFake.auth.signInAsGuest();
    const views: OnlineGameView[] = [];
    onlineFake.games.subscribe(gameId, (view) => views.push(view));
    await settle();
    expect(views).toHaveLength(1);
    expect(views[0]?.players).toEqual(PLAYERS);
    await onlineFake.games.resign(gameId);
    await settle();
    expect(views.at(-1)?.version).toBeGreaterThan(views[0]?.version ?? 0);
  });
});

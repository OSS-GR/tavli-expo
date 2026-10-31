// Which server an online game id talks to (#266): a dev game plays on the
// in-memory server as `me`; any other game on `games`, as the user of the
// saved session. Opening a game never makes a guest.
import { act, renderHook } from '@testing-library/react-native';

import { botLevels, botRunner } from '@/services';

import { onlineFake } from '../../../test/onlineFake';

import { useOnlineConnection } from './connection';
import { startDevGame, stopAnyDevGame } from './devGame';
import { isDevGame } from './devGameIds';

// The `@/services` fake (`jest.setup.ts`): the test may swap its parts.
const services = jest.requireMock<Record<string, unknown>>('@/services');

const PLAYERS = { white: 'guest-1', black: 'bob' };

beforeEach(() => {
  jest.useFakeTimers();
});
afterEach(() => {
  stopAnyDevGame();
  jest.useRealTimers();
});

async function flush(): Promise<void> {
  await act(async () => {
    for (let i = 0; i < 20; i++) await Promise.resolve();
  });
}

function startDev() {
  const { createSeededRng } = jest.requireActual('@tavli/engine');
  return startDevGame({
    server: onlineFake.server(),
    me: 'me',
    choice: 'portes',
    turnTimeMinutes: 1,
    targetPoints: 1,
    difficulty: botLevels.portes[0]!,
    runner: botRunner,
    rng: createSeededRng(4),
  });
}

describe('useOnlineConnection', () => {
  it('plays a dev game on the in-memory server as `me`, with no sign-in', async () => {
    const { gameId } = startDev();
    expect(isDevGame(gameId)).toBe(true);
    const { result } = await renderHook(() => useOnlineConnection(gameId));
    expect(result.current).toEqual({
      status: 'ready',
      transport: onlineFake.transportFor('me'),
      me: 'me',
    });
    await flush();
    expect(onlineFake.authStore.guests).toBe(0);
  });

  it('plays any other game on `games` as the signed-in user', async () => {
    onlineFake.authStore.session = { id: 'guest-1', isGuest: true };
    const gameId = onlineFake.server().createGame('guest-1', PLAYERS, 'portes', 3, 1);
    expect(isDevGame(gameId)).toBe(false);
    const { result } = await renderHook(() => useOnlineConnection(gameId));
    await flush();
    expect(result.current).toEqual({
      status: 'ready',
      transport: onlineFake.games,
      me: 'guest-1',
    });
    expect(onlineFake.authStore.guests).toBe(0);
  });

  it('makes no guest: with nobody signed in the game cannot be opened', async () => {
    const signIn = jest.spyOn(onlineFake.auth, 'signInAsGuest');
    const { result } = await renderHook(() => useOnlineConnection('k57abc'));
    await flush();
    expect(result.current).toEqual({ status: 'signedOut' });
    expect(signIn).not.toHaveBeenCalled();
    expect(onlineFake.authStore.guests).toBe(0);
    signIn.mockRestore();
  });

  it('is connecting while the saved session loads', async () => {
    const ready = jest.spyOn(onlineFake.auth, 'ready').mockReturnValue(new Promise(() => {}));
    const { result } = await renderHook(() => useOnlineConnection('k57abc'));
    await flush();
    expect(result.current).toEqual({ status: 'connecting' });
    expect(ready).toHaveBeenCalledTimes(1);
    ready.mockRestore();
  });

  it('fails when the saved session does not load', async () => {
    const ready = jest
      .spyOn(onlineFake.auth, 'ready')
      .mockRejectedValue({ code: 'NETWORK', message: 'offline' });
    const { result } = await renderHook(() => useOnlineConnection('k57abc'));
    await flush();
    expect(result.current).toEqual({ status: 'failed' });
    ready.mockRestore();
  });

  it('is off when the build has no online server', async () => {
    const restore = [
      jest.replaceProperty(services, 'auth', undefined),
      jest.replaceProperty(services, 'games', undefined),
    ];
    const { result } = await renderHook(() => useOnlineConnection('k57abc'));
    await flush();
    expect(result.current).toEqual({ status: 'off' });
    expect(onlineFake.authStore.guests).toBe(0);
    for (const replaced of restore) replaced.restore();
  });
});

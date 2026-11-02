// "Update needed" (#390): the screen over the whole app when this build is
// older than the server allows. The routes that ask the server are the
// real ones (Home, Play a friend, the game route); the rest are stubs.
import { NO_UPDATE_POLICY, type AppUpdatePolicy } from '@tavli/contracts';
import { router } from 'expo-router';
import { act, renderRouter, screen } from 'expo-router/testing-library';
import { AppState, Linking, Text, type AppStateStatus } from 'react-native';

import RootLayout from '@/app/_layout';
import FriendRoute from '@/app/friend/index';
import GameRoute from '@/app/game/[id]/index';
import HomeRoute from '@/app/index';
import { rememberOnlineAccount } from '@/features/online/accountHint';
import { consentStore } from '@/features/privacy/consentStore';

import { runOnFakeTimers, setupUser } from '../../../test/clock';
import { TEST_BUILD, onlineFake } from '../../../test/onlineFake';

import { TESTFLIGHT_STORE_URL, TESTFLIGHT_URL } from './decision';

// Like navigation.test.tsx: keep our Reanimated mock, and only the
// library's expo-linking mock.
jest.mock('expo-router/build/testing-library/mocks', () => {
  jest.mock('expo-linking', () => ({
    ...jest.requireActual('expo-linking'),
    createURL: (path: string) => `tavlaki://${path}`,
    resolveScheme: () => 'tavlaki',
    addEventListener: () => ({ remove: () => undefined }),
  }));
  return {};
});

runOnFakeTimers();

const ME = 'guest-1';
const FRIEND = 'bob';

/** A stand-in for a route these tests only pass through. */
const stub = (name: string) =>
  function StubRoute() {
    return <Text>{name}</Text>;
  };

const routes = {
  _layout: RootLayout,
  index: HomeRoute,
  settings: stub('settings'),
  'welcome/language': stub('welcome language'),
  'welcome/privacy': stub('welcome privacy'),
  'welcome/board': stub('welcome board'),
  'new-game': stub('new game'),
  history: stub('history'),
  'online-games': stub('online games'),
  'rules/[variant]': stub('rules'),
  tutorial: stub('tutorial'),
  'game/[id]/index': GameRoute,
  'game/[id]/match-end': stub('match end'),
  'game/[id]/review': stub('review'),
  'dev/board': stub('dev board'),
  'dev/online': stub('dev online'),
  'invite/[code]': stub('invite'),
  'friend/index': FriendRoute,
  'friend/[code]': stub('invite wait'),
};

const TITLE = { name: 'Update needed' } as const;

/** The server blocks builds below `minBuild` on iOS. */
function blockBelow(minBuild: number, more: Partial<AppUpdatePolicy> = {}): void {
  onlineFake.appUpdates.set('ios', { ...NO_UPDATE_POLICY, minBuild, ...more });
}

function signIn(): void {
  onlineFake.authStore.session = { id: ME, isGuest: true };
}

beforeEach(async () => {
  await act(async () => consentStore.getState().setConsent(true));
});

/** Lets the in-memory ports answer (they answer on later microtasks). */
async function flush(): Promise<void> {
  await act(async () => {
    for (let i = 0; i < 20; i += 1) await Promise.resolve();
  });
}

/** The app comes back to the foreground. */
async function foreground(): Promise<void> {
  // React Native's Jest setup makes `AppState.addEventListener` a mock.
  const calls = jest.mocked(AppState.addEventListener).mock.calls;
  await act(async () => {
    for (const [type, fn] of calls) {
      if (type === 'change') (fn as (next: AppStateStatus) => void)('active');
    }
    for (let i = 0; i < 20; i += 1) await Promise.resolve();
  });
}

/** A new online game of mine (I am White), after both opening dice. */
async function newGame(): Promise<string> {
  const gameId = onlineFake
    .server()
    .createGame(ME, { white: ME, black: FRIEND }, 'portes', 5, null);
  await act(async () => {
    await onlineFake.openGame(gameId);
  });
  return gameId;
}

function updateShows(): boolean {
  return screen.queryByRole('header', TITLE) !== null;
}

describe('no call', () => {
  it('for a player who never played online', async () => {
    blockBelow(TEST_BUILD + 1);
    await renderRouter(routes, { initialUrl: '/' });
    await flush();
    await foreground();
    expect(onlineFake.appUpdates.calls).toEqual([]);
    expect(updateShows()).toBe(false);
  });

  it('in a build with no store build number', async () => {
    onlineFake.setAppBuild(null);
    blockBelow(TEST_BUILD + 1);
    signIn();
    rememberOnlineAccount();
    await renderRouter(routes, { initialUrl: '/friend' });
    await flush();
    expect(onlineFake.appUpdates.calls).toEqual([]);
    expect(updateShows()).toBe(false);
  });
});

describe('from Home', () => {
  it('shows when this build is older than the server allows', async () => {
    blockBelow(TEST_BUILD + 1);
    signIn();
    rememberOnlineAccount();
    await renderRouter(routes, { initialUrl: '/' });
    await flush();
    expect(onlineFake.appUpdates.calls).toEqual(['ios']);
    expect(screen.getByRole('header', TITLE)).toBeOnTheScreen();
    expect(
      screen.getByText('This version no longer works with online play. Update to keep playing.'),
    ).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Update' })).toBeOnTheScreen();
  });

  it('does not show for this build or a newer one', async () => {
    blockBelow(TEST_BUILD);
    signIn();
    rememberOnlineAccount();
    await renderRouter(routes, { initialUrl: '/' });
    await flush();
    expect(onlineFake.appUpdates.calls).toEqual(['ios']);
    expect(updateShows()).toBe(false);
  });

  it('does not show when the server cannot be reached', async () => {
    onlineFake.appUpdates.failCalls();
    signIn();
    rememberOnlineAccount();
    await renderRouter(routes, { initialUrl: '/' });
    await flush();
    expect(onlineFake.appUpdates.calls).toEqual(['ios']);
    expect(updateShows()).toBe(false);
  });

  it('asks again on foreground, and goes when the server lets the build through', async () => {
    signIn();
    rememberOnlineAccount();
    await renderRouter(routes, { initialUrl: '/' });
    await flush();
    expect(updateShows()).toBe(false);

    blockBelow(TEST_BUILD + 1);
    await foreground();
    expect(onlineFake.appUpdates.calls).toEqual(['ios', 'ios']);
    expect(screen.getByRole('header', TITLE)).toBeOnTheScreen();

    blockBelow(TEST_BUILD - 1);
    await foreground();
    expect(updateShows()).toBe(false);
  });
});

describe('Play a friend', () => {
  it('asks when it opens on a phone that played online', async () => {
    blockBelow(TEST_BUILD + 1);
    rememberOnlineAccount();
    await renderRouter(routes, { initialUrl: '/friend' });
    await flush();
    expect(onlineFake.appUpdates.calls).toEqual(['ios']);
    expect(screen.getByRole('header', TITLE)).toBeOnTheScreen();
  });

  it('asks first at Make an invite on a phone that never played online', async () => {
    blockBelow(TEST_BUILD + 1);
    await renderRouter(routes, { initialUrl: '/friend' });
    await flush();
    // The privacy policy: no server call before the first invite.
    expect(onlineFake.appUpdates.calls).toEqual([]);
    expect(updateShows()).toBe(false);
    const user = setupUser();
    await user.press(screen.getByRole('button', { name: 'Make an invite' }));
    await flush();
    expect(onlineFake.appUpdates.calls).toEqual(['ios']);
    expect(screen.getByRole('header', TITLE)).toBeOnTheScreen();
  });
});

describe('during an online game', () => {
  it('waits until the player leaves the game', async () => {
    signIn();
    const gameId = await newGame();
    blockBelow(TEST_BUILD + 1);
    // No account note: Home makes no check. The game route asks.
    await renderRouter(routes, { initialUrl: '/' });
    await flush();
    expect(onlineFake.appUpdates.calls).toEqual([]);
    await act(async () => {
      router.push(`/game/${gameId}`);
    });
    await flush();
    expect(onlineFake.appUpdates.calls).toEqual(['ios']);
    expect(screen).toHavePathname(`/game/${gameId}`);
    expect(updateShows()).toBe(false);

    await act(async () => {
      router.back();
    });
    await flush();
    expect(screen).toHavePathname('/');
    expect(screen.getByRole('header', TITLE)).toBeOnTheScreen();
  });

  it('shows at once when the server forces the update', async () => {
    signIn();
    const gameId = await newGame();
    blockBelow(TEST_BUILD + 1, { force: true });
    await renderRouter(routes, { initialUrl: `/game/${gameId}` });
    await flush();
    expect(onlineFake.appUpdates.calls).toEqual(['ios']);
    expect(screen).toHavePathname(`/game/${gameId}`);
    expect(screen.getByRole('header', TITLE)).toBeOnTheScreen();
  });

  it('stays once it shows, also when a game opens under it', async () => {
    blockBelow(TEST_BUILD + 1);
    signIn();
    const gameId = await newGame();
    rememberOnlineAccount();
    await renderRouter(routes, { initialUrl: '/' });
    await flush();
    expect(screen.getByRole('header', TITLE)).toBeOnTheScreen();
    // A push tap opens a game under the screen.
    await act(async () => {
      router.push(`/game/${gameId}`);
    });
    await flush();
    expect(screen.getByRole('header', TITLE)).toBeOnTheScreen();
  });
});

describe('Update', () => {
  it('opens TestFlight, or its App Store page when the phone has no TestFlight', async () => {
    const open = jest
      .spyOn(Linking, 'openURL')
      .mockRejectedValueOnce(new Error('no TestFlight'))
      .mockResolvedValue(undefined);
    blockBelow(TEST_BUILD + 1);
    rememberOnlineAccount();
    await renderRouter(routes, { initialUrl: '/friend' });
    await flush();
    const user = setupUser();
    await user.press(screen.getByRole('button', { name: 'Update' }));
    await flush();
    expect(open.mock.calls.map(([url]) => url)).toEqual([TESTFLIGHT_URL, TESTFLIGHT_STORE_URL]);
    // There is no way past it.
    expect(screen.getByRole('header', TITLE)).toBeOnTheScreen();
    open.mockRestore();
  });

  it("opens the owner's link from the server first", async () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    const url = 'https://testflight.apple.com/join/abc123';
    blockBelow(TEST_BUILD + 1, { updateUrl: url });
    rememberOnlineAccount();
    await renderRouter(routes, { initialUrl: '/friend' });
    await flush();
    const user = setupUser();
    await user.press(screen.getByRole('button', { name: 'Update' }));
    await flush();
    expect(open.mock.calls.map(([called]) => called)).toEqual([url]);
    open.mockRestore();
  });
});

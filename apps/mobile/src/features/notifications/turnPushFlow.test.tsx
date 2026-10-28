// Turn notifications in the app (#285): the offer after an async invite,
// "Not now", the token on the server, a tap on a push, and the Settings
// row. The routes that matter are the real ones; the game board is a stub.
import type { createRecordingAnalytics } from '@tavli/contracts';
import { router } from 'expo-router';
import { act, renderRouter, screen } from 'expo-router/testing-library';
import { Linking, Text } from 'react-native';

import RootLayout from '@/app/_layout';
import FriendRoute from '@/app/friend/index';
import InviteRoute from '@/app/invite/[code]';
import SettingsRoute from '@/app/settings';
import WelcomeLanguageRoute from '@/app/welcome/language';
import WelcomePrivacyRoute from '@/app/welcome/privacy';
import { CONSENT_STORAGE_KEY } from '@/features/privacy/consent';
import { consentStore } from '@/features/privacy/consentStore';
import { analytics, onlineServer, storage } from '@/services';

import { runOnFakeTimers, setupUser } from '../../../test/clock';
import { onlineFake } from '../../../test/onlineFake';

import { resetTurnPushesForTest } from './appTurnPushes';
import { TURN_PUSHES_STORAGE_KEY } from './turnPushes';

const recorded = analytics as ReturnType<typeof createRecordingAnalytics>;
// The `@/services` fake (`jest.setup.ts`): a test may swap its parts.
const services = jest.requireMock<Record<string, unknown>>('@/services');

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

/** A stand-in for a route these tests only pass through. */
const stub = (name: string) =>
  function StubRoute() {
    return <Text>{name}</Text>;
  };

const routes = {
  _layout: RootLayout,
  index: stub('home'),
  settings: SettingsRoute,
  'welcome/language': WelcomeLanguageRoute,
  'welcome/privacy': WelcomePrivacyRoute,
  'new-game': stub('new game'),
  history: stub('history'),
  'rules/[variant]': stub('rules'),
  tutorial: stub('tutorial'),
  'game/[id]/index': stub('board'),
  'game/[id]/match-end': stub('match end'),
  'game/[id]/review': stub('review'),
  'dev/board': stub('dev board'),
  'dev/online': stub('dev online'),
  'invite/[code]': InviteRoute,
  'friend/index': FriendRoute,
  'friend/[code]': stub('invite wait'),
};

const OFFER = { name: 'Turn notifications?' } as const;

beforeEach(async () => {
  await act(async () => consentStore.getState().setConsent(true));
});

/** Lets the in-memory ports answer (they answer on later microtasks). */
async function flush(): Promise<void> {
  await act(async () => {
    for (let i = 0; i < 20; i += 1) await Promise.resolve();
  });
}

/** The player taps a push while the app is open. */
async function tapPush(data: unknown): Promise<void> {
  await act(async () => {
    onlineFake.notifications.tap(data);
    for (let i = 0; i < 20; i += 1) await Promise.resolve();
  });
}

/** Play a friend → pick the pace → Make an invite. */
async function makeInvite(pace: 'Live' | 'Async') {
  const user = setupUser();
  await renderRouter(routes, { initialUrl: '/friend' });
  await user.press(screen.getByRole('radio', { name: pace }));
  await user.press(screen.getByRole('button', { name: 'Make an invite' }));
  expect(await screen.findByText('invite wait')).toBeOnTheScreen();
  await flush();
  return user;
}

describe('the offer', () => {
  it('shows after the player makes an async invite; "Not now" is kept', async () => {
    const user = await makeInvite('Async');
    expect(screen.getByRole('header', OFFER)).toBeOnTheScreen();
    expect(screen.getByText(/We tell you when it is your turn/)).toBeOnTheScreen();
    // Only the offer: the phone was not asked yet.
    expect(onlineFake.notifications.prompts).toBe(0);
    await user.press(screen.getByRole('button', { name: 'Not now' }));
    expect(screen.queryByRole('header', OFFER)).toBeNull();
    expect(JSON.parse(storage.getString(TURN_PUSHES_STORAGE_KEY)!)).toEqual({ declined: true });

    // The next async invite does not offer again.
    await act(async () => {
      router.push('/friend');
    });
    await user.press(screen.getByRole('radio', { name: 'Async' }));
    await user.press(screen.getByRole('button', { name: 'Make an invite' }));
    await flush();
    expect(screen.queryByRole('header', OFFER)).toBeNull();
    expect(onlineFake.notifications.prompts).toBe(0);
    expect(
      recorded.sent.some((s) => s.type === 'track' && s.event === 'push_permission_answered'),
    ).toBe(false);
  });

  it('does not show after a live invite', async () => {
    await makeInvite('Live');
    expect(screen.queryByRole('header', OFFER)).toBeNull();
  });

  it('accepting an async invite offers it; "Turn on" asks the phone and registers the token', async () => {
    const user = setupUser();
    onlineFake.authStore.session = { id: 'guest-1', isGuest: true };
    const code = onlineServer().createInvite('friend', 'plakoto', 3, 'async');
    await renderRouter(routes, { initialUrl: `/invite/${code}` });
    await user.press(await screen.findByRole('button', { name: 'Accept' }));
    expect(await screen.findByText('board')).toBeOnTheScreen();
    await flush();
    await user.press(screen.getByRole('button', { name: 'Turn on' }));
    await flush();
    expect(screen.queryByRole('header', OFFER)).toBeNull();
    expect(onlineFake.notifications.prompts).toBe(1);
    expect(onlineFake.pushTokens.saved).toEqual([
      { playerId: 'guest-1', token: onlineFake.notifications.token, platform: 'ios' },
    ]);
    // The answer only: never the token or the user id.
    expect(recorded.sent).toContainEqual({
      type: 'track',
      event: 'push_permission_answered',
      props: { answer: 'granted' },
    });
  });

  it('accepting a live invite does not offer it', async () => {
    const user = setupUser();
    onlineFake.authStore.session = { id: 'guest-1', isGuest: true };
    const code = onlineServer().createInvite('friend', 'fevga', 1, 'live');
    await renderRouter(routes, { initialUrl: `/invite/${code}` });
    await user.press(await screen.findByRole('button', { name: 'Accept' }));
    expect(await screen.findByText('board')).toBeOnTheScreen();
    await flush();
    expect(screen.queryByRole('header', OFFER)).toBeNull();
  });

  it('a phone that already allows pushes is not asked, and its token is registered', async () => {
    onlineFake.notifications.setPermission('granted');
    await makeInvite('Async');
    expect(screen.queryByRole('header', OFFER)).toBeNull();
    expect(onlineFake.notifications.prompts).toBe(0);
    expect(onlineFake.pushTokens.saved).toEqual([
      { playerId: 'guest-1', token: onlineFake.notifications.token, platform: 'ios' },
    ]);
  });

  it('never shows at first launch', async () => {
    await act(async () => {
      storage.remove(CONSENT_STORAGE_KEY);
      consentStore.setState({ status: 'unset' });
    });
    const user = setupUser();
    await renderRouter(routes, { initialUrl: '/' });
    expect(screen).toHavePathname('/welcome/language');
    await user.press(screen.getByRole('button', { name: 'Continue' }));
    await user.press(screen.getByRole('button', { name: 'Allow usage data' }));
    await flush();
    expect(screen).toHavePathname('/');
    expect(screen.queryByRole('header', OFFER)).toBeNull();
    expect(onlineFake.notifications.prompts).toBe(0);
  });
});

describe('a tap on a push', () => {
  it('opens its game', async () => {
    await renderRouter(routes, { initialUrl: '/' });
    await flush();
    await tapPush({ gameId: 'k57abc' });
    expect(screen).toHavePathname('/game/k57abc');
    expect(screen.getByText('board')).toBeOnTheScreen();
  });

  it('that opened the app opens its game', async () => {
    onlineFake.notifications.tap({ gameId: 'k57abc' }, { opensApp: true });
    await renderRouter(routes, { initialUrl: '/' });
    await flush();
    expect(screen).toHavePathname('/game/k57abc');
  });

  it('with no game, or a local game, opens nothing', async () => {
    await renderRouter(routes, { initialUrl: '/' });
    await flush();
    await tapPush({});
    await tapPush({ gameId: 'local-abc' });
    await tapPush({ gameId: '../settings' });
    expect(screen).toHavePathname('/');
  });

  it('before the welcome answer opens the game after the welcome flow', async () => {
    await act(async () => {
      storage.remove(CONSENT_STORAGE_KEY);
      consentStore.setState({ status: 'unset' });
    });
    const user = setupUser();
    onlineFake.notifications.tap({ gameId: 'k57abc' }, { opensApp: true });
    await renderRouter(routes, { initialUrl: '/' });
    await flush();
    expect(screen).toHavePathname('/welcome/language');
    await user.press(screen.getByRole('button', { name: 'Continue' }));
    await user.press(screen.getByRole('button', { name: "Don't allow" }));
    await flush();
    expect(screen).toHavePathname('/game/k57abc');
  });
});

describe('Settings', () => {
  it('"Turn notifications" shows the state, turns them on, and opens the phone settings when off', async () => {
    const user = setupUser();
    const openSettings = jest.spyOn(Linking, 'openSettings').mockResolvedValue();
    await renderRouter(routes, { initialUrl: '/settings' });
    await flush();
    expect(screen.getByRole('header', { name: 'Notifications' })).toBeOnTheScreen();
    expect(screen.getByText('Turn notifications')).toBeOnTheScreen();
    expect(screen.getByText(/^Off\. Turn them on/)).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Turn on' }));
    await flush();
    expect(onlineFake.notifications.prompts).toBe(1);
    expect(screen.getByText(/^On\./)).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Turn on' })).toBeNull();
    // Nobody is signed in: no token goes to the server.
    expect(onlineFake.pushTokens.calls).toEqual([]);
    openSettings.mockRestore();
  });

  it('a "no" on the phone shows the way to the phone settings', async () => {
    const user = setupUser();
    const openSettings = jest.spyOn(Linking, 'openSettings').mockResolvedValue();
    onlineFake.notifications.setPermission('denied');
    await renderRouter(routes, { initialUrl: '/settings' });
    await flush();
    expect(screen.getByText('Off in the phone settings.')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Open phone settings ›' }));
    expect(openSettings).toHaveBeenCalledTimes(1);
    openSettings.mockRestore();
  });
});

describe('a phone without online play', () => {
  let restore: (() => void)[] = [];
  beforeEach(() => {
    restore = [
      jest.replaceProperty(services, 'notifications', undefined),
      jest.replaceProperty(services, 'pushTokens', undefined),
    ].map((replaced) => () => replaced.restore());
    resetTurnPushesForTest();
  });
  afterEach(() => {
    for (const undo of restore) undo();
  });

  it('never offers, shows no Settings row, and opens nothing on a tap', async () => {
    await makeInvite('Async');
    expect(screen.queryByRole('header', OFFER)).toBeNull();
    await act(async () => {
      router.push('/settings');
    });
    await flush();
    expect(screen.queryByText('Turn notifications')).toBeNull();
    await tapPush({ gameId: 'k57abc' });
    expect(screen).toHavePathname('/settings');
    expect(onlineFake.notifications.prompts).toBe(0);
    expect(onlineFake.pushTokens.calls).toEqual([]);
  });
});

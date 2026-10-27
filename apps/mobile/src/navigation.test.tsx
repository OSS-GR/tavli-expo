/**
 * The real routes in `src/app`, driven like a user: Home → New game →
 * board → menu → Home. (Tests must not live in `src/app`: every file there
 * is a route.)
 */
import { userEvent } from '@testing-library/react-native';
import { act, renderRouter, screen } from 'expo-router/testing-library';

import { matchSessions } from '@/features/match/appSessions';
import { consentStore } from '@/features/privacy/consentStore';
import { DEFAULT_SETTINGS } from '@/features/settings/settings';
import { settingsStore } from '@/features/settings/store';

// The router testing library would mock Reanimated and worklets with the
// packages' own mocks and replace ours (jest.setup.ts). Keep only its
// expo-linking mock.
jest.mock('expo-router/build/testing-library/mocks', () => {
  jest.mock('expo-linking', () => ({
    ...jest.requireActual('expo-linking'),
    createURL: (path: string) => `tavlaki://${path}`,
    resolveScheme: () => 'tavlaki',
    addEventListener: () => ({ remove: () => undefined }),
  }));
  return {};
});

beforeEach(async () => {
  await act(async () => {
    settingsStore.setState({ ...DEFAULT_SETTINGS });
    // The user already answered the first-launch consent, so Home shows.
    consentStore.setState({ status: 'denied' });
  });
});

describe('app navigation', () => {
  it('starts a game vs the bot and goes back home from the menu', async () => {
    const user = userEvent.setup();
    const router = await renderRouter('./src/app', { initialUrl: '/' });
    expect(router.getPathname()).toBe('/');

    await user.press(screen.getByRole('button', { name: /^Play vs bot/ }));
    expect(router.getPathname()).toBe('/new-game');
    expect(router.getSearchParams()).toEqual({ mode: 'bot' });

    await user.press(screen.getByRole('radio', { name: '5' }));
    await user.press(screen.getByRole('button', { name: 'Start game' }));
    const session = matchSessions.current();
    expect(session?.setup).toMatchObject({ mode: 'bot', targetPoints: 5, botLevel: 'easy' });
    expect(router.getPathname()).toBe(`/game/${session?.id}`);
    expect(
      screen.getByRole('button', { name: 'Roll to start, or tap the board' }),
    ).toBeOnTheScreen();

    await user.press(screen.getByRole('button', { name: 'Game menu' }));
    await user.press(screen.getByRole('button', { name: /^Exit to home/ }));
    expect(router.getPathname()).toBe('/');
  });

  it('opens pass-and-play with the local mode param', async () => {
    const user = userEvent.setup();
    const router = await renderRouter('./src/app', { initialUrl: '/' });
    await user.press(screen.getByRole('button', { name: /^Pass-and-play/ }));
    expect(router.getSearchParams()).toEqual({ mode: 'local' });
    expect(screen.getByLabelText('Name of player 1, white checkers')).toBeOnTheScreen();
  });

  it('shows "could not be opened" for an unknown game id', async () => {
    await renderRouter('./src/app', { initialUrl: '/game/local-nope' });
    expect(screen.getByText('This game could not be opened.')).toBeOnTheScreen();
  });
});

/**
 * The real routes in `src/app`, driven like a user: Home → New game →
 * board → menu → Home. (Tests must not live in `src/app`: every file there
 * is a route.)
 */
import { userEvent } from '@testing-library/react-native';
import { router as appRouter } from 'expo-router';
import { act, renderRouter, screen } from 'expo-router/testing-library';

import { matchSessions } from '@/features/match/appSessions';
import { SAVED_MATCH_KEY } from '@/features/match/savedMatch';
import { DEFAULT_SETTINGS } from '@/features/settings/settings';
import { settingsStore } from '@/features/settings/store';
import { storage } from '@/services';

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
  });
  // Each test starts with no match and an empty save slot.
  const current = matchSessions.current();
  if (current) matchSessions.end(current.id);
  storage.remove(SAVED_MATCH_KEY);
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

    // The match is saved: Home offers to continue it.
    const card = screen.getByRole('button', { name: /^Continue game, Portes · vs Bot \(Easy\)/ });
    expect(card).toHaveAccessibleName(/You 0 – 0 Bot · first to 5 · just now/);
    await user.press(card);
    expect(router.getPathname()).toBe(`/game/${session?.id}`);

    // A new game asks first, because it ends the saved one.
    await user.press(screen.getByRole('button', { name: 'Game menu' }));
    await user.press(screen.getByRole('button', { name: /^Exit to home/ }));
    await user.press(screen.getByRole('button', { name: /^Pass-and-play/ }));
    await user.press(screen.getByRole('button', { name: 'Start game' }));
    expect(screen.getByText('Start a new game?')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Start new' }));
    expect(matchSessions.current()?.setup.mode).toBe('local');
  });

  it('opens pass-and-play with the local mode param', async () => {
    const user = userEvent.setup();
    const router = await renderRouter('./src/app', { initialUrl: '/' });
    await user.press(screen.getByRole('button', { name: /^Pass-and-play/ }));
    expect(router.getSearchParams()).toEqual({ mode: 'local' });
    expect(screen.getByLabelText('Name of player 1, white checkers')).toBeOnTheScreen();
  });

  it('opens the rules from New game and from the in-game menu', async () => {
    const user = userEvent.setup();
    const router = await renderRouter('./src/app', { initialUrl: '/new-game?mode=bot' });
    await user.press(screen.getByRole('button', { name: 'How to play Portes' }));
    expect(router.getPathname()).toBe('/rules/portes');
    expect(screen.getByTestId('rules-section-hitting')).toBeOnTheScreen();

    await act(async () => appRouter.back());
    await user.press(screen.getByRole('button', { name: 'Start game' }));
    await user.press(screen.getByRole('button', { name: 'Game menu' }));
    await user.press(screen.getByRole('button', { name: 'How to play Portes' }));
    expect(router.getPathname()).toBe('/rules/portes');
  });

  it('opens the Plakoto page, and Fevga from the Tavli page', async () => {
    const user = userEvent.setup();
    await renderRouter('./src/app', { initialUrl: '/rules/plakoto' });
    expect(screen.getByTestId('rules-section-mother')).toBeOnTheScreen();

    const router = await renderRouter('./src/app', { initialUrl: '/rules/tavli' });
    await user.press(screen.getByRole('button', { name: 'How to play Fevga' }));
    expect(router.getPathname()).toBe('/rules/fevga');
    expect(screen.getByTestId('rules-section-runner')).toBeOnTheScreen();
  });

  it('shows "could not be opened" for an unknown game id', async () => {
    await renderRouter('./src/app', { initialUrl: '/game/local-nope' });
    expect(screen.getByText('This game could not be opened.')).toBeOnTheScreen();
  });

  it('drops a broken save and says so once on Home', async () => {
    storage.setString(SAVED_MATCH_KEY, '{"v":1,"log":"broken"}');
    await renderRouter('./src/app', { initialUrl: '/' });
    expect(screen.getByTestId('toast')).toHaveTextContent('Your saved game could not be opened.');
    expect(screen.queryByRole('button', { name: /^Continue game/ })).toBeNull();
    expect(storage.getString(SAVED_MATCH_KEY)).toBeUndefined();

    // A language switch does not show the notice again (in Greek).
    await act(async () => {
      settingsStore.setState({ language: 'el' });
    });
    expect(screen.getByTestId('toast')).toHaveTextContent('Your saved game could not be opened.');
  });
});

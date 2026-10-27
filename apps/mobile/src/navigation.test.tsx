/**
 * The real routes in `src/app`, driven like a user: Home → New game →
 * board → menu → Home. (Tests must not live in `src/app`: every file there
 * is a route.)
 */
import type { createRecordingAnalytics } from '@tavli/contracts';
import { userEvent, waitFor } from '@testing-library/react-native';
import { router as appRouter } from 'expo-router';
import { act, renderRouter, screen } from 'expo-router/testing-library';

import { MATCH_END_DELAY_MS } from '@/features/game/GameScreen';
import { historyStore } from '@/features/history/store';
import { matchSessions } from '@/features/match/appSessions';
import { saveLastSetup } from '@/features/match/lastSetup';
import { defaultSetup } from '@/features/match/setup';
import { consentStore } from '@/features/privacy/consentStore';
import { SAVED_MATCH_KEY } from '@/features/match/savedMatch';
import { DEFAULT_SETTINGS } from '@/features/settings/settings';
import { settingsStore } from '@/features/settings/store';
import { LESSONS } from '@/features/tutorial/lessons';
import { TUTORIAL_STORAGE_KEY } from '@/features/tutorial/progress';
import { tutorialStore } from '@/features/tutorial/store';
import { analytics, storage } from '@/services';

import { layoutTutorialBoard, playLessonByTaps } from '../test/tutorialTaps';

const recorded = analytics as ReturnType<typeof createRecordingAnalytics>;

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
  // The tutorial was not seen yet: Home offers it.
  storage.remove(TUTORIAL_STORAGE_KEY);
  await act(async () => tutorialStore.setState({ status: 'new' }));
  // Each test starts with no match and an empty save slot.
  const current = matchSessions.current();
  if (current) matchSessions.end(current.id);
  storage.remove(SAVED_MATCH_KEY);
  await act(async () => historyStore.getState().clear());
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

  it('opens match end when the match is over, then rematch, change settings or home', async () => {
    const user = userEvent.setup();
    const router = await renderRouter('./src/app', { initialUrl: '/' });
    await user.press(screen.getByRole('button', { name: /^Play vs bot/ }));
    await user.press(screen.getByRole('button', { name: 'Start game' }));
    const session = matchSessions.current()!;
    const board = `/game/${session.id}`;
    const end = `${board}/match-end`;

    // The bot resigns the match: you win. The match-end screen replaces the board.
    const botResigns = () =>
      act(async () => {
        session.store.getState().dispatch({ type: 'resignMatch', player: 'black' });
      });
    await botResigns();
    await waitFor(() => expect(router.getPathname()).toBe(end), {
      timeout: MATCH_END_DELAY_MS + 2000,
    });
    expect(screen.getByRole('header', { name: 'You won the match!' })).toBeOnTheScreen();
    // A finished match is not in the save slot.
    expect(storage.getString(SAVED_MATCH_KEY)).toBeUndefined();

    // Rematch: the same settings, back on the board, and you start (no opening roll).
    await user.press(screen.getByRole('button', { name: 'Rematch, Same settings · you start' }));
    expect(router.getPathname()).toBe(board);
    expect(session.store.getState().flow.match.status).toBe('in-progress');
    expect(screen.getByRole('button', { name: 'Roll dice, or tap the board' })).toBeOnTheScreen();
    expect(JSON.parse(storage.getString(SAVED_MATCH_KEY) ?? '{}').id).toBe(session.id);

    // Change settings: the new-game form of the same mode; the match is gone.
    await botResigns();
    await waitFor(() => expect(router.getPathname()).toBe(end), {
      timeout: MATCH_END_DELAY_MS + 2000,
    });
    await user.press(screen.getByRole('button', { name: 'Change settings' }));
    expect(router.getPathname()).toBe('/new-game');
    expect(router.getSearchParams()).toEqual({ mode: 'bot' });
    expect(matchSessions.current()).toBeNull();

    // Home: no Continue card, because the match is over.
    await user.press(screen.getByRole('button', { name: 'Start game' }));
    const next = matchSessions.current()!;
    await act(async () => {
      next.store.getState().dispatch({ type: 'resignMatch', player: 'white' });
    });
    await waitFor(() => expect(router.getPathname()).toBe(`/game/${next.id}/match-end`), {
      timeout: MATCH_END_DELAY_MS + 2000,
    });
    expect(screen.getByRole('header', { name: 'Bot wins the match!' })).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Home' }));
    expect(router.getPathname()).toBe('/');
    expect(screen.queryByRole('button', { name: /^Continue game/ })).toBeNull();
  });

  it('adds a finished match to History, opened from Home and Settings (#142)', async () => {
    const user = userEvent.setup();
    const router = await renderRouter('./src/app', { initialUrl: '/' });

    // No match yet: the empty state's Play opens New game.
    await user.press(screen.getByRole('link', { name: 'History' }));
    expect(router.getPathname()).toBe('/history');
    await user.press(screen.getByRole('button', { name: 'Play' }));
    expect(router.getPathname()).toBe('/new-game');

    await user.press(screen.getByRole('button', { name: 'Start game' }));
    const session = matchSessions.current()!;
    await act(async () => {
      session.store.getState().dispatch({ type: 'resignMatch', player: 'black' });
    });
    await waitFor(() => expect(router.getPathname()).toBe(`/game/${session.id}/match-end`), {
      timeout: MATCH_END_DELAY_MS + 2000,
    });
    await user.press(screen.getByRole('button', { name: 'Home' }));
    await user.press(screen.getByRole('link', { name: 'History' }));
    expect(screen.getByTestId('history-row-0')).toHaveAccessibleName(
      /^Portes · vs Bot \(Easy\), You 0 – 0 Bot · first to \d, Won, /,
    );

    // Settings: clear it after the confirm step.
    await act(async () => appRouter.back());
    await user.press(screen.getByRole('button', { name: 'Settings' }));
    await user.press(screen.getByRole('button', { name: 'Clear history' }));
    await user.press(screen.getByRole('button', { name: 'Clear' }));
    await user.press(screen.getByRole('button', { name: 'Match history ›' }));
    expect(router.getPathname()).toBe('/history');
    expect(screen.getByRole('header', { name: 'No matches yet' })).toBeOnTheScreen();
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

  it('opens the Plakoto rules page', async () => {
    await renderRouter('./src/app', { initialUrl: '/rules/plakoto' });
    expect(screen.getByTestId('rules-section-mother')).toBeOnTheScreen();
  });

  it('opens the Fevga rules from the Tavli page', async () => {
    const user = userEvent.setup();
    const router = await renderRouter('./src/app', { initialUrl: '/rules/tavli' });
    await user.press(screen.getByRole('button', { name: 'How to play Fevga' }));
    expect(router.getPathname()).toBe('/rules/fevga');
    expect(screen.getByTestId('rules-section-runner')).toBeOnTheScreen();
  });

  it('shows "could not be opened" for an unknown game id', async () => {
    await renderRouter('./src/app', { initialUrl: '/game/local-nope' });
    expect(screen.getByText('This game could not be opened.')).toBeOnTheScreen();
  });

  it('shows "could not be opened" for the match end of an unknown game', async () => {
    await renderRouter('./src/app', { initialUrl: '/game/local-nope/match-end' });
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

describe('tutorial (#128)', () => {
  it('is offered on Home, skipped, and opened again from Settings and the rules page', async () => {
    const user = userEvent.setup();
    // Usage data allowed: the tutorial events go out.
    await act(async () => consentStore.setState({ status: 'granted' }));
    recorded.sent.length = 0;
    const router = await renderRouter('./src/app', { initialUrl: '/' });

    expect(screen.getByRole('header', { name: 'Learn to play' })).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Start the lesson' }));
    expect(router.getPathname()).toBe('/tutorial');
    expect(router.getSearchParams()).toEqual({ from: 'home' });
    expect(screen.getByText('Lesson 1 of 7')).toBeOnTheScreen();

    await user.press(screen.getByRole('button', { name: 'Skip' }));
    expect(router.getPathname()).toBe('/');
    // Skipped: Home does not offer it again, also after a restart (saved).
    expect(screen.queryByTestId('home-learn')).not.toBeOnTheScreen();
    expect(tutorialStore.getState().status).toBe('dismissed');
    expect(storage.getString(TUTORIAL_STORAGE_KEY)).toContain('dismissed');
    const tracked = recorded.sent.filter((e) => e.type === 'track');
    expect(tracked).toEqual([
      { type: 'track', event: 'tutorial_started', props: { source: 'home' } },
      { type: 'track', event: 'tutorial_skipped', props: { step: 1, lesson: 'move' } },
    ]);

    // Reopen from Settings → Help.
    await user.press(screen.getByRole('button', { name: 'Settings' }));
    await user.press(screen.getByRole('button', { name: 'Learn to play ›' }));
    expect(router.getPathname()).toBe('/tutorial');
    expect(router.getSearchParams()).toEqual({ from: 'settings' });
    await user.press(screen.getByRole('button', { name: 'Skip' }));
    expect(router.getPathname()).toBe('/settings');

    // Reopen from the Portes rules page.
    await act(async () => appRouter.replace('/rules/portes'));
    await user.press(screen.getByRole('button', { name: 'Learn to play on the board' }));
    expect(router.getPathname()).toBe('/tutorial');
    expect(router.getSearchParams()).toEqual({ from: 'rules' });
  });

  it('"Not now" on Home hides the card for good', async () => {
    const user = userEvent.setup();
    await renderRouter('./src/app', { initialUrl: '/' });
    await user.press(screen.getByRole('button', { name: 'Not now' }));
    expect(screen.queryByTestId('home-learn')).not.toBeOnTheScreen();
    expect(tutorialStore.getState().status).toBe('dismissed');
  });

  it('plays the whole tutorial with taps, then opens the first game: Portes vs Easy', async () => {
    const user = userEvent.setup();
    // The last choices were another game and level: the first game ignores them.
    saveLastSetup(storage, { ...defaultSetup('bot'), game: 'plakoto', botLevel: 'medium' });
    const router = await renderRouter('./src/app', { initialUrl: '/' });
    await user.press(screen.getByRole('button', { name: 'Start the lesson' }));
    await layoutTutorialBoard();

    for (const [i] of LESSONS.entries()) {
      await playLessonByTaps(i);
      await user.press(screen.getByRole('button', { name: 'Next' }));
    }
    expect(tutorialStore.getState().status).toBe('done');

    await user.press(screen.getByRole('button', { name: 'Play your first game' }));
    expect(router.getPathname()).toBe('/new-game');
    expect(router.getSearchParams()).toEqual({ mode: 'bot', first: '1' });
    expect(screen.getByRole('radio', { name: /^Portes/ })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Easy' })).toBeChecked();

    // Back goes Home (the tutorial was replaced), and Home offers it no more.
    await act(async () => appRouter.back());
    expect(router.getPathname()).toBe('/');
    expect(screen.queryByTestId('home-learn')).not.toBeOnTheScreen();
  });
});

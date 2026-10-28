/**
 * The real routes in `src/app`, driven like a user: Home → New game →
 * board → menu → Home. (Tests must not live in `src/app`: every file there
 * is a route.)
 */
import type { createRecordingAnalytics } from '@tavli/contracts';
import { createGameFlow, portes } from '@tavli/engine';
import { fireEvent, within } from '@testing-library/react-native';
import { router as appRouter } from 'expo-router';
import { act, renderRouter, screen } from 'expo-router/testing-library';
import { AppState, type AppStateStatus } from 'react-native';

import { MATCH_END_DELAY_MS } from '@/features/game/GameScreen';
import { historyStore } from '@/features/history/store';
import { matchSessions } from '@/features/match/appSessions';
import { DEV_TICK_MS, devGameRunning, stopAnyDevGame } from '@/features/online/devGame';
import { saveLastSetup } from '@/features/match/lastSetup';
import { defaultSetup } from '@/features/match/setup';
import { consentStore } from '@/features/privacy/consentStore';
import { SAVED_MATCH_KEY } from '@/features/match/savedMatch';
import { DEFAULT_SETTINGS } from '@/features/settings/settings';
import { settingsStore } from '@/features/settings/store';
import { LESSON_SETS, LESSONS } from '@/features/tutorial/lessons';
import { TUTORIAL_STORAGE_KEY, tutorialStorageKey } from '@/features/tutorial/progress';
import { tutorialStore } from '@/features/tutorial/store';
import { analytics, onlineServer, storage } from '@/services';

import { runOnFakeTimers, setupUser } from '../test/clock';
import { nativePath } from '../test/nativeParent';
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

// The game screen and Home's notice close on timers (see test/clock.ts).
// `renderRouter` turns on fake timers by itself too, but never turns them
// off; this turns them on before each test and off after it.
runOnFakeTimers();

/** The match-end screen opens `MATCH_END_DELAY_MS` after the match is over. */
async function expectMatchEndAfterDelay(router: { getPathname: () => string }, path: string) {
  expect(router.getPathname()).not.toBe(path);
  await act(async () => {
    jest.advanceTimersByTime(MATCH_END_DELAY_MS);
  });
  expect(router.getPathname()).toBe(path);
}

beforeEach(async () => {
  await act(async () => {
    settingsStore.setState({ ...DEFAULT_SETTINGS });
    // The user already answered the first-launch consent, so Home shows.
    consentStore.setState({ status: 'denied' });
  });
  // The tutorial was not seen yet: Home offers it.
  for (const game of ['portes', 'plakoto', 'fevga', 'asodio'] as const)
    storage.remove(tutorialStorageKey(game));
  await act(async () =>
    tutorialStore.setState({
      status: 'new',
      variants: { plakoto: 'new', fevga: 'new', asodio: 'new' },
    }),
  );
  // Each test starts with no match and an empty save slot.
  const current = matchSessions.current();
  if (current) matchSessions.end(current.id);
  storage.remove(SAVED_MATCH_KEY);
  await act(async () => historyStore.getState().clear());
});

/** The orientation lock of the native screen that holds `element` (react-native-screens). */
function orientationOf(element: ReturnType<typeof screen.getByTestId>): unknown {
  let node = element.parent;
  while (node !== null && node.type !== 'RNSScreen') node = node.parent;
  return node?.props.screenOrientation;
}

describe('app navigation', () => {
  it('turns only the game board and the tutorial with the phone (#185)', async () => {
    const user = setupUser();
    await renderRouter('./src/app', { initialUrl: '/' });
    const playVsBot = screen.getByRole('button', { name: /^Play vs bot/ });
    expect(orientationOf(playVsBot)).toBe('portrait_up');
    await user.press(playVsBot);
    expect(orientationOf(screen.getByRole('button', { name: 'Start game' }))).toBe('portrait_up');
    await user.press(screen.getByRole('button', { name: 'Start game' }));
    // The game screen follows the phone: portrait or landscape (not upside down on iPhone).
    expect(orientationOf(screen.getByTestId('game-board', { includeHiddenElements: true }))).toBe(
      'default',
    );

    await user.press(screen.getByRole('button', { name: 'Game menu' }));
    await user.press(screen.getByRole('button', { name: /^Settings/ }));
    expect(orientationOf(screen.getByTestId('settings-learn-to-play'))).toBe('portrait_up');
    await act(async () => appRouter.push('/tutorial'));
    expect(orientationOf(screen.getByTestId('tutorial-board'))).toBe('default');
    await act(async () => appRouter.push('/history'));
    expect(orientationOf(screen.getByTestId('history-screen'))).toBe('portrait_up');
  });

  it('starts a game vs the bot and goes back home from the menu', async () => {
    const user = setupUser();
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
    const user = setupUser();
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
    await expectMatchEndAfterDelay(router, end);
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
    await expectMatchEndAfterDelay(router, end);
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
    await expectMatchEndAfterDelay(router, `/game/${next.id}/match-end`);
    expect(screen.getByRole('header', { name: 'Bot wins the match!' })).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Home' }));
    expect(router.getPathname()).toBe('/');
    expect(screen.queryByRole('button', { name: /^Continue game/ })).toBeNull();
  });

  it('opens the game review from the game-end sheet and from match end (#215)', async () => {
    const user = setupUser();
    // Usage data allowed: the review sends `review_opened`.
    await act(async () => consentStore.setState({ status: 'granted' }));
    recorded.sent.length = 0;
    const router = await renderRouter('./src/app', { initialUrl: '/' });
    await user.press(screen.getByRole('button', { name: /^Play vs bot/ }));
    await user.press(screen.getByRole('button', { name: 'Start game' }));
    const session = matchSessions.current()!;
    const board = `/game/${session.id}`;

    // You start with 5-3; the bot resigns the game: the game-end sheet shows.
    await act(async () => {
      const { dispatch } = session.store.getState();
      dispatch({ type: 'rollOpening', player: 'white', die: 5 });
      dispatch({ type: 'rollOpening', player: 'black', die: 3 });
      dispatch({ type: 'resign', player: 'black' });
    });
    await user.press(
      within(screen.getByTestId('game-end-card')).getByRole('button', { name: 'Review' }),
    );
    expect(router.getPathname()).toBe(`${board}/review`);
    expect(screen.getByRole('header', { name: 'Game 1 · Portes' })).toBeOnTheScreen();
    // Nobody finished a turn in that game.
    expect(await screen.findByText('No moves to review in this game.')).toBeOnTheScreen();

    // Back: the board with its sheet.
    await act(async () => appRouter.back());
    expect(router.getPathname()).toBe(board);
    expect(screen.getByTestId('game-end-card')).toBeOnTheScreen();

    // The next game, then the bot resigns the match: Review from match end.
    await act(async () => {
      const { dispatch } = session.store.getState();
      dispatch({ type: 'nextGame' });
      dispatch({ type: 'resignMatch', player: 'black' });
    });
    await expectMatchEndAfterDelay(router, `${board}/match-end`);
    await user.press(screen.getByRole('button', { name: 'Review' }));
    expect(router.getPathname()).toBe(`${board}/review`);
    expect(screen.getByRole('header', { name: 'Game 2 · Portes' })).toBeOnTheScreen();
    await act(async () => appRouter.back());
    expect(router.getPathname()).toBe(`${board}/match-end`);

    const reviews = recorded.sent.filter((e) => e.type === 'track' && e.event === 'review_opened');
    expect(reviews).toEqual([
      { type: 'track', event: 'review_opened', props: { game: 'portes' } },
      { type: 'track', event: 'review_opened', props: { game: 'portes' } },
    ]);
  });

  it('the review of a game still in play goes to the board; an unknown game cannot be opened', async () => {
    const user = setupUser();
    const router = await renderRouter('./src/app', { initialUrl: '/' });
    await user.press(screen.getByRole('button', { name: /^Play vs bot/ }));
    await user.press(screen.getByRole('button', { name: 'Start game' }));
    const session = matchSessions.current()!;
    await act(async () => appRouter.push(`/game/${session.id}/review`));
    expect(router.getPathname()).toBe(`/game/${session.id}`);
    await act(async () => appRouter.push('/game/local-nope/review'));
    expect(screen.getByText('This game could not be opened.')).toBeOnTheScreen();
  });

  it('adds a finished match to History, opened from Home and Settings (#142)', async () => {
    const user = setupUser();
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
    await expectMatchEndAfterDelay(router, `/game/${session.id}/match-end`);
    await user.press(screen.getByRole('button', { name: 'Home' }));
    await user.press(screen.getByRole('link', { name: 'History' }));
    expect(screen.getByTestId('history-row-0')).toHaveAccessibleName(
      /^Portes · vs Bot \(Easy\), You 0 – 0 Bot · first to \d · Bot resigned, Won, /,
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

  it('Resign match keeps the score: 0–0 at the start, 0–2 after a resigned game (#181)', async () => {
    const user = setupUser();
    const router = await renderRouter('./src/app', { initialUrl: '/' });
    const resignMatchFromMenu = async () => {
      await user.press(screen.getByRole('button', { name: 'Game menu' }));
      await user.press(screen.getByRole('button', { name: 'Resign match, Bot wins the match' }));
      await user.press(screen.getByRole('button', { name: 'Resign' }));
    };

    // 1. Resign match at the start: nobody has a point, so it stays 0–0.
    await user.press(screen.getByRole('button', { name: /^Play vs bot/ }));
    await user.press(screen.getByRole('button', { name: 'Start game' }));
    const first = matchSessions.current()!;
    await resignMatchFromMenu();
    await expectMatchEndAfterDelay(router, `/game/${first.id}/match-end`);
    expect(screen.getByRole('header', { name: 'Bot wins the match!' })).toBeOnTheScreen();
    expect(screen.getByText('You resigned the match.')).toBeOnTheScreen();
    expect(screen.getByLabelText('Final score: You 0 – 0 Bot')).toBeOnTheScreen();

    // 2. Rematch: resign a game (diplo at the start), then the match. The 0–2 stays.
    await user.press(screen.getByRole('button', { name: /^Rematch/ }));
    await act(async () => {
      // The bot starts the rematch (it won the last game) and plays its turn.
      jest.advanceTimersByTime(10_000);
    });
    await user.press(screen.getByRole('button', { name: 'Game menu' }));
    await user.press(screen.getByRole('button', { name: 'Resign game, Bot wins this game' }));
    await user.press(screen.getByRole('button', { name: 'Resign' }));
    const card = screen.getByTestId('game-end-card');
    expect(
      within(card).getByText('Diplo: you resigned before you bore off a checker.'),
    ).toBeOnTheScreen();
    expect(within(card).getByText('You 0 – 2 Bot')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: /^Next game/ }));
    await resignMatchFromMenu();
    await expectMatchEndAfterDelay(router, `/game/${first.id}/match-end`);
    expect(screen.getByText('You resigned the match.')).toBeOnTheScreen();
    expect(screen.getByLabelText('Final score: You 0 – 2 Bot')).toBeOnTheScreen();
    expect(screen.getByText('0 – 2')).toBeOnTheScreen();
    expect(screen.getByLabelText('Game 1 · Portes, Bot won, Diplo, 2 points')).toBeOnTheScreen();

    // History shows the same scores, newest first.
    await user.press(screen.getByRole('button', { name: 'Home' }));
    await user.press(screen.getByRole('link', { name: 'History' }));
    expect(screen.getByTestId('history-row-0')).toHaveAccessibleName(
      /^Portes · vs Bot \(Easy\), You 0 – 2 Bot · first to \d · you resigned, Lost, /,
    );
    expect(screen.getByTestId('history-row-1')).toHaveAccessibleName(
      /^Portes · vs Bot \(Easy\), You 0 – 0 Bot · first to \d · you resigned, Lost, /,
    );
  });

  it('opens pass-and-play with the local mode param', async () => {
    const user = setupUser();
    const router = await renderRouter('./src/app', { initialUrl: '/' });
    await user.press(screen.getByRole('button', { name: /^Pass-and-play/ }));
    expect(router.getSearchParams()).toEqual({ mode: 'local' });
    expect(screen.getByLabelText('Name of player 1, white checkers')).toBeOnTheScreen();
  });

  it('opens the rules from New game and from the in-game menu', async () => {
    const user = setupUser();
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

  it('opens the rules of the Plakoto game of a Tavli match in its version (#247)', async () => {
    const user = setupUser();
    const session = matchSessions.start({
      ...defaultSetup('local'),
      game: 'tavli',
      rulesVersions: { ...defaultSetup('local').rulesVersions, plakoto: 'plakoto.federation' },
    });
    const { dispatch } = session.store.getState();
    // Game 1 (Portes, its default rules) ends with a resign; game 2 is Plakoto.
    dispatch({ type: 'rollOpening', player: 'white', die: 6 });
    dispatch({ type: 'rollOpening', player: 'black', die: 1 });
    expect(session.store.getState().flow.game.state.rules.presetId).toBe('portes');
    dispatch({ type: 'resign', player: 'white' });
    dispatch({ type: 'nextGame' });
    expect(session.store.getState().flow.game.state.rules.presetId).toBe('plakoto.federation');

    const router = await renderRouter('./src/app', { initialUrl: `/game/${session.id}` });
    await user.press(screen.getByRole('button', { name: 'Game menu' }));
    await user.press(screen.getByRole('button', { name: 'How to play Plakoto' }));
    expect(router.getPathname()).toBe('/rules/plakoto');
    expect(router.getSearchParams()).toMatchObject({ version: 'plakoto.federation' });
    expect(screen.getByTestId('rules-section-version')).toBeOnTheScreen();
  });

  it('opens the Plakoto rules page', async () => {
    await renderRouter('./src/app', { initialUrl: '/rules/plakoto' });
    expect(screen.getByTestId('rules-section-mother')).toBeOnTheScreen();
  });

  it('opens the Fevga rules from the Tavli page', async () => {
    const user = setupUser();
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

  // On iOS a Skia canvas that moves to another native parent loses its
  // drawing. The dice did, when the menu hid the screen from screen readers
  // (#173). They stayed blank until a move drew them again.
  it('keeps the dice drawn through the menu, Settings and back, and the background (#173)', async () => {
    // React Native's Jest setup makes `AppState.addEventListener` a mock. The
    // listeners the app adds from here on let the test send it to the background.
    const addListener = jest.mocked(AppState.addEventListener);
    expect(jest.isMockFunction(addListener)).toBe(true);
    const firstCall = addListener.mock.calls.length;
    const sendAppState = (state: AppStateStatus) => {
      for (const [type, fn] of addListener.mock.calls.slice(firstCall)) {
        if (type === 'change') (fn as (next: AppStateStatus) => void)(state);
      }
    };
    const user = setupUser();
    const router = await renderRouter('./src/app', { initialUrl: '/' });
    await user.press(screen.getByRole('button', { name: /^Play vs bot/ }));
    await user.press(screen.getByRole('button', { name: 'Start game' }));
    const session = matchSessions.current()!;
    const board = `/game/${session.id}`;
    // You (White) roll first; no opening roll.
    await act(async () => {
      const { flow } = session.store.getState();
      const state = portes.initialState({ startingPlayer: 'white' });
      session.store.setState({
        flow: { ...flow, game: createGameFlow({ state, starter: 'white' }) },
      });
    });
    await user.press(screen.getByRole('button', { name: 'Roll dice, or tap the board' }));
    // The board draws once it knows its size.
    await act(async () => {
      fireEvent(screen.getByTestId('game-board'), 'layout', {
        nativeEvent: { layout: { x: 0, y: 0, width: 375, height: 500 } },
      });
    });

    const hidden = { includeHiddenElements: true };
    const dice = screen.getByTestId('dice-row');
    const label = dice.props.accessibilityLabel as string;
    expect(label).toMatch(/^Dice \d-\d, \d left to play$/);
    const path = nativePath(dice);
    expect(path).not.toBe('');
    const boardPath = nativePath(screen.getByTestId('game-board-canvas', hidden));
    /**
     * The dice are the same canvas, in the same native views, with the same
     * values. The board canvas does not move either.
     */
    const expectSameDice = () => {
      const now = screen.getByTestId('dice-row', hidden);
      expect(now === dice).toBe(true);
      expect(nativePath(now)).toBe(path);
      expect(now).toHaveAccessibleName(label);
      expect(nativePath(screen.getByTestId('game-board-canvas', hidden))).toBe(boardPath);
    };

    // The menu hides the screen from screen readers: the dice stay in place.
    await user.press(screen.getByRole('button', { name: 'Game menu' }));
    expectSameDice();
    await user.press(screen.getByRole('button', { name: /^Settings/ }));
    expect(router.getPathname()).toBe('/settings');
    expectSameDice();
    await act(async () => appRouter.back());
    expect(router.getPathname()).toBe(board);
    expectSameDice();
    expect(screen.getByTestId('dice-row')).toBeOnTheScreen();

    // Resume from the menu, then the app goes to the background and back.
    await user.press(screen.getByRole('button', { name: 'Game menu' }));
    await user.press(screen.getByRole('button', { name: /^Resume/ }));
    expectSameDice();
    expect(addListener.mock.calls.length).toBeGreaterThan(firstCall);
    storage.remove(SAVED_MATCH_KEY);
    await act(async () => sendAppState('background'));
    // Going to the background saves the match (#36): the listeners ran.
    expect(JSON.parse(storage.getString(SAVED_MATCH_KEY) ?? '{}').id).toBe(session.id);
    await act(async () => sendAppState('active'));
    expectSameDice();
    expect(session.store.getState().flow.game.phase).toBe('moving');
  });
});

describe('tutorial (#128)', () => {
  it('is offered on Home, skipped, and opened again from Settings and the rules page', async () => {
    const user = setupUser();
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
      { type: 'track', event: 'tutorial_started', props: { source: 'home', game: 'portes' } },
      {
        type: 'track',
        event: 'tutorial_skipped',
        props: { game: 'portes', step: 1, lesson: 'move' },
      },
    ]);

    // Reopen from Settings → Help: pick the game first.
    await user.press(screen.getByRole('button', { name: 'Settings' }));
    await user.press(screen.getByRole('button', { name: 'Learn to play ›' }));
    await user.press(
      within(screen.getByTestId('tutorial-picker')).getByRole('button', { name: 'Portes' }),
    );
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
    const user = setupUser();
    await renderRouter('./src/app', { initialUrl: '/' });
    await user.press(screen.getByRole('button', { name: 'Not now' }));
    expect(screen.queryByTestId('home-learn')).not.toBeOnTheScreen();
    expect(tutorialStore.getState().status).toBe('dismissed');
  });

  it('plays the whole tutorial with taps, then opens the first game: Portes vs Easy', async () => {
    const user = setupUser();
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

  it('opens the Plakoto lessons from its rules page, saves them apart, then plays Plakoto (#149)', async () => {
    const user = setupUser();
    await act(async () => consentStore.setState({ status: 'granted' }));
    recorded.sent.length = 0;
    const router = await renderRouter('./src/app', { initialUrl: '/rules/plakoto' });
    await user.press(screen.getByRole('button', { name: 'Learn to play on the board' }));
    expect(router.getPathname()).toBe('/tutorial');
    expect(router.getSearchParams()).toEqual({ from: 'rules', game: 'plakoto' });
    expect(screen.getByRole('header', { name: 'Learn Plakoto' })).toBeOnTheScreen();
    await layoutTutorialBoard();

    for (const [i] of LESSON_SETS.plakoto.entries()) {
      await playLessonByTaps(i, 'plakoto');
      await user.press(screen.getByRole('button', { name: 'Next' }));
    }
    // Saved for Plakoto only: Portes (the Home card) is still new.
    expect(tutorialStore.getState().variants.plakoto).toBe('done');
    expect(tutorialStore.getState().status).toBe('new');
    expect(storage.getString(tutorialStorageKey('plakoto'))).toContain('done');
    expect(storage.getString(TUTORIAL_STORAGE_KEY)).toBeUndefined();
    const tracked = recorded.sent.filter((e) => e.type === 'track');
    expect(tracked[0]).toEqual({
      type: 'track',
      event: 'tutorial_started',
      props: { source: 'rules', game: 'plakoto' },
    });
    expect(tracked).toContainEqual({
      type: 'track',
      event: 'tutorial_step',
      props: { game: 'plakoto', step: 3, lesson: 'mother' },
    });
    expect(tracked).toContainEqual({
      type: 'track',
      event: 'tutorial_finished',
      props: { game: 'plakoto' },
    });

    await user.press(screen.getByRole('button', { name: 'Play Plakoto' }));
    expect(router.getPathname()).toBe('/new-game');
    expect(router.getSearchParams()).toEqual({ mode: 'bot', first: 'plakoto' });
    expect(screen.getByRole('radio', { name: /^Plakoto/ })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Easy' })).toBeChecked();
  });

  it('opens the Fevga lessons from its rules page, and Skip saves only Fevga', async () => {
    const user = setupUser();
    const router = await renderRouter('./src/app', { initialUrl: '/rules/fevga' });
    await user.press(screen.getByRole('button', { name: 'Learn to play on the board' }));
    expect(router.getSearchParams()).toEqual({ from: 'rules', game: 'fevga' });
    expect(screen.getByText('Lesson 1 of 4')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Skip' }));
    expect(router.getPathname()).toBe('/rules/fevga');
    expect(tutorialStore.getState().variants).toEqual({
      plakoto: 'new',
      fevga: 'dismissed',
      asodio: 'new',
    });
    expect(tutorialStore.getState().status).toBe('new');
  });
});

describe('tutorial from Settings (#159)', () => {
  const GAMES = [
    ['portes', 'Portes', 'Learn to play', 7],
    ['plakoto', 'Plakoto', 'Learn Plakoto', 4],
    ['fevga', 'Fevga', 'Learn Fevga', 4],
    ['asodio', 'Asodio', 'Learn Asodio', 4],
  ] as const;

  it.each(GAMES)('Settings → Help opens the %s lessons', async (game, label, title, count) => {
    const user = setupUser();
    await act(async () => consentStore.setState({ status: 'granted' }));
    recorded.sent.length = 0;
    const router = await renderRouter('./src/app', { initialUrl: '/settings' });

    await user.press(screen.getByRole('button', { name: 'Learn to play ›' }));
    const picker = within(screen.getByTestId('tutorial-picker'));
    expect(picker.getByRole('header', { name: 'Learn to play' })).toBeOnTheScreen();
    expect(picker.getAllByRole('button').map((b) => b.props.accessibilityLabel)).toEqual([
      'Portes',
      'Plakoto',
      'Fevga',
      'Asodio',
      'Cancel',
    ]);
    await user.press(picker.getByRole('button', { name: label }));

    expect(router.getPathname()).toBe('/tutorial');
    expect(router.getSearchParams()).toEqual(
      game === 'portes' ? { from: 'settings' } : { from: 'settings', game },
    );
    expect(screen.getByRole('header', { name: title })).toBeOnTheScreen();
    expect(screen.getByText(`Lesson 1 of ${count}`)).toBeOnTheScreen();
    expect(recorded.sent.filter((e) => e.type === 'track')).toEqual([
      { type: 'track', event: 'tutorial_started', props: { source: 'settings', game } },
    ]);

    // Skip goes back to Settings and saves only that game.
    await user.press(screen.getByRole('button', { name: 'Skip' }));
    expect(router.getPathname()).toBe('/settings');
    expect(storage.getString(tutorialStorageKey(game))).toContain('dismissed');
    for (const [other] of GAMES) {
      if (other !== game) expect(storage.getString(tutorialStorageKey(other))).toBeUndefined();
    }
  });

  it('Cancel closes the picker and stays in Settings', async () => {
    const user = setupUser();
    const router = await renderRouter('./src/app', { initialUrl: '/settings' });
    await user.press(screen.getByRole('button', { name: 'Learn to play ›' }));
    await user.press(
      within(screen.getByTestId('tutorial-picker')).getByRole('button', { name: 'Cancel' }),
    );
    expect(screen.queryByTestId('tutorial-picker')).not.toBeOnTheScreen();
    expect(router.getPathname()).toBe('/settings');
  });

  it('plays the Asodio lessons from Settings, saves them apart, then plays Asodio', async () => {
    const user = setupUser();
    const router = await renderRouter('./src/app', { initialUrl: '/settings' });
    await user.press(screen.getByRole('button', { name: 'Learn to play ›' }));
    await user.press(
      within(screen.getByTestId('tutorial-picker')).getByRole('button', { name: 'Asodio' }),
    );
    await layoutTutorialBoard();

    for (const [i] of LESSON_SETS.asodio.entries()) {
      await playLessonByTaps(i, 'asodio');
      await user.press(screen.getByRole('button', { name: 'Next' }));
    }
    expect(screen.getByRole('header', { name: 'You know Asodio!' })).toBeOnTheScreen();
    // Saved for Asodio only.
    expect(tutorialStore.getState().variants).toEqual({
      plakoto: 'new',
      fevga: 'new',
      asodio: 'done',
    });
    expect(tutorialStore.getState().status).toBe('new');
    expect(storage.getString('tutorial.asodio')).toContain('done');

    await user.press(screen.getByRole('button', { name: 'Play Asodio' }));
    expect(router.getPathname()).toBe('/new-game');
    expect(router.getSearchParams()).toEqual({ mode: 'bot', first: 'asodio' });
    expect(screen.getByRole('radio', { name: /^Asodio/ })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Easy' })).toBeChecked();
  });

  it('opens the Asodio lessons from its rules page', async () => {
    const user = setupUser();
    const router = await renderRouter('./src/app', { initialUrl: '/rules/asodio' });
    await user.press(screen.getByRole('button', { name: 'Learn to play on the board' }));
    expect(router.getPathname()).toBe('/tutorial');
    expect(router.getSearchParams()).toEqual({ from: 'rules', game: 'asodio' });
    expect(screen.getByRole('header', { name: 'Learn Asodio' })).toBeOnTheScreen();
  });
});

describe('online games (#255)', () => {
  afterEach(() => stopAnyDevGame());

  it('shows "could not be opened" for an unknown online game', async () => {
    await renderRouter('./src/app', { initialUrl: '/game/game-nope' });
    expect(await screen.findByText('This game could not be opened.')).toBeOnTheScreen();
  });

  it('stops the dev game (bot and turn timers) when its board closes', async () => {
    const user = setupUser();
    const router = await renderRouter('./src/app', { initialUrl: '/dev/online' });
    await user.press(screen.getByRole('button', { name: 'Start game' }));
    const gameId = router.getPathname().split('/').at(-1)!;
    expect(devGameRunning()).toBe(true);
    expect(
      await screen.findByTestId('game-board', { includeHiddenElements: true }),
    ).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Game menu' }));
    await user.press(screen.getByTestId('menu-exit'));
    expect(router.getPathname()).toBe('/');
    // The game is not over, but nobody plays it now.
    expect(onlineServer().getGame(gameId)?.status).toBe('active');
    expect(devGameRunning()).toBe(false);
  });

  it('starts a dev game vs the bot, resigns it and opens match end', async () => {
    const user = setupUser();
    const router = await renderRouter('./src/app', { initialUrl: '/dev/online' });
    await user.press(screen.getByRole('radio', { name: '1' }));
    await user.press(screen.getByRole('button', { name: 'Start game' }));
    const board = router.getPathname();
    expect(board).toMatch(/^\/game\/game-\d+$/);
    const gameId = board.split('/').at(-1)!;
    expect(onlineServer().getGame(gameId)).toMatchObject({ choice: 'portes', pace: 'live' });
    expect(
      await screen.findByTestId('game-board', { includeHiddenElements: true }),
    ).toBeOnTheScreen();
    // Online games stay out of the save slot.
    expect(storage.getString(SAVED_MATCH_KEY)).toBeUndefined();
    expect(matchSessions.current()).toBeNull();

    await user.press(screen.getByRole('button', { name: 'Game menu' }));
    await user.press(screen.getByRole('button', { name: /^Resign match/ }));
    await user.press(screen.getByRole('button', { name: 'Resign' }));
    await act(async () => {
      jest.advanceTimersByTime(MATCH_END_DELAY_MS);
    });
    expect(router.getPathname()).toBe(`${board}/match-end`);
    expect(
      await screen.findByRole('header', { name: 'Opponent wins the match!' }),
    ).toBeOnTheScreen();
    expect(screen.getByText('You resigned the match.')).toBeOnTheScreen();
    // No rematch online, and no History record.
    expect(screen.queryByRole('button', { name: /^Rematch/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Change settings' })).toBeNull();
    expect(historyStore.getState().records).toEqual([]);
    await user.press(screen.getByRole('button', { name: 'Home' }));
    expect(router.getPathname()).toBe('/');
  });
});

describe('invites (#256)', () => {
  afterEach(() => stopAnyDevGame());

  /** Dev online → "Make an invite" → "Open the invite". Returns the code. */
  async function openDevInvite(user: ReturnType<typeof setupUser>) {
    await user.press(screen.getByRole('button', { name: 'Make an invite' }));
    const code = /Code: (\w+)/.exec(
      String(screen.getByTestId('dev-online-invite-code').props.children),
    )?.[1];
    expect(code).toMatch(/^[0-9A-Z]{8}$/);
    expect(screen.getByText(`tavlaki://invite/${code}`)).toBeOnTheScreen();
    expect(screen.getByText(`https://tavlaki.com/i/${code}`)).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Open the invite' }));
    return code!;
  }

  it('the dev bot makes an invite; Accept opens the online game', async () => {
    const user = setupUser();
    const router = await renderRouter('./src/app', { initialUrl: '/dev/online' });
    await user.press(screen.getByRole('radio', { name: '1' }));
    const code = await openDevInvite(user);
    expect(router.getPathname()).toBe(`/invite/${code}`);
    expect(await screen.findByRole('header', { name: 'Game invite' })).toBeOnTheScreen();
    expect(screen.getByText('First to 1 point')).toBeOnTheScreen();

    await user.press(screen.getByRole('button', { name: 'Accept' }));
    const board = router.getPathname();
    expect(board).toMatch(/^\/game\/game-\d+$/);
    const gameId = board.split('/').at(-1)!;
    // The bot made the invite, so it plays White.
    expect(onlineServer().getGame(gameId)).toMatchObject({
      choice: 'portes',
      players: { white: 'bot', black: 'me' },
    });
    expect(onlineServer().getInvite(code)).toMatchObject({ status: 'accepted', gameId });
    expect(
      await screen.findByTestId('game-board', { includeHiddenElements: true }),
    ).toBeOnTheScreen();
    // Accept replaced the invite: Back does not return to it.
    await act(async () => appRouter.back());
    expect(router.getPathname()).toBe('/dev/online');
  });

  it('Decline closes the invite and goes Home', async () => {
    const user = setupUser();
    const router = await renderRouter('./src/app', { initialUrl: '/dev/online' });
    const code = await openDevInvite(user);
    expect(devGameRunning()).toBe(true);
    await user.press(await screen.findByRole('button', { name: 'Decline' }));
    expect(router.getPathname()).toBe('/');
    expect(onlineServer().getInvite(code)?.status).toBe('declined');
    // The dev invite sees the answer on its next tick, and stops.
    await act(async () => {
      jest.advanceTimersByTime(DEV_TICK_MS);
    });
    expect(devGameRunning()).toBe(false);
  });

  it('opens an invite link straight away, in any case', async () => {
    const code = onlineServer().createInvite('friend', 'plakoto', 3, 'async');
    const router = await renderRouter('./src/app', {
      initialUrl: `/invite/${code.toLowerCase()}`,
    });
    expect(await screen.findByRole('header', { name: 'Game invite' })).toBeOnTheScreen();
    expect(screen.getByText('Plakoto')).toBeOnTheScreen();
    expect(screen.getByText('Async · 24 hours per turn')).toBeOnTheScreen();
    expect(router.getPathname()).toBe(`/invite/${code.toLowerCase()}`);
  });

  it('an unknown invite shows "not found", and Home goes Home', async () => {
    const user = setupUser();
    const router = await renderRouter('./src/app', { initialUrl: '/invite/ABCD2345' });
    expect(await screen.findByRole('header', { name: 'Invite not found' })).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Home' }));
    expect(router.getPathname()).toBe('/');
  });
});

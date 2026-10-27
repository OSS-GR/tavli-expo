/**
 * Large system fonts (#134): Home, New game, the game screen and its cards
 * (#153), the game menu and resign dialog, the end screens, History (#142)
 * and the tutorial's mother card (#149) follow the font size with no cut
 * text. Cards and sheets scroll when they get taller than the screen. Jest
 * cannot measure text, so `textScalingProblems` checks the layout rules
 * that keep text whole (see `test/textScaling.ts`), in English and in Greek.
 */
import {
  createBoard,
  createGameFlow,
  createMatch,
  createSeededRng,
  plakoto,
  portes,
  recordGameResult,
  resolveRules,
  type BoardState,
  type Match,
} from '@tavli/engine';
import { act, fireEvent, screen, userEvent, waitFor } from '@testing-library/react-native';

import { HistoryScreen } from '@/features/history/HistoryScreen';
import type { HistoryRecord } from '@/features/history/records';
import { ContinueCard } from '@/features/home/ContinueCard';
import { HomeScreen } from '@/features/home/HomeScreen';
import { LearnCard } from '@/features/home/LearnCard';
import { createGameStore, type GameStore } from '@/features/game/gameStore';
import { GameScreen } from '@/features/game/GameScreen';
import { MatchEndScreen } from '@/features/match/MatchEndScreen';
import { MatchScreen } from '@/features/match/MatchScreen';
import { createSessionRegistry } from '@/features/match/sessions';
import { defaultSetup } from '@/features/match/setup';
import { NewGameScreen } from '@/features/new-game/NewGameScreen';
import { DEFAULT_SETTINGS } from '@/features/settings/settings';
import { settingsStore } from '@/features/settings/store';
import { TutorialScreen } from '@/features/tutorial/TutorialScreen';
import i18n from '@/i18n';

import { renderWithRoot } from '../../../test/render';
import { textScalingProblems } from '../../../test/textScaling';
import { layoutTutorialBoard, playLessonByTaps } from '../../../test/tutorialTaps';
import type { JsonNode } from '../../../test/tree';

const problems = () => textScalingProblems(screen.toJSON() as JsonNode | JsonNode[] | null);

const LANGUAGES = ['en', 'el'] as const;

beforeEach(async () => {
  await act(async () => {
    settingsStore.setState({ ...DEFAULT_SETTINGS, moveList: 'on' });
  });
});

afterAll(async () => {
  await i18n.changeLanguage('en');
});

describe.each(LANGUAGES)('large system fonts (%s)', (language) => {
  beforeEach(async () => {
    await act(async () => {
      await i18n.changeLanguage(language);
    });
  });

  it('Tutorial: the Plakoto mother card (#149)', async () => {
    await renderWithRoot(
      <TutorialScreen
        game="plakoto"
        onLessonDone={jest.fn()}
        onFinished={jest.fn()}
        onSkip={jest.fn()}
        onPlay={jest.fn()}
        onHome={jest.fn()}
      />,
    );
    await layoutTutorialBoard();
    for (let i = 0; i < 3; i++) {
      if (i > 0) {
        await act(async () => {
          fireEvent.press(screen.getByTestId('tutorial-next'));
        });
      }
      await playLessonByTaps(i, 'plakoto');
    }
    expect(screen.getByTestId('tutorial-mother-card')).toBeOnTheScreen();
    expect(problems()).toEqual([]);
  });

  it('Home: no text in a fixed-height box, none cut to a line count', async () => {
    await renderWithRoot(
      <HomeScreen
        onNewGame={jest.fn()}
        onSettings={jest.fn()}
        onHowToPlay={jest.fn()}
        onHistory={jest.fn()}
        botLevels={['easy', 'medium']}
        continueCard={
          <ContinueCard
            summary={{ game: 'Portes · vs Bot (Easy)', status: 'You 1 – 0 Bot · first to 3' }}
            onPress={jest.fn()}
          />
        }
        learnCard={<LearnCard onStart={jest.fn()} onDismiss={jest.fn()} />}
      />,
    );
    expect(problems()).toEqual([]);
  });

  it.each(['bot', 'local'] as const)('New game (%s)', async (mode) => {
    await renderWithRoot(
      <NewGameScreen
        mode={mode}
        initial={defaultSetup(mode)}
        botLevels={{ portes: ['easy'], plakoto: [], fevga: [], tavli: [], asodio: [] }}
        onBack={jest.fn()}
        onStart={jest.fn()}
      />,
    );
    expect(problems()).toEqual([]);
  });

  async function showGame(store: GameStore) {
    await renderWithRoot(<GameScreen store={store} onOpenMenu={jest.fn()} onHome={jest.fn()} />);
    await act(async () => {
      fireEvent(screen.getByTestId('game-board', { includeHiddenElements: true }), 'layout', {
        nativeEvent: { layout: { x: 0, y: 0, width: 375, height: 520 } },
      });
    });
  }

  it('the game screen: opening, a turn with the move list, the game-end sheet', async () => {
    const store = createGameStore({
      players: { white: 'Maria Papadopoulou', black: 'Bob' },
      rng: createSeededRng(1),
    });
    await showGame(store);
    // The opening card.
    expect(screen.getByTestId('opening-card')).toBeOnTheScreen();
    expect(problems()).toEqual([]);

    // A turn: strips, move list, Undo · dice · Confirm.
    await act(async () => {
      store.getState().dispatch({ type: 'rollOpening', player: 'white', die: 5 });
      store.getState().dispatch({ type: 'rollOpening', player: 'black', die: 3 });
    });
    await waitFor(() => expect(screen.getByTestId('move-list')).toBeOnTheScreen(), {
      timeout: 3000,
    });
    expect(problems()).toEqual([]);

    // The game-end sheet.
    await act(async () => {
      store.getState().dispatch({ type: 'resign', player: 'black' });
    });
    expect(screen.getByTestId('game-end-card')).toBeOnTheScreen();
    expect(problems()).toEqual([]);
  });

  /** A store whose game starts from `board`, White to roll. */
  function storeAt(board: BoardState, game: 'portes' | 'plakoto'): GameStore {
    const rules = resolveRules(game, { match: { rotation: [game] } });
    const store = createGameStore({
      players: { white: 'Maria Papadopoulou', black: 'Bob' },
      rules,
      rng: createSeededRng(1),
    });
    const options = { startingPlayer: 'white' as const, rules };
    const initial =
      game === 'portes' ? portes.initialState(options) : plakoto.initialState(options);
    store.setState({
      flow: {
        ...store.getState().flow,
        game: createGameFlow({ state: { ...initial, board }, starter: 'white' }),
      },
    });
    return store;
  }

  it('the game screen cards: no legal moves, the mother question (#153)', async () => {
    // Maria is on the bar and Bob holds all six entry points.
    const closed = createBoard(
      {
        white: { points: { 6: 14 }, bar: 1 },
        black: { points: { 1: 2, 2: 2, 3: 2, 4: 2, 5: 2, 6: 2, 13: 3 } },
      },
      'contrary',
    );
    const passing = storeAt(closed, 'portes');
    passing.getState().dispatch({ type: 'roll', player: 'white', dice: [6, 6] });
    await showGame(passing);
    expect(screen.getByTestId('pass-card')).toBeOnTheScreen();
    expect(problems()).toEqual([]);

    // Maria pins Bob's mother (his last checker, on his own 24).
    const pinning = storeAt(
      createBoard(
        {
          white: { points: { 24: 10, 14: 2, 8: 2, 2: 1 } },
          black: { points: { 24: 1, 20: 4, 16: 5, 12: 5 } },
        },
        'contrary',
      ),
      'plakoto',
    );
    const { dispatch } = pinning.getState();
    dispatch({ type: 'roll', player: 'white', dice: [1, 6] });
    dispatch({ type: 'move', player: 'white', move: { from: 2, to: 1, die: 1 } });
    dispatch({ type: 'move', player: 'white', move: { from: 24, to: 18, die: 6 } });
    dispatch({ type: 'confirm', player: 'white' });
    await showGame(pinning);
    expect(screen.getByTestId('mother-card')).toBeOnTheScreen();
    expect(problems()).toEqual([]);
  });

  it('the game menu and the resign dialog', async () => {
    const user = userEvent.setup();
    const session = createSessionRegistry({ createRng: () => createSeededRng(1) }).start(
      defaultSetup('local'),
    );
    // Past the opening roll, so the player to move can resign.
    const state = portes.initialState({ startingPlayer: 'white' });
    session.store.setState({
      flow: { ...session.store.getState().flow, game: createGameFlow({ state, starter: 'white' }) },
    });
    await renderWithRoot(
      <MatchScreen
        session={session}
        onExit={jest.fn()}
        onSettings={jest.fn()}
        onRules={jest.fn()}
        onMatchOver={jest.fn()}
      />,
    );
    await user.press(screen.getByTestId('menu-button'));
    expect(screen.getByTestId('game-menu')).toBeOnTheScreen();
    expect(problems()).toEqual([]);
    await user.press(screen.getByTestId('menu-resign-match'));
    expect(screen.getByTestId('resign-match-dialog')).toBeOnTheScreen();
    expect(problems()).toEqual([]);
  });

  it('match end', async () => {
    let match: Match = createMatch({ targetPoints: 1, players: { white: 'a', black: 'b' } });
    match = recordGameResult(
      match,
      { winner: 'white', points: 2, reason: 'borneOff' },
      { starter: 'white' },
    );
    await renderWithRoot(
      <MatchEndScreen
        setup={defaultSetup('bot')}
        match={match}
        onRematch={jest.fn()}
        onChangeSettings={jest.fn()}
        onHome={jest.fn()}
      />,
    );
    expect(problems()).toEqual([]);
  });

  it('history: stats and rows, and the empty state (#142)', async () => {
    const record: HistoryRecord = {
      id: 'r',
      endedAt: Date.UTC(2026, 9, 27),
      mode: 'local',
      game: 'tavli',
      botLevel: null,
      names: { white: 'Μαρία', black: 'Νίκος' },
      targetPoints: 5,
      score: { white: 5, black: 3 },
      end: 'finished',
      winner: 'white',
      resignedBy: null,
      games: 6,
      diploWins: { white: 1, black: 1 },
      draws: 1,
    };
    const bot: HistoryRecord = { ...record, id: 'b', mode: 'bot', botLevel: 'medium' };
    await renderWithRoot(<HistoryScreen records={[record, bot]} onPlay={jest.fn()} />);
    expect(problems()).toEqual([]);
    await renderWithRoot(<HistoryScreen records={[]} onPlay={jest.fn()} />);
    expect(problems()).toEqual([]);
  });
});

describe('textScalingProblems', () => {
  it('finds cut text, fixed heights and text that does not scale', async () => {
    const { Text, View } = jest.requireActual<typeof import('react-native')>('react-native');
    await renderWithRoot(
      <View>
        <Text numberOfLines={1}>cut</Text>
        <View style={{ height: 40 }}>
          <Text>boxed</Text>
        </View>
        <Text allowFontScaling={false}>small</Text>
        {/* A decorative glyph may keep its size. */}
        <View style={{ height: 40 }}>
          <Text allowFontScaling={false} importantForAccessibility="no">
            ⚙
          </Text>
        </View>
        <View style={{ minHeight: 40 }}>
          <Text>fine</Text>
        </View>
      </View>,
    );
    expect(problems()).toEqual([
      '"cut" has numberOfLines',
      '"boxed" sits in a box with height 40',
      '"small" does not scale',
    ]);
  });
});

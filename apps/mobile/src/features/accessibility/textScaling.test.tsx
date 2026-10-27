/**
 * Large system fonts (#134): Home, New game, the game screen and its cards
 * (#153; choose a double, #205; the opening roll house rule cards, #207),
 * the game menu and resign dialog, the end screens, the game review
 * (#215), History (#142), the tutorial's mother card (#149) and the
 * Settings game picker (#159)
 * follow the font size with no cut text. The game screen, its cards and
 * menu, and the tutorial also in a landscape window (#185). Cards and sheets scroll when they
 * get taller than the screen. Jest
 * cannot measure text, so `textScalingProblems` checks the layout rules
 * that keep text whole (see `test/textScaling.ts`), in English and in Greek.
 */
import {
  asodio,
  createBoard,
  createGameFlow,
  createMatch,
  createSeededRng,
  legalNextMoves,
  plakoto,
  portes,
  recordGameResult,
  resolveRules,
  type BoardState,
  type Match,
} from '@tavli/engine';
import { act, fireEvent, screen, within } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { HistoryScreen } from '@/features/history/HistoryScreen';
import type { HistoryRecord } from '@/features/history/records';
import { ContinueCard } from '@/features/home/ContinueCard';
import { HomeScreen } from '@/features/home/HomeScreen';
import { LearnCard } from '@/features/home/LearnCard';
import { createGameStore, type GameStore } from '@/features/game/gameStore';
import { GameScreen, OPENING_RESULT_MS } from '@/features/game/GameScreen';
import { MatchEndScreen } from '@/features/match/MatchEndScreen';
import { MatchScreen } from '@/features/match/MatchScreen';
import { createSessionRegistry } from '@/features/match/sessions';
import { defaultSetup } from '@/features/match/setup';
import { NewGameScreen } from '@/features/new-game/NewGameScreen';
import { ReviewScreen } from '@/features/review/ReviewScreen';
import {
  BOARD_LAYOUT_MODES,
  DEFAULT_SETTINGS,
  type BoardLayoutMode,
} from '@/features/settings/settings';
import { SettingsScreen } from '@/features/settings/SettingsScreen';
import { settingsStore } from '@/features/settings/store';
import { TutorialScreen } from '@/features/tutorial/TutorialScreen';
import i18n from '@/i18n';

import { runOnFakeTimers, setupUser } from '../../../test/clock';
import { renderWithRoot } from '../../../test/render';
import { allBest, oneBadTurn } from '../../../test/reviewGame';
import { textScalingProblems } from '../../../test/textScaling';
import { layoutTutorialBoard, playLessonByTaps } from '../../../test/tutorialTaps';
import type { JsonNode } from '../../../test/tree';
import { LANDSCAPE_SE, resetWindow, setWindow } from '../../../test/window';

const problems = () => textScalingProblems(screen.toJSON() as JsonNode | JsonNode[] | null);

const LANGUAGES = ['en', 'el'] as const;

// The game screen closes the opening result on a timer (see test/clock.ts).
runOnFakeTimers();

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

  /** The tutorial up to the Plakoto mother card. */
  async function tutorialMotherCard() {
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
  }

  it('Tutorial: the Plakoto mother card (#149)', tutorialMotherCard);

  it('Settings: the "Learn to play" game picker (#159)', async () => {
    await renderWithRoot(<SettingsScreen onLearnToPlay={jest.fn()} />);
    await act(async () => {
      fireEvent.press(screen.getByTestId('settings-learn-to-play'));
    });
    expect(screen.getByTestId('tutorial-picker')).toBeOnTheScreen();
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

  /** The game screen in the tall or the classic layout (#184). */
  async function pickLayout(boardLayout: BoardLayoutMode) {
    await act(async () => {
      settingsStore.getState().setSetting('boardLayout', boardLayout);
    });
  }

  async function showGame(store: GameStore) {
    await renderWithRoot(
      <GameScreen store={store} onOpenMenu={jest.fn()} onHome={jest.fn()} onReview={jest.fn()} />,
    );
    await act(async () => {
      fireEvent(screen.getByTestId('game-board', { includeHiddenElements: true }), 'layout', {
        nativeEvent: { layout: { x: 0, y: 0, width: 375, height: 520 } },
      });
    });
  }

  /** The game screen: opening, a turn with the move list, the game-end sheet. */
  async function gameScreenFlow() {
    const store = createGameStore({
      players: { white: 'Maria Papadopoulou', black: 'Bob' },
      rng: createSeededRng(1),
    });
    await showGame(store);
    // The opening card, with its Roll button (#176).
    expect(screen.getByTestId('opening-card')).toBeOnTheScreen();
    expect(screen.getByTestId('roll-button')).toBeOnTheScreen();
    expect(problems()).toEqual([]);

    // One die rolled ("Maria Papadopoulou rolled 5."), then a tie that stays (#176).
    await act(async () => {
      store.getState().dispatch({ type: 'rollOpening', player: 'white', die: 5 });
    });
    expect(screen.getByTestId('opening-message')).toHaveTextContent(/5/);
    expect(problems()).toEqual([]);
    await act(async () => {
      store.getState().dispatch({ type: 'rollOpening', player: 'black', die: 5 });
    });
    expect(store.getState().flow.game.opening?.ties).toEqual([5]);
    expect(screen.getByTestId('opening-card')).toBeOnTheScreen();
    expect(problems()).toEqual([]);

    // The opening result, then a turn: strips, move list, Undo · dice · Confirm.
    await act(async () => {
      store.getState().dispatch({ type: 'rollOpening', player: 'white', die: 5 });
      store.getState().dispatch({ type: 'rollOpening', player: 'black', die: 3 });
    });
    expect(screen.getByTestId('opening-card')).toBeOnTheScreen();
    expect(screen.getByTestId('opening-ok-button')).toBeOnTheScreen();
    expect(problems()).toEqual([]);
    await act(async () => {
      jest.advanceTimersByTime(OPENING_RESULT_MS);
    });
    expect(screen.getByTestId('move-list')).toBeOnTheScreen();
    expect(problems()).toEqual([]);

    // The game-end sheet.
    await act(async () => {
      store.getState().dispatch({ type: 'resign', player: 'black' });
    });
    expect(screen.getByTestId('game-end-card')).toBeOnTheScreen();
    expect(problems()).toEqual([]);
  }

  it.each(BOARD_LAYOUT_MODES)(
    'the game screen (%s layout): opening, a turn with the move list, the game-end sheet',
    async (layout) => {
      await pickLayout(layout);
      await gameScreenFlow();
    },
  );

  /** A store whose game starts from `board`, White to roll. */
  function storeAt(board: BoardState, game: 'portes' | 'plakoto' | 'aceyDeucey'): GameStore {
    const rules =
      game === 'aceyDeucey'
        ? resolveRules('asodio.aceyDeuceyGreek')
        : resolveRules(game, { match: { rotation: [game] } });
    const store = createGameStore({
      players: { white: 'Maria Papadopoulou', black: 'Bob' },
      rules,
      rng: createSeededRng(1),
    });
    const options = { startingPlayer: 'white' as const, rules };
    const initial =
      game === 'portes'
        ? portes.initialState(options)
        : game === 'plakoto'
          ? plakoto.initialState(options)
          : asodio.initialState(options);
    store.setState({
      flow: {
        ...store.getState().flow,
        game: createGameFlow({ state: { ...initial, board }, starter: 'white' }),
      },
    });
    return store;
  }

  /** The game screen cards: no legal moves, the mother question, choose a double. */
  async function gameScreenCards() {
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

    // The opening roll house rules (#207): the starter card, then the
    // "rolls again" result.
    const withOpening = (openingRoll: 'rerollBoth' | 'chosenStarterRolls') =>
      createGameStore({
        players: { white: 'Maria Papadopoulou', black: 'Bob' },
        rules: resolveRules('portes', { match: { rotation: ['portes'], openingRoll } }),
        rng: createSeededRng(1),
      });
    await showGame(withOpening('chosenStarterRolls'));
    expect(screen.getByTestId('starter-card')).toBeOnTheScreen();
    expect(problems()).toEqual([]);
    const rerolling = withOpening('rerollBoth');
    rerolling.getState().dispatch({ type: 'rollOpening', player: 'white', die: 5 });
    rerolling.getState().dispatch({ type: 'rollOpening', player: 'black', die: 3 });
    await showGame(rerolling);
    expect(screen.getByTestId('opening-ok-button')).toBeOnTheScreen();
    expect(problems()).toEqual([]);

    // Acey-Deucey (#205): Maria plays a 1-2 and chooses a double. Bob holds
    // her own 18 to 15, so a chosen 6-6 then passes ("Maria chose 6-6").
    const choosing = storeAt(
      createBoard(
        {
          white: { points: { 24: 15 } },
          black: { points: { 7: 2, 8: 2, 9: 2, 10: 2, 12: 7 } },
        },
        'contrary',
      ),
      'aceyDeucey',
    );
    choosing.getState().dispatch({ type: 'roll', player: 'white', dice: [1, 2] });
    for (const to of [23, 22]) {
      const move = legalNextMoves(choosing.getState().flow.game)
        .flatMap((source) => source.moves)
        .find((m) => m.from === 24 && m.to === to);
      choosing.getState().dispatch({ type: 'move', player: 'white', move: move! });
    }
    choosing.getState().dispatch({ type: 'confirm', player: 'white' });
    await showGame(choosing);
    expect(screen.getByTestId('choose-double-card')).toBeOnTheScreen();
    expect(problems()).toEqual([]);
    await act(async () => {
      fireEvent.press(screen.getByTestId('choose-double-6'));
    });
    expect(screen.getByTestId('pass-card')).toBeOnTheScreen();
    expect(problems()).toEqual([]);
  }

  it.each(BOARD_LAYOUT_MODES)(
    'the game screen cards (%s layout): no legal moves, the mother question, choose a double (#153, #205)',
    async (layout) => {
      await pickLayout(layout);
      await gameScreenCards();
    },
  );

  /** The game menu, then the resign dialog. */
  async function gameMenu() {
    const user = setupUser();
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
  }

  it.each(BOARD_LAYOUT_MODES)('the game menu and the resign dialog (%s layout)', async (layout) => {
    await pickLayout(layout);
    await gameMenu();
  });

  // The phone on its side, with a large font (#185): the side columns and
  // every card and sheet scroll instead of cutting text.
  describe('in a landscape window (#185)', () => {
    beforeEach(async () => {
      await setWindow({ ...LANDSCAPE_SE, fontScale: 2 });
    });
    afterEach(async () => {
      await resetWindow();
    });

    it('the game screen: opening, a turn with the move list, the game-end sheet', async () => {
      await gameScreenFlow();
      expect(screen.getByTestId('game-left', { includeHiddenElements: true })).toBeTruthy();
    });
    it(
      'the game screen cards: no legal moves, the mother question, choose a double',
      gameScreenCards,
    );
    it('the game menu and the resign dialog', gameMenu);
    it('the tutorial: the Plakoto mother card', async () => {
      await tutorialMotherCard();
      // The lesson column scrolls as a whole, and Next sits under the dice
      // as wide as the column, so a long label or a large font has room.
      const side = screen.getByTestId('tutorial-side');
      expect(side.type).toBe('RCTScrollView');
      const controls = within(side).getByTestId('tutorial-controls');
      expect(StyleSheet.flatten(controls.props.style)).toMatchObject({
        flexDirection: 'column',
        alignItems: 'stretch',
      });
      expect(within(controls).getByTestId('tutorial-next')).toBeOnTheScreen();
      expect(StyleSheet.flatten(screen.getByTestId('tutorial-next').props.style).flex).toBe(
        undefined,
      );
      expect(problems()).toEqual([]);
    });
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
        onReview={jest.fn()}
        onChangeSettings={jest.fn()}
        onHome={jest.fn()}
      />,
    );
    expect(problems()).toEqual([]);
  });

  it('the game review: busy, three mistakes, and "Well played" (#215)', async () => {
    const local = {
      ...defaultSetup('local'),
      names: { white: 'Maria Papadopoulou', black: 'Bob' },
    };
    await renderWithRoot(<ReviewScreen setup={local} flow={oneBadTurn()} />);
    expect(screen.getByTestId('review-busy')).toBeOnTheScreen();
    expect(problems()).toEqual([]);
    await screen.findByTestId('review-mistake-3');
    expect(problems()).toEqual([]);
    await renderWithRoot(<ReviewScreen setup={defaultSetup('bot')} flow={allBest()} />);
    await screen.findByTestId('review-status');
    expect(problems()).toEqual([]);
  });

  it('history: stats and rows, a house rule, and the empty state (#142, #221)', async () => {
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
      timedOutBy: null,
      games: 6,
      diploWins: { white: 1, black: 1 },
      draws: 1,
      matchNumber: 1,
      openingRoll: 'useOpeningDice',
    };
    const bot: HistoryRecord = { ...record, id: 'b', mode: 'bot', botLevel: 'medium' };
    // A house rule adds to the score line (#221).
    const houseRule: HistoryRecord = { ...bot, id: 'h', openingRoll: 'chosenStarterRolls' };
    await renderWithRoot(<HistoryScreen records={[record, bot, houseRule]} onPlay={jest.fn()} />);
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

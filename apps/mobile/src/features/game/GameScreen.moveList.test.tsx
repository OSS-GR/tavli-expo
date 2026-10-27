/**
 * The move list (#134): a screen reader user plays a whole game through
 * buttons only (`getByRole('button', { name })`), never touching the board.
 * Also: when the list shows, and what the screen reads aloud.
 */
import type { BotRunner } from '@tavli/contracts';
import {
  VARIANT_REGISTRY,
  createBoard,
  createGameFlow,
  createSeededRng,
  getVariant,
  plakoto,
  resolveRules,
  type BoardState,
  type PerPlayer,
  type Turn,
} from '@tavli/engine';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';

import { moveChoices, moveLabel } from '@/features/accessibility/moveList';
import { DEFAULT_SETTINGS } from '@/features/settings/settings';
import { settingsStore } from '@/features/settings/store';
import i18n from '@/i18n';

import { createGameStore, turnView, type GameStore } from './gameStore';
import { GameScreen, type GameScreenProps } from './GameScreen';
import { openingStatus } from './opening';
import type { Seat } from './seats';
import { passNotice } from './turnNotices';

import { runOnFakeTimers } from '../../../test/clock';
import { renderWithRoot } from '../../../test/render';

const SIZE = { width: 375, height: 520 };

async function show(store: GameStore, props: Partial<GameScreenProps> = {}) {
  await renderWithRoot(<GameScreen store={store} {...props} />);
  await act(async () => {
    fireEvent(screen.getByTestId('game-board'), 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, ...SIZE } },
    });
  });
}

/** Presses the button a screen reader calls `name`. */
const pressButton = async (name: string | RegExp) => {
  await act(async () => {
    fireEvent.press(screen.getByRole('button', { name }));
  });
};

/** The first move of the list, by its spoken name. */
function firstMoveName(store: GameStore): string {
  const view = turnView(store.getState().flow);
  return moveLabel(i18n.t, moveChoices(view.legal)[0]!);
}

// The game screen closes its cards on timers (see test/clock.ts).
runOnFakeTimers();

beforeEach(async () => {
  jest.restoreAllMocks();
  await act(async () => {
    settingsStore.setState({ ...DEFAULT_SETTINGS, moveList: 'on' });
    await i18n.changeLanguage('en');
  });
});

/**
 * Plays the match in the store to its end with the buttons a screen reader
 * user has: Roll, the move list, Confirm, OK and the mother question.
 */
async function playWithButtons(store: GameStore) {
  let moves = 0;
  let questions = 0;
  for (let steps = 0; steps < 4000; steps++) {
    const { flow } = store.getState();
    const view = turnView(flow);
    if (view.matchPhase !== 'playing') break;
    const shows = (testID: string) => screen.queryByTestId(testID) !== null;
    if (view.phase === 'awaiting-answer') {
      questions++;
      await pressButton('Play on');
    } else if (passNotice(flow) && shows('pass-card')) await pressButton('OK');
    else if (view.phase === 'opening-roll') await pressButton(/: roll, or tap the board$/);
    else if (openingStatus(view.game) && shows('opening-card')) {
      // The result closes by itself (1.5 s); a screen reader user waits.
      await waitFor(() => expect(screen.queryByTestId('opening-card')).toBeNull(), {
        timeout: 3000,
      });
    } else if (view.phase === 'awaiting-roll') await pressButton('Roll dice, or tap the board');
    else if (view.phase === 'awaiting-confirm') await pressButton('Confirm');
    else {
      expect(screen.getByTestId('move-list')).toBeOnTheScreen();
      await pressButton(firstMoveName(store));
      moves++;
      expect(store.getState().flow.log.length).toBeGreaterThan(flow.log.length);
    }
  }
  return { moves, questions };
}

describe('<GameScreen /> move list', () => {
  it('plays a whole pass-and-play Portes game with the move list only', async () => {
    const store = createGameStore({
      players: { white: 'Ann', black: 'Bob' },
      targetPoints: 1,
      rng: createSeededRng(2026),
    });
    const onMatchOver = jest.fn();
    await show(store, { onMatchOver });
    const { moves } = await playWithButtons(store);
    const { flow } = store.getState();
    expect(flow.match.status).toBe('finished');
    expect(flow.game.result?.reason).toBe('borneOff');
    expect(moves).toBeGreaterThan(30);
    // Hits went to the bar and came back in through "From the bar to …".
    expect(flow.log.some((e) => e.type === 'move' && e.move.from === 'bar')).toBe(true);
    await waitFor(() => expect(onMatchOver).toHaveBeenCalled(), { timeout: 3000 });
  }, 60_000);

  it('shows the moves of the player to move, in their own point numbers', async () => {
    const store = createGameStore({
      players: { white: 'Ann', black: 'Bob' },
      rng: createSeededRng(1),
    });
    const { dispatch } = store.getState();
    dispatch({ type: 'rollOpening', player: 'white', die: 3 });
    dispatch({ type: 'rollOpening', player: 'black', die: 5 });
    await show(store);
    // Bob starts with 5-3 from his own start: 13 → 8 is his own point 13.
    await waitFor(() => expect(screen.getByTestId('move-list')).toBeOnTheScreen(), {
      timeout: 3000,
    });
    const list = within(screen.getByTestId('move-list'));
    expect(list.getByRole('header', { name: 'Moves' })).toBeOnTheScreen();
    expect(
      list.getByRole('button', { name: 'Checker from point 13 to point 8' }),
    ).toBeOnTheScreen();
    expect(list.getByText('13 → 8')).toBeOnTheScreen();
    await pressButton('Checker from point 13 to point 8');
    await pressButton('Checker from point 8 to point 5');
    expect(store.getState().flow.game.played).toHaveLength(2);
    // Undo and Confirm stay buttons.
    await pressButton('Undo');
    expect(store.getState().flow.game.played).toHaveLength(1);
    await pressButton('Checker from point 8 to point 5');
    await pressButton('Confirm');
    expect(store.getState().flow.game.state.toMove).toBe('white');
  });

  it('is hidden by default, and shows in auto when a screen reader is on', async () => {
    await act(async () => {
      settingsStore.setState({ ...DEFAULT_SETTINGS });
    });
    const store = createGameStore({
      players: { white: 'Ann', black: 'Bob' },
      rng: createSeededRng(1),
    });
    const { dispatch } = store.getState();
    dispatch({ type: 'rollOpening', player: 'white', die: 5 });
    dispatch({ type: 'rollOpening', player: 'black', die: 3 });
    const listeners: ((on: boolean) => void)[] = [];
    jest.spyOn(AccessibilityInfo, 'addEventListener').mockImplementation(((
      _event: string,
      listener: (on: boolean) => void,
    ) => {
      listeners.push(listener);
      return { remove: jest.fn() };
    }) as never);
    await show(store);
    await waitFor(() => expect(screen.queryByTestId('opening-card')).toBeNull(), { timeout: 3000 });
    expect(screen.queryByTestId('move-list')).toBeNull();
    // VoiceOver or TalkBack turns on: the list shows.
    await act(async () => {
      for (const listener of listeners) listener(true);
    });
    expect(screen.getByTestId('move-list')).toBeOnTheScreen();
    // Off in Settings wins over the screen reader.
    await act(async () => {
      settingsStore.getState().setSetting('moveList', 'off');
    });
    expect(screen.queryByTestId('move-list')).toBeNull();
  });

  it('starts shown when the screen reader is already on', async () => {
    await act(async () => {
      settingsStore.setState({ ...DEFAULT_SETTINGS });
    });
    jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockResolvedValue(true);
    const store = createGameStore({
      players: { white: 'Ann', black: 'Bob' },
      rng: createSeededRng(1),
    });
    const { dispatch } = store.getState();
    dispatch({ type: 'rollOpening', player: 'white', die: 5 });
    dispatch({ type: 'rollOpening', player: 'black', die: 3 });
    await show(store);
    await waitFor(() => expect(screen.getByTestId('move-list')).toBeOnTheScreen(), {
      timeout: 3000,
    });
  });
});

// The Plakoto mother question.

/**
 * White can pin Black's mother with a 1: Black's last checker on own 24
 * (= White 1), a White checker on White 2. Black has other checkers, so
 * the game goes on (offerConcede).
 */
const MOTHER_BOARD: BoardState = createBoard(
  {
    white: { points: { 24: 10, 14: 2, 8: 2, 2: 1 } },
    black: { points: { 24: 1, 20: 4, 16: 5, 12: 5 } },
  },
  'contrary',
);

function motherStore(): GameStore {
  const rules = resolveRules('plakoto', { match: { rotation: ['plakoto'] } });
  const store = createGameStore({
    players: { white: 'Ann', black: 'Bob' },
    targetPoints: 3,
    rules,
    rng: createSeededRng(4),
  });
  const state = {
    ...plakoto.initialState({ startingPlayer: 'white', rules }),
    board: MOTHER_BOARD,
  };
  store.setState({
    flow: { ...store.getState().flow, game: createGameFlow({ state, starter: 'white' }) },
  });
  // The roll is the setup: fixed dice, so the pin is there to make.
  store.getState().dispatch({ type: 'roll', player: 'white', dice: [1, 6] });
  return store;
}

describe('<GameScreen /> Plakoto mother question with the move list', () => {
  it('pins the mother, answers the question and plays on, with buttons only', async () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
    const store = motherStore();
    await show(store);
    await pressButton('Checker from point 2 to point 1, pins');
    await pressButton('Checker from point 24 to point 18');
    await pressButton('Confirm');
    expect(store.getState().flow.game.phase).toBe('awaiting-answer');
    // The card is read aloud, and the list is gone while it asks.
    expect(announce).toHaveBeenCalledWith(expect.stringMatching(/^Bob, your mother is pinned/));
    expect(screen.queryByTestId('move-list')).toBeNull();
    await pressButton('Play on');
    // Ann's turn is read to Bob once he has answered.
    expect(announce).toHaveBeenLastCalledWith(
      'Ann played: Checker from point 2 to point 1, pins; Checker from point 24 to point 18. The turn passes to Bob.',
    );
    await pressButton('Roll dice, or tap the board');
    expect(announce).toHaveBeenLastCalledWith(expect.stringMatching(/^Bob rolled \d-\d\.$/));
    await pressButton(firstMoveName(store));
    expect(store.getState().flow.game.played).toHaveLength(1);
  });
});

describe('<GameScreen /> announcements vs the bot', () => {
  const seats: PerPlayer<Seat> = {
    white: { name: 'You', label: 'You', turnLabel: 'Your turn', you: true },
    black: { name: 'Bot', label: 'Bot · Easy', turnLabel: 'Playing', you: false },
  };
  const runner: BotRunner = {
    chooseMove: async (req) =>
      getVariant(VARIANT_REGISTRY, req.state.variant).legalTurns(req.state, req.dice)[0] as Turn,
    cancel: () => {},
  };
  const bot = {
    player: 'black' as const,
    difficulty: 'easy' as const,
    runner,
    rng: createSeededRng(1),
    timing: { beforeRollMs: 0, moveMs: 0, thinkMs: () => 0 },
  };

  it('reads your roll, the bot’s roll and the bot’s moves; the list waits for your turn', async () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
    const store = createGameStore({
      players: { white: 'You', black: 'Bot' },
      rng: createSeededRng(5),
    });
    const { dispatch } = store.getState();
    dispatch({ type: 'rollOpening', player: 'white', die: 5 });
    dispatch({ type: 'rollOpening', player: 'black', die: 3 });
    await show(store, { seats, bot, openingTaps: 'one' });
    await waitFor(() => expect(screen.getByTestId('move-list')).toBeOnTheScreen(), {
      timeout: 3000,
    });
    expect(announce).toHaveBeenCalledWith('You start with 5-3.');
    await pressButton('Checker from point 13 to point 8');
    await pressButton('Checker from point 24 to point 21');
    announce.mockClear();
    await pressButton('Confirm');
    // The bot's turn: no list.
    expect(screen.queryByTestId('move-list')).toBeNull();
    await waitFor(() => expect(store.getState().flow.game.state.toMove).toBe('white'), {
      timeout: 3000,
    });
    const said = announce.mock.calls.map(([text]) => text);
    expect(said).toContainEqual(expect.stringMatching(/^Bot rolled \d-\d\.$/));
    expect(said).toContainEqual(expect.stringMatching(/^Bot played: .+\. Your turn\.$/));
    // Your own moves are never read back to you.
    expect(said.some((text) => text.startsWith('You played'))).toBe(false);
    await pressButton('Roll dice, or tap the board');
    expect(announce).toHaveBeenLastCalledWith(expect.stringMatching(/^You rolled \d-\d\.$/));
    expect(screen.getByTestId('move-list')).toBeOnTheScreen();
  });
});

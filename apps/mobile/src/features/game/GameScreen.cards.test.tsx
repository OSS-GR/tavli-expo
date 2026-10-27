/**
 * Screen readers and the cards over the board (#153): while a card shows,
 * screen readers skip the board under it; while the game-end sheet shows,
 * they skip the whole screen under it. Focus moves to the card's title.
 * Each card comes and goes with direct store actions and presses (no full
 * games), so these tests stay fast.
 */
import {
  asodio,
  createBoard,
  createGameFlow,
  createSeededRng,
  plakoto,
  portes,
  resolveRules,
  type BoardState,
} from '@tavli/engine';
import { act, fireEvent, screen } from '@testing-library/react-native';
import type { ComponentProps } from 'react';
import { AccessibilityInfo } from 'react-native';

import { SAMPLE_POSITIONS } from '@/features/board/positions';
import { DEFAULT_SETTINGS } from '@/features/settings/settings';
import { settingsStore } from '@/features/settings/store';

import { createGameStore, type GameStore } from './gameStore';
import { GameScreen, OPENING_RESULT_MS } from './GameScreen';

import { renderWithRoot } from '../../../test/render';

const SIZE = { width: 375, height: 520 };
const hidden = { includeHiddenElements: true };

const asodioRules = resolveRules('asodio.kafeneio', { match: { rotation: ['asodio'] } });
const plakotoRules = resolveRules('plakoto', { match: { rotation: ['plakoto'] } });

function newStore(rules?: ReturnType<typeof resolveRules>): GameStore {
  return createGameStore({
    players: { white: 'Ann', black: 'Bob' },
    targetPoints: 3,
    ...(rules ? { rules } : {}),
    rng: createSeededRng(5),
  });
}

/** The game starts from `board`, White to roll (no opening card). */
function startAt(store: GameStore, board: BoardState, variant: 'portes' | 'plakoto' | 'asodio') {
  const rules = store.getState().flow.game.state.rules;
  const options = { startingPlayer: 'white' as const, rules };
  const initial =
    variant === 'portes'
      ? portes.initialState({ startingPlayer: 'white' })
      : variant === 'plakoto'
        ? plakoto.initialState(options)
        : asodio.initialState(options);
  const state = { ...initial, board };
  store.setState({
    flow: { ...store.getState().flow, game: createGameFlow({ state, starter: 'white' }) },
  });
}

async function show(store: GameStore, props: Partial<ComponentProps<typeof GameScreen>> = {}) {
  await renderWithRoot(<GameScreen store={store} {...props} />);
  await act(async () => {
    fireEvent(screen.getByTestId('game-board', hidden), 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, ...SIZE } },
    });
  });
}

const press = async (testID: string) => {
  await act(async () => {
    fireEvent.press(screen.getByTestId(testID));
  });
};

/** A card covers the board: screen readers skip the board, not the rest. */
function expectBoardHidden() {
  expect(screen.queryByTestId('game-board')).toBeNull();
  const layer = screen.getByTestId('game-board-layer', hidden);
  expect(layer).toHaveProp('importantForAccessibility', 'no-hide-descendants');
  expect(layer).toHaveProp('accessibilityElementsHidden', true);
  expect(screen.getByTestId('strip-bottom')).toBeOnTheScreen();
  // The move list is gone while a card asks or explains.
  expect(screen.queryByTestId('move-list')).toBeNull();
}

function expectBoardShown() {
  expect(screen.getByTestId('game-board')).toBeOnTheScreen();
  expect(screen.getByTestId('game-board-layer')).toHaveProp('importantForAccessibility', 'auto');
}

let focus: jest.SpyInstance;

beforeEach(async () => {
  focus = jest.spyOn(AccessibilityInfo, 'sendAccessibilityEvent').mockImplementation(() => {});
  await act(async () => {
    settingsStore.setState({ ...DEFAULT_SETTINGS, moveList: 'on' });
  });
});

afterEach(() => {
  focus.mockRestore();
});

describe('<GameScreen /> cards hide the board from screen readers (#153)', () => {
  it('the opening card', async () => {
    jest.useFakeTimers();
    try {
      const store = newStore();
      await show(store);
      expect(screen.getByTestId('opening-card')).toBeOnTheScreen();
      expectBoardHidden();
      // Focus goes to the card; the Roll button below the board stays reachable.
      expect(focus).toHaveBeenCalledTimes(1);
      expect(focus).toHaveBeenCalledWith(expect.anything(), 'focus');
      expect(screen.getByTestId('roll-button')).toBeOnTheScreen();

      await act(async () => {
        store.getState().dispatch({ type: 'rollOpening', player: 'white', die: 5 });
        store.getState().dispatch({ type: 'rollOpening', player: 'black', die: 3 });
      });
      // The result shows a moment; the card does not take focus again.
      expectBoardHidden();
      expect(focus).toHaveBeenCalledTimes(1);
      await act(async () => {
        jest.advanceTimersByTime(OPENING_RESULT_MS + 10);
      });
      expect(screen.queryByTestId('opening-card')).toBeNull();
      expectBoardShown();
      expect(screen.getByTestId('move-list')).toBeOnTheScreen();
    } finally {
      jest.useRealTimers();
    }
  });

  it('the pass card (no legal moves)', async () => {
    const store = newStore();
    // Ann is on the bar and Bob holds all six entry points.
    const closed = createBoard(
      {
        white: { points: { 6: 14 }, bar: 1 },
        black: { points: { 1: 2, 2: 2, 3: 2, 4: 2, 5: 2, 6: 2, 13: 3 } },
      },
      'contrary',
    );
    startAt(store, closed, 'portes');
    await show(store);
    expectBoardShown();
    await act(async () => {
      store.getState().dispatch({ type: 'roll', player: 'white', dice: [6, 6] });
    });
    expect(screen.getByText('No legal moves')).toBeOnTheScreen();
    expectBoardHidden();
    expect(focus).toHaveBeenCalledWith(expect.anything(), 'focus');
    await press('pass-ok-button');
    expect(screen.queryByTestId('pass-card')).toBeNull();
    expectBoardShown();
  });

  it('the "Board locked" card (Asodio)', async () => {
    const store = newStore(asodioRules);
    await show(store);
    await act(async () => {
      store.getState().dispatch({ type: 'rollOpening', player: 'white', die: 5 });
      store.getState().dispatch({ type: 'rollOpening', player: 'black', die: 3 });
    });
    expect(screen.getByText('Board locked')).toBeOnTheScreen();
    expectBoardHidden();
    await press('pass-ok-button');
    expect(screen.queryByTestId('pass-card')).toBeNull();
    expectBoardShown();
  });

  it('the "Army frozen" card (Asodio)', async () => {
    const store = newStore(asodioRules);
    startAt(store, SAMPLE_POSITIONS.asodioFrozen, 'asodio');
    await show(store);
    expectBoardShown();
    await act(async () => {
      store.getState().dispatch({ type: 'roll', player: 'white', dice: [6, 5] });
    });
    expect(screen.getByText('Army frozen')).toBeOnTheScreen();
    expectBoardHidden();
    await press('pass-ok-button');
    expectBoardShown();
  });

  it('the mother card (Plakoto)', async () => {
    const store = newStore(plakotoRules);
    // White can pin Black's mother (Black's last checker on own 24) with a 1.
    const board = createBoard(
      {
        white: { points: { 24: 10, 14: 2, 8: 2, 2: 1 } },
        black: { points: { 24: 1, 20: 4, 16: 5, 12: 5 } },
      },
      'contrary',
    );
    startAt(store, board, 'plakoto');
    store.getState().dispatch({ type: 'roll', player: 'white', dice: [1, 6] });
    await show(store);
    const pressButton = async (name: string) => {
      await act(async () => {
        fireEvent.press(screen.getByRole('button', { name }));
      });
    };
    await pressButton('Checker from point 2 to point 1, pins');
    await pressButton('Checker from point 24 to point 18');
    focus.mockClear();
    await pressButton('Confirm');
    expect(screen.getByTestId('mother-card')).toBeOnTheScreen();
    expectBoardHidden();
    expect(focus).toHaveBeenCalledTimes(1);
    await press('mother-play-on-button');
    expect(screen.queryByTestId('mother-card')).toBeNull();
    expectBoardShown();
  });

  it('the game-end sheet hides the whole screen under it', async () => {
    const store = newStore();
    startAt(store, portes.initialState({ startingPlayer: 'white' }).board, 'portes');
    await show(store, { onOpenMenu: jest.fn() });
    expect(screen.getByTestId('menu-button')).toBeOnTheScreen();
    focus.mockClear();
    await act(async () => {
      store.getState().dispatch({ type: 'resign', player: 'black' });
    });
    expect(screen.getByTestId('game-end-card')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: /^Next game/ })).toBeOnTheScreen();
    // Under the sheet: the menu button, the strips, the board and the controls.
    const content = screen.getByTestId('game-content', hidden);
    expect(content).toHaveProp('importantForAccessibility', 'no-hide-descendants');
    expect(content).toHaveProp('accessibilityElementsHidden', true);
    expect(screen.queryByTestId('menu-button')).toBeNull();
    expect(screen.queryByTestId('strip-bottom')).toBeNull();
    expect(screen.queryByTestId('game-board')).toBeNull();
    expect(focus).toHaveBeenCalledTimes(1);

    await press('next-game-button');
    expect(screen.queryByTestId('game-end-card')).toBeNull();
    expect(screen.getByTestId('game-content')).toHaveProp('importantForAccessibility', 'auto');
    expect(screen.getByTestId('menu-button')).toBeOnTheScreen();
    expect(screen.getByTestId('strip-bottom')).toBeOnTheScreen();
  });

  it('a menu or dialog on top (covered) hides the whole screen', async () => {
    const store = newStore();
    startAt(store, portes.initialState({ startingPlayer: 'white' }).board, 'portes');
    await show(store, { onOpenMenu: jest.fn(), covered: true });
    expect(screen.queryByTestId('menu-button')).toBeNull();
    expect(screen.queryByTestId('game-board')).toBeNull();
    expect(screen.getByTestId('game-content', hidden)).toHaveProp(
      'accessibilityElementsHidden',
      true,
    );
  });
});

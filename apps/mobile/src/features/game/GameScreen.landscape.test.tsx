/**
 * Landscape (#185): the game screen turns with the phone. The classic board
 * sits between two side columns (menu, players and Undo on the left; the
 * game label, the dice and Roll or Confirm on the right). The window size
 * picks the layout, and turning the phone mid-turn keeps the game, a
 * selected checker, the dice and an open card.
 */
import {
  createBoard,
  createGameFlow,
  createSeededRng,
  portes,
  resolveRules,
  type BoardState,
} from '@tavli/engine';
import { getTheme } from '@tavli/themes';
import { act, fireEvent, screen, within } from '@testing-library/react-native';

import { boardLayout } from '@/features/board/BoardCanvas';
import { columnDiceBox } from '@/features/board/boardDice';
import {
  fitBoardWithShadow,
  slotRect,
  stackPosition,
  type BoardGeometry,
} from '@/features/board/geometry';
import { SIDE_COLUMN } from '@/features/board/screenLayout';
import { DEFAULT_SETTINGS, type HomeBoardSide } from '@/features/settings/settings';
import { settingsStore } from '@/features/settings/store';

import { createGameStore, type GameStore } from './gameStore';
import { GameScreen } from './GameScreen';

import { center, playToTheEnd, press } from '../../../test/boardPlay';
import { runOnFakeTimers } from '../../../test/clock';
import { touch } from '../../../test/gestureHandlerMock';
import { nativePath } from '../../../test/nativeParent';
import { renderWithRoot } from '../../../test/render';
import { LANDSCAPE_SE, PORTRAIT_SE, resetWindow, setWindow } from '../../../test/window';

const theme = getTheme('walnut-kafeneio');
/** The board's space in landscape on an iPhone SE: between the two side columns. */
const LANDSCAPE_SPACE = { width: 667 - 2 * 4 - 2 * SIDE_COLUMN, height: 360 };
/** The tall board's space in portrait. */
const TALL_SPACE = { width: 375, height: 500 };
const PAN = 'game-board-pan';
const hidden = { includeHiddenElements: true };

const landscapeGeo = (side: HomeBoardSide = 'right') =>
  fitBoardWithShadow(boardLayout(theme, 'classic', side), LANDSCAPE_SPACE);
const tallGeo = () => fitBoardWithShadow(boardLayout(theme, 'tall'), TALL_SPACE);

async function setSettings(settings: Partial<typeof DEFAULT_SETTINGS>) {
  await act(async () => {
    settingsStore.setState({ ...DEFAULT_SETTINGS, ...settings });
  });
}

/** Lays out the board in `space`, as React Native does after a turn of the phone. */
async function layoutBoard(space: { width: number; height: number }) {
  await act(async () => {
    fireEvent(screen.getByTestId('game-board', hidden), 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, ...space } },
    });
  });
}

async function show(store: GameStore, space = LANDSCAPE_SPACE) {
  await renderWithRoot(
    <GameScreen store={store} onOpenMenu={() => {}} gameLabel="Game 1 · Portes" />,
  );
  await layoutBoard(space);
}

function newStore(game: 'portes' | 'plakoto' | 'fevga', seed: number): GameStore {
  return createGameStore({
    players: { white: 'Ann', black: 'Bob' },
    targetPoints: 1,
    rules: resolveRules(game, { match: { rotation: [game] } }),
    rng: createSeededRng(seed),
  });
}

/** White starts with 6-1 (opening roll 6 against 1), the result card closed. */
async function whiteToMove61(space = LANDSCAPE_SPACE) {
  const store = createGameStore({
    players: { white: 'Ann', black: 'Bob' },
    rng: createSeededRng(5),
  });
  store.getState().dispatch({ type: 'rollOpening', player: 'white', die: 6 });
  store.getState().dispatch({ type: 'rollOpening', player: 'black', die: 1 });
  await show(store, space);
  await press('opening-overlay');
  return store;
}

const played = (store: GameStore) =>
  store.getState().flow.game.played.map((m) => `${m.from}/${m.to}`);

/** Taps a checker on point `from` (the top one of `count`), then point `to`. */
async function tapMove(geo: BoardGeometry, from: number, count: number, to: number) {
  await touch(PAN, [stackPosition(geo, { kind: 'point', index: from }, count - 1, count)]);
  await touch(PAN, [center(slotRect(geo, { kind: 'point', index: to }))]);
}

// The game screen closes its cards on timers (see test/clock.ts).
runOnFakeTimers();

beforeEach(async () => {
  await setWindow(LANDSCAPE_SE);
});

afterEach(async () => {
  await setSettings({});
  await resetWindow();
});

describe('<GameScreen /> in landscape (#185)', () => {
  it.each(['tall', 'classic'] as const)(
    'uses the landscape layout in a wide window (setting %s)',
    async (boardLayoutSetting) => {
      await setSettings({ boardLayout: boardLayoutSetting });
      await whiteToMove61();
      const left = screen.getByTestId('game-left');
      const right = screen.getByTestId('game-right');
      // Left column: the menu, the other player, you, and Undo under the left thumb.
      expect(within(left).getByTestId('menu-button')).toBeOnTheScreen();
      expect(within(left).getByTestId('strip-top')).toBeOnTheScreen();
      expect(within(left).getByTestId('strip-bottom')).toBeOnTheScreen();
      expect(within(left).getByTestId('undo-button')).toBeOnTheScreen();
      // Right column: the game label and Confirm under the right thumb.
      expect(within(right).getByTestId('game-label')).toHaveTextContent('Game 1 · Portes');
      expect(within(right).getByTestId('confirm-button')).toBeOnTheScreen();
      // The board sits between them, alone.
      const middle = screen.getByTestId('game-middle');
      expect(within(middle).queryByTestId('strip-top')).toBeNull();
      expect(within(middle).getByTestId('game-board', hidden)).toBeTruthy();
      // The board is the classic one: a tap on its drawn points moves.
      await tapMove(landscapeGeo(), 8, 3, 7);
      expect(screen.getByTestId('undo-button')).toBeEnabled();
    },
  );

  it('shows Roll in the right column, and the bottom player strip with the turn', async () => {
    const store = await whiteToMove61();
    await tapMove(landscapeGeo(), 8, 3, 7);
    await tapMove(landscapeGeo(), 13, 5, 7);
    await press('confirm-button');
    expect(store.getState().flow.game.phase).toBe('awaiting-roll');
    expect(within(screen.getByTestId('game-right')).getByTestId('roll-button')).toBeOnTheScreen();
    expect(screen.queryByTestId('undo-button')).toBeNull();
    // Each strip keeps all its parts, one per line. The board flipped: Bob's turn, at the bottom.
    expect(screen.getByTestId('strip-bottom')).toBeSelected();
    expect(screen.getByTestId('strip-bottom').props.accessibilityLabel).toMatch(
      /^Bob, .*Your turn$/,
    );
    expect(screen.getByTestId('strip-top')).not.toBeSelected();
  });

  it.each([
    ['portes', 'flip', 'right', 3],
    ['plakoto', 'fixed', 'left', 7],
    ['fevga', 'flip', 'left', 11],
  ] as const)(
    'plays a whole %s game (%s view, home %s) by tap and drag',
    async (game, flipMode, side, seed) => {
      await setSettings({ boardFlipMode: flipMode, homeBoardSide: side });
      const store = newStore(game, seed);
      await show(store);
      const { taps, drags } = await playToTheEnd(store, landscapeGeo(side), flipMode);
      expect(taps).toBeGreaterThan(10);
      expect(drags).toBeGreaterThan(5);
      expect(store.getState().flow.game.result).not.toBeNull();
    },
    120_000,
  );

  it('puts the dice in the right column, next to the board, in the board layer', async () => {
    const store = await whiteToMove61();
    const box = screen.getByTestId('board-dice');
    const want = columnDiceBox(landscapeGeo(), SIDE_COLUMN, 2);
    expect(box.props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ left: want.left, top: want.top })]),
    );
    expect(want.left).toBeGreaterThanOrEqual(LANDSCAPE_SPACE.width);
    expect(box.props.pointerEvents).toBe('none');
    const layer = screen.getByTestId('game-board-layer');
    expect(within(layer).getByLabelText('Dice 6-1, 2 left to play')).toBeOnTheScreen();
    // A move fades a die; the canvas stays in its native views.
    const dice = screen.getByTestId('dice-row');
    const path = nativePath(dice);
    await tapMove(landscapeGeo(), 8, 3, 7);
    expect(played(store)).toEqual(['8/7']);
    expect(screen.getByTestId('dice-row') === dice).toBe(true);
    expect(nativePath(screen.getByTestId('dice-row'))).toBe(path);
  });
});

describe('<GameScreen /> turning the phone mid-turn (#185)', () => {
  beforeEach(async () => {
    await setWindow(PORTRAIT_SE);
  });

  it('keeps the game, the picked-up checker and the dice', async () => {
    const store = await whiteToMove61(TALL_SPACE);
    expect(screen.queryByTestId('game-left')).toBeNull();
    // 13/7 is played, and the checker on 8 is picked up (tap), in portrait.
    await tapMove(tallGeo(), 13, 5, 7);
    await touch(PAN, [stackPosition(tallGeo(), { kind: 'point', index: 8 }, 2, 3)]);
    const board = screen.getByTestId('game-board', hidden);
    const dice = screen.getByTestId('dice-row');
    const dicePath = nativePath(dice);
    const boardPath = nativePath(screen.getByTestId('game-board-canvas', hidden));

    // The phone turns: the landscape layout, the same board and dice views.
    await setWindow(LANDSCAPE_SE);
    expect(screen.getByTestId('game-left')).toBeOnTheScreen();
    await layoutBoard(LANDSCAPE_SPACE);
    expect(screen.getByTestId('game-board', hidden)).toBe(board);
    expect(screen.getByTestId('dice-row')).toBe(dice);
    expect(nativePath(screen.getByTestId('dice-row'))).toBe(dicePath);
    expect(nativePath(screen.getByTestId('game-board-canvas', hidden))).toBe(boardPath);
    expect(screen.getByLabelText('Dice 6-1, 1 left to play')).toBeOnTheScreen();
    expect(played(store)).toEqual(['13/7']);
    expect(screen.getByTestId('undo-button')).toBeEnabled();

    // The checker on 8 is still picked up: one tap on 7 in the new place moves it.
    await touch(PAN, [center(slotRect(landscapeGeo(), { kind: 'point', index: 7 }))]);
    expect(played(store)).toEqual(['13/7', '8/7']);

    // And back upright: Undo takes back the last move.
    await setWindow(PORTRAIT_SE);
    await layoutBoard(TALL_SPACE);
    expect(screen.queryByTestId('game-left')).toBeNull();
    expect(screen.getByTestId('dice-row')).toBe(dice);
    await press('undo-button');
    expect(played(store)).toEqual(['13/7']);
  });

  it('keeps the classic layout setting for portrait', async () => {
    await setSettings({ boardLayout: 'classic' });
    await whiteToMove61({ width: 375, height: 229 });
    expect(screen.getByTestId('game-middle')).toBeOnTheScreen();
    expect(within(screen.getByTestId('game-middle')).getByTestId('strip-top')).toBeOnTheScreen();
    await setWindow(LANDSCAPE_SE);
    expect(within(screen.getByTestId('game-left')).getByTestId('strip-top')).toBeOnTheScreen();
    await setWindow(PORTRAIT_SE);
    expect(within(screen.getByTestId('game-middle')).getByTestId('strip-top')).toBeOnTheScreen();
  });

  it('keeps an open opening card with its tie', async () => {
    const store = createGameStore({
      players: { white: 'Ann', black: 'Bob' },
      rng: createSeededRng(1),
    });
    await show(store, TALL_SPACE);
    await act(async () => {
      store.getState().dispatch({ type: 'rollOpening', player: 'white', die: 4 });
      store.getState().dispatch({ type: 'rollOpening', player: 'black', die: 4 });
    });
    const card = screen.getByTestId('opening-card');
    const message = screen.getByTestId('opening-message').props.children as unknown;
    expect(screen.getByTestId('opening-message')).toHaveTextContent(/4/);
    await setWindow(LANDSCAPE_SE);
    await layoutBoard(LANDSCAPE_SPACE);
    expect(screen.getByTestId('opening-card')).toBe(card);
    expect(screen.getByTestId('opening-message').props.children).toEqual(message);
    expect(screen.getByTestId('roll-button')).toBeOnTheScreen();
  });

  it('keeps an open "no legal moves" card until OK', async () => {
    // Ann is on the bar and Bob holds all six entry points.
    const closed: BoardState = createBoard(
      {
        white: { points: { 6: 14 }, bar: 1 },
        black: { points: { 1: 2, 2: 2, 3: 2, 4: 2, 5: 2, 6: 2, 13: 3 } },
      },
      'contrary',
    );
    const store = createGameStore({
      players: { white: 'Ann', black: 'Bob' },
      rng: createSeededRng(1),
    });
    const state = portes.initialState({ startingPlayer: 'white' });
    store.setState({
      flow: {
        ...store.getState().flow,
        game: createGameFlow({ state: { ...state, board: closed }, starter: 'white' }),
      },
    });
    store.getState().dispatch({ type: 'roll', player: 'white', dice: [6, 6] });
    await show(store, TALL_SPACE);
    const card = screen.getByTestId('pass-card');
    await setWindow(LANDSCAPE_SE);
    await layoutBoard(LANDSCAPE_SPACE);
    expect(screen.getByTestId('pass-card')).toBe(card);
    // The card's timer does not close it: your own pass waits for OK (#178).
    await act(async () => {
      jest.advanceTimersByTime(10_000);
    });
    expect(screen.getByTestId('pass-card')).toBeOnTheScreen();
    await press('pass-ok-button');
    expect(screen.queryByTestId('pass-card')).toBeNull();
  });
});

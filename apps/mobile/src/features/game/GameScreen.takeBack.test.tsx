/**
 * #626: take a move back on the board. The checker moved last goes back
 * where it came from, by drag or by tap-tap: the same as Undo. Only the
 * last move group of the turn (a combined move whole), only on your own
 * turn, and never a checker borne off.
 */
import {
  checkersAt,
  createBoard,
  createGameFlow,
  createSeededRng,
  currentBoard,
  plakoto,
  portes,
  resolveRules,
  type BoardState,
  type DieValue,
} from '@tavli/engine';
import { getTheme } from '@tavli/themes';
import { act, fireEvent, screen } from '@testing-library/react-native';

import { portraitLayout } from '@/features/board/BoardCanvas';
import { fitBoardWithShadow, slotRect, stackPosition } from '@/features/board/geometry';
import { DEFAULT_SETTINGS, type Settings } from '@/features/settings/settings';
import { settingsStore } from '@/features/settings/store';

import { createGameStore, type GameStore } from './gameStore';
import { GameScreen } from './GameScreen';

import { runOnFakeTimers } from '../../../test/clock';
import { touch, type Point } from '../../../test/gestureHandlerMock';
import { renderWithRoot } from '../../../test/render';

const theme = getTheme('walnut-kafeneio');
const SIZE = { width: 375, height: 500 };
const PAN = 'game-board-pan';
const geo = fitBoardWithShadow(portraitLayout(theme, 'right'), SIZE);

const point = (index: number) => {
  const r = slotRect(geo, { kind: 'point', index });
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
};
const top = (index: number, count: number) =>
  stackPosition(geo, { kind: 'point', index }, count, count - 1);

const drag = (from: Point, to: Point) => touch(PAN, [from, { x: from.x + 15, y: from.y + 15 }, to]);
const tapTap = async (from: Point, to: Point) => {
  await touch(PAN, [from]);
  await touch(PAN, [to]);
};

const VARIANTS = { portes, plakoto } as const;

async function toPlay(
  game: 'portes' | 'plakoto',
  dice: [DieValue, DieValue],
  board: BoardState,
): Promise<GameStore> {
  const rules = resolveRules(game, { match: { rotation: [game] } });
  const store = createGameStore({
    players: { white: 'Ann', black: 'Bob' },
    rules,
    rng: createSeededRng(5),
  });
  const start = VARIANTS[game].initialState({ startingPlayer: 'white', rules });
  store.setState({
    flow: {
      ...store.getState().flow,
      game: createGameFlow({ state: { ...start, board }, starter: 'white' }),
    },
  });
  await renderWithRoot(<GameScreen store={store} />);
  await act(async () => {
    fireEvent(screen.getByTestId('game-board', { includeHiddenElements: true }), 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, ...SIZE } },
    });
  });
  await act(async () => {
    expect(store.getState().dispatch({ type: 'roll', player: 'white', dice })).toBe(true);
  });
  return store;
}

const played = (store: GameStore) =>
  store
    .getState()
    .flow.game.played.map((m) => `${m.from}/${m.to}${m.capture === 'none' ? '' : '*'}`);
const board = (store: GameStore) => currentBoard(store.getState().flow.game);

async function setSettings(patch: Partial<Settings>) {
  await act(async () => {
    settingsStore.setState({ ...DEFAULT_SETTINGS, ...patch });
  });
}

/** White: 2 on 13, 13 on 6. Black: a blot on White's 8 (Black's 17). */
const DOOR = createBoard(
  { white: { points: { 13: 2, 6: 13 } }, black: { points: { 17: 1, 24: 14 } } },
  'contrary',
);
/** No blot: White plays quiet moves. */
const QUIET = createBoard(
  { white: { points: { 13: 2, 6: 13 } }, black: { points: { 1: 15 } } },
  'contrary',
);

runOnFakeTimers();

beforeEach(async () => {
  await setSettings({});
});

describe('<GameScreen /> take a move back on the board (#626)', () => {
  it('drags the checker back, and the hit checker comes back from the bar', async () => {
    const store = await toPlay('portes', [5, 3], DOOR);
    await drag(top(13, 2), point(8));
    expect(played(store)).toEqual(['13/8*']);
    expect(board(store).bar.black).toBe(1);
    await drag(top(8, 1), point(13));
    expect(played(store)).toEqual([]);
    expect(board(store).bar.black).toBe(0);
    expect(checkersAt(board(store), 'white', 13, 'contrary')).toBe(2);
    expect(checkersAt(board(store), 'black', 17, 'contrary')).toBe(1);
  });

  it('tap the checker, then tap where it came from', async () => {
    const store = await toPlay('portes', [5, 3], QUIET);
    await tapTap(top(13, 2), point(8));
    expect(played(store)).toEqual(['13/8']);
    await tapTap(top(8, 1), point(13));
    expect(played(store)).toEqual([]);
  });

  it('the checker may still move on with the other die', async () => {
    const store = await toPlay('portes', [5, 3], QUIET);
    await tapTap(top(13, 2), point(8));
    await tapTap(top(8, 1), point(5));
    expect(played(store)).toEqual(['13/8', '8/5']);
  });

  it('a combined move goes back whole, to where it started', async () => {
    const store = await toPlay('portes', [5, 3], DOOR);
    await tapTap(top(13, 2), point(5));
    expect(played(store)).toEqual(['13/8*', '8/5']);
    await drag(top(5, 1), point(13));
    expect(played(store)).toEqual([]);
    expect(board(store).bar.black).toBe(0);
  });

  it('works after the last die too, while the turn waits for Confirm', async () => {
    const store = await toPlay('portes', [5, 3], QUIET);
    await tapTap(top(13, 2), point(8));
    await tapTap(top(13, 1), point(10));
    expect(store.getState().flow.game.phase).toBe('awaiting-confirm');
    await drag(top(10, 1), point(13));
    expect(played(store)).toEqual(['13/8']);
    await tapTap(top(8, 1), point(13));
    expect(played(store)).toEqual([]);
  });

  it('only the last move: an earlier one does not go back', async () => {
    const store = await toPlay('portes', [2, 2], QUIET);
    await tapTap(top(13, 2), point(9));
    await tapTap(top(6, 13), point(4));
    expect(played(store)).toEqual(['13/11', '11/9', '6/4']);
    // 9 came from 13, but 6/4 is on top: the drop is not a target.
    await drag(top(9, 1), point(13));
    expect(played(store)).toEqual(['13/11', '11/9', '6/4']);
    await drag(top(4, 1), point(6));
    expect(played(store)).toEqual(['13/11', '11/9']);
    // Now the combined move is on top.
    await drag(top(9, 1), point(13));
    expect(played(store)).toEqual([]);
  });

  it('a drop between does nothing', async () => {
    const store = await toPlay('portes', [5, 3], QUIET);
    await tapTap(top(13, 2), point(8));
    await drag(top(8, 1), point(11));
    expect(played(store)).toEqual(['13/8']);
  });

  it('Plakoto: back on the blot it left, it pins it again', async () => {
    const store = await toPlay('plakoto', [5, 3], DOOR);
    await tapTap(top(13, 2), point(8));
    expect(played(store)).toEqual(['13/8*']);
    await tapTap(top(8, 1), point(5));
    expect(played(store)).toEqual(['13/8*', '8/5']);
    expect(board(store).points.every((p) => p.pinned === null)).toBe(true);
    await drag(top(5, 1), point(8));
    expect(played(store)).toEqual(['13/8*']);
    expect(board(store).points.some((p) => p.pinned === 'black')).toBe(true);
  });

  it('nothing goes back after the turn ends (auto-confirm)', async () => {
    await setSettings({ autoConfirmMoves: true });
    const store = await toPlay('portes', [5, 3], QUIET);
    await tapTap(top(13, 2), point(8));
    await tapTap(top(13, 1), point(10));
    const game = store.getState().flow.game;
    expect(game.state.toMove).toBe('black');
    const before = currentBoard(game);
    await drag(top(10, 1), point(13));
    expect(currentBoard(store.getState().flow.game)).toEqual(before);
  });
});

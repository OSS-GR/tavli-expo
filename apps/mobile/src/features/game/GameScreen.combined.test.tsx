/**
 * #180: move one checker with both dice in one step. A selected checker
 * lights its single targets and its combined ones ("2+3"); a tap or a drop
 * on a combined target plays each step in order, and one Undo takes the
 * whole move back. Portes (a hit on the way), Plakoto (a pin on the way),
 * Fevga, the mirrored board (#175) and the flip view.
 */
import {
  checkersAt,
  createBoard,
  createGameFlow,
  createSeededRng,
  currentBoard,
  fevga,
  plakoto,
  portes,
  resolveRules,
  type BoardState,
  type DieValue,
  type PlayerId,
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
import { countNodes, findAllNodes, type JsonNode } from '../../../test/tree';

const theme = getTheme('walnut-kafeneio');
const SIZE = { width: 375, height: 500 };
const PAN = 'game-board-pan';

type Side = 'right' | 'left';
const geoFor = (side: Side) => fitBoardWithShadow(portraitLayout(theme, side), SIZE);

/** Places on the board the screen draws (`side`: Settings → Your home). */
function places(side: Side) {
  const geo = geoFor(side);
  return {
    point: (index: number) => {
      const r = slotRect(geo, { kind: 'point', index });
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    },
    top: (index: number, count: number) =>
      stackPosition(geo, { kind: 'point', index }, count, count - 1),
  };
}

const drag = (from: Point, to: Point) => touch(PAN, [from, { x: from.x + 15, y: from.y + 15 }, to]);
const tapTap = async (from: Point, to: Point) => {
  await touch(PAN, [from]);
  await touch(PAN, [to]);
};

type Game = 'portes' | 'plakoto' | 'fevga';
const VARIANTS = { portes, plakoto, fevga } as const;

/** `player` to play `dice` in `game` (on `board`, or the game's start), on the screen. */
async function toPlay(
  game: Game,
  dice: [DieValue, DieValue],
  { board, player = 'white' }: { board?: BoardState; player?: PlayerId } = {},
): Promise<GameStore> {
  const rules = resolveRules(game, { match: { rotation: [game] } });
  const store = createGameStore({
    players: { white: 'Ann', black: 'Bob' },
    rules,
    rng: createSeededRng(5),
  });
  const start = VARIANTS[game].initialState({ startingPlayer: player, rules });
  const state = board ? { ...start, board } : start;
  store.setState({
    flow: { ...store.getState().flow, game: createGameFlow({ state, starter: player }) },
  });
  await renderWithRoot(<GameScreen store={store} />);
  await act(async () => {
    fireEvent(screen.getByTestId('game-board', { includeHiddenElements: true }), 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, ...SIZE } },
    });
  });
  await act(async () => {
    expect(store.getState().dispatch({ type: 'roll', player, dice })).toBe(true);
  });
  return store;
}

const played = (store: GameStore) =>
  store
    .getState()
    .flow.game.played.map((m) => `${m.from}/${m.to}${m.capture === 'none' ? '' : '*'}`);

/** Target rings on the board, and the dots of the combined ones. */
const rings = () => countNodes(screen.toJSON() as JsonNode, 'DashPathEffect');
const stepDots = () =>
  findAllNodes(
    screen.toJSON() as JsonNode,
    (n) =>
      n.type === 'Circle' &&
      n.props['color'] === theme.highlights.target.color &&
      !n.props['style'],
  ).length;

const pressUndo = async () => {
  await act(async () => {
    fireEvent.press(screen.getByTestId('undo-button'));
  });
};

async function setSettings(patch: Partial<Settings>) {
  await act(async () => {
    settingsStore.setState({ ...DEFAULT_SETTINGS, ...patch });
  });
}

/** White's door on 13 and 13 on 6. Black has a blot on White's 8 (Black's 17). */
const DOOR = { white: { points: { 13: 2, 6: 13 } }, black: { points: { 17: 1, 24: 14 } } };
/** The same, and Black holds White's 10 (Black's 15): only 13/8/5 reaches 5. */
const DOOR_10_CLOSED = {
  white: { points: { 13: 2, 6: 13 } },
  black: { points: { 17: 1, 15: 2, 24: 12 } },
};

runOnFakeTimers();

beforeEach(async () => {
  await setSettings({});
});

describe('<GameScreen /> one checker with both dice (#180)', () => {
  const { point, top } = places('right');

  it('Portes: lights 13/8, 13/10 and 13/8/5, and plays 13/8*/5 by tap-tap', async () => {
    const store = await toPlay('portes', [5, 3], { board: createBoard(DOOR, 'contrary') });
    await touch(PAN, [top(13, 2)]);
    // Two single targets and one combined target with two dots.
    expect(rings()).toBe(3);
    expect(stepDots()).toBe(2);
    await touch(PAN, [point(5)]);
    // 13/10/5 is legal too, but the order that hits on the way wins.
    expect(played(store)).toEqual(['13/8*', '8/5']);
    expect(currentBoard(store.getState().flow.game).bar.black).toBe(1);
    expect(rings()).toBe(0);
  });

  it('Portes: plays the combined target by drag and drop, with the hit', async () => {
    const store = await toPlay('portes', [5, 3], { board: createBoard(DOOR, 'contrary') });
    await drag(top(13, 2), point(5));
    expect(played(store)).toEqual(['13/8*', '8/5']);
  });

  it('Portes: hits on the way when that is the only order, and Undo takes it all back', async () => {
    const store = await toPlay('portes', [5, 3], {
      board: createBoard(DOOR_10_CLOSED, 'contrary'),
    });
    await tapTap(top(13, 2), point(5));
    expect(played(store)).toEqual(['13/8*', '8/5']);
    expect(currentBoard(store.getState().flow.game).bar.black).toBe(1);
    // One Undo: both steps, and the hit checker is back on 8.
    await pressUndo();
    expect(played(store)).toEqual([]);
    expect(currentBoard(store.getState().flow.game).bar.black).toBe(0);
  });

  it('Undo takes back a single move after a combined one, then the combined one', async () => {
    const board = createBoard(
      { white: { points: { 13: 2, 6: 13 } }, black: { points: { 1: 15 } } },
      'contrary',
    );
    const store = await toPlay('portes', [2, 2], { board });
    // 13/11/9 with two of the four 2s, then 6/4 alone.
    await tapTap(top(13, 2), point(9));
    expect(played(store)).toEqual(['13/11', '11/9']);
    await tapTap(top(6, 13), point(4));
    expect(played(store)).toEqual(['13/11', '11/9', '6/4']);
    await pressUndo();
    expect(played(store)).toEqual(['13/11', '11/9']);
    await pressUndo();
    expect(played(store)).toEqual([]);
  });

  it('a double offers 2, 3 and 4 steps, and plays all four with one tap', async () => {
    const board = createBoard(
      { white: { points: { 13: 1, 6: 14 } }, black: { points: { 1: 15 } } },
      'contrary',
    );
    const store = await toPlay('portes', [2, 2], { board });
    await touch(PAN, [top(13, 1)]);
    // 11 alone; 9, 7 and 5 with 2, 3 and 4 dots.
    expect(rings()).toBe(4);
    expect(stepDots()).toBe(2 + 3 + 4);
    await touch(PAN, [point(5)]);
    expect(played(store)).toEqual(['13/11', '11/9', '9/7', '7/5']);
    expect(store.getState().flow.game.phase).toBe('awaiting-confirm');
  });

  it('ends the turn with auto-confirm after the last step only', async () => {
    await setSettings({ autoConfirmMoves: true });
    const board = createBoard(
      { white: { points: { 13: 1, 6: 14 } }, black: { points: { 1: 15 } } },
      'contrary',
    );
    const store = await toPlay('portes', [2, 2], { board });
    await tapTap(top(13, 1), point(5));
    const game = store.getState().flow.game;
    expect(game.lastTurn?.moves.map((m) => `${m.from}/${m.to}`)).toEqual([
      '13/11',
      '11/9',
      '9/7',
      '7/5',
    ]);
    expect(game.state.toMove).toBe('black');
  });

  it('Plakoto: prefers 13/10/5 over pinning on 8', async () => {
    const store = await toPlay('plakoto', [5, 3], { board: createBoard(DOOR, 'contrary') });
    await tapTap(top(13, 2), point(5));
    expect(played(store)).toEqual(['13/10', '10/5']);
  });

  it('Plakoto: pins on the way when that is the only order, and the blot is free again', async () => {
    const store = await toPlay('plakoto', [5, 3], {
      board: createBoard(DOOR_10_CLOSED, 'contrary'),
    });
    await drag(top(13, 2), point(5));
    expect(played(store)).toEqual(['13/8*', '8/5']);
    // White left 8 again: Black's checker there is not pinned.
    const after = currentBoard(store.getState().flow.game);
    expect(checkersAt(after, 'black', 17, 'contrary')).toBe(1);
    expect(checkersAt(after, 'white', 8, 'contrary')).toBe(0);
    expect(after.points.every((p) => p.pinned === null)).toBe(true);
    await pressUndo();
    expect(played(store)).toEqual([]);
  });

  it('Fevga: the first checker goes 24/21/16 by tap-tap', async () => {
    const store = await toPlay('fevga', [5, 3]);
    await tapTap(top(24, 15), point(16));
    expect(played(store)).toEqual(['24/21', '21/16']);
  });
});

describe('<GameScreen /> both dice on the mirrored board and in the flip view', () => {
  it.each([
    ['right', 'tap'],
    ['left', 'tap'],
    ['right', 'drag'],
    ['left', 'drag'],
  ] as const)('home on the %s: plays 13/8*/5 by %s', async (side, how) => {
    await setSettings({ homeBoardSide: side });
    const { point, top } = places(side);
    const store = await toPlay('portes', [5, 3], { board: createBoard(DOOR, 'contrary') });
    if (how === 'tap') await tapTap(top(13, 2), point(5));
    else await drag(top(13, 2), point(5));
    expect(played(store)).toEqual(['13/8*', '8/5']);
    // Where 5 is on the other side's board, nothing happens.
    await pressUndo();
    const other = places(side === 'right' ? 'left' : 'right');
    await drag(top(13, 2), other.point(5));
    expect(played(store)).toEqual([]);
  });

  it.each(['right', 'left'] as const)(
    'flip: Black to move at the bottom (home on the %s)',
    async (side) => {
      await setSettings({ homeBoardSide: side, boardFlipMode: 'flip' });
      const { point, top } = places(side);
      // Black's door on its 13; a White blot on Black's 8.
      const board = createBoard(
        { white: { points: { 17: 1, 24: 14 } }, black: { points: { 13: 2, 6: 13 } } },
        'contrary',
      );
      const store = await toPlay('portes', [5, 3], { board, player: 'black' });
      // Black sits at the bottom: its own 13 is drawn where White's would be.
      await tapTap(top(13, 2), point(5));
      expect(played(store)).toEqual(['13/8*', '8/5']);
    },
  );

  it.each(['right', 'left'] as const)(
    'fixed view: Black plays from the top (home on the %s)',
    async (side) => {
      await setSettings({ homeBoardSide: side, boardFlipMode: 'fixed' });
      const { point, top } = places(side);
      const board = createBoard(
        { white: { points: { 17: 1, 24: 14 } }, black: { points: { 13: 2, 6: 13 } } },
        'contrary',
      );
      const store = await toPlay('portes', [5, 3], { board, player: 'black' });
      // White at the bottom: Black's 13 is White's 12, Black's 5 is White's 20.
      await drag(top(12, 2), point(20));
      expect(played(store)).toEqual(['13/8*', '8/5']);
    },
  );
});

describe('<GameScreen /> both dice in the move list', () => {
  it('offers 13 → 8 → 5 with the hit as a button and plays it', async () => {
    await setSettings({ moveList: 'on' });
    const store = await toPlay('portes', [5, 3], { board: createBoard(DOOR, 'contrary') });
    const button = screen.getByTestId('move-list-13>5:5+3');
    expect(button).toHaveProp(
      'accessibilityLabel',
      'Checker from point 13 to point 8, hits, then to point 5',
    );
    await act(async () => {
      fireEvent.press(button);
    });
    expect(played(store)).toEqual(['13/8*', '8/5']);
    await pressUndo();
    expect(played(store)).toEqual([]);
  });
});

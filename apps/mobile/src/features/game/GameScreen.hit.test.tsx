/**
 * #179: after a hit (Portes) or a pin (Plakoto), the same checker plays the
 * other die, by tap-tap and by drag. Fevga has no hits: the checker that
 * just moved plays on. Also while the hit checker still flies to the bar.
 */
import {
  applyMoveToBoard,
  createBoard,
  createGameFlow,
  createSeededRng,
  fevga,
  plakoto,
  portes,
  resolveRules,
  type BoardState,
  type Move,
  type SourceMoves,
} from '@tavli/engine';
import { getLayout, getTheme } from '@tavli/themes';
import { act, fireEvent, screen } from '@testing-library/react-native';

import type { BoardView } from '@/features/board/boardModel';
import { moveFlights } from '@/features/board/flights';
import { fitBoardWithShadow, slotRect, stackPosition, type Slot } from '@/features/board/geometry';
import { InteractiveBoard } from '@/features/board/InteractiveBoard';
import { DEFAULT_SETTINGS } from '@/features/settings/settings';
import { settingsStore } from '@/features/settings/store';

import { createGameStore, type GameStore } from './gameStore';
import { GameScreen } from './GameScreen';

import { runOnFakeTimers } from '../../../test/clock';
import { touch, type Point } from '../../../test/gestureHandlerMock';
import { renderWithRoot } from '../../../test/render';
import { countNodes, type JsonNode } from '../../../test/tree';

const theme = getTheme('walnut-kafeneio');
const SIZE = { width: 375, height: 500 };
const geo = fitBoardWithShadow(getLayout(theme, 'portrait-rotated'), SIZE);
const PAN = 'game-board-pan';

const point = (index: number) => {
  const r = slotRect(geo, { kind: 'point', index });
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
};
/** The top checker of a stack of `count` (`pinned`: a pinned checker lies under it). */
const top = (index: number, count: number, pinned = false) =>
  stackPosition(geo, { kind: 'point', index }, count, count - 1, pinned);

/** A drag from `from` to `to`, with a first step far enough to start the pan. */
const drag = (from: Point, to: Point) => touch(PAN, [from, { x: from.x + 15, y: from.y + 15 }, to]);
const tapTap = async (from: Point, to: Point) => {
  await touch(PAN, [from]);
  await touch(PAN, [to]);
};

const targetRings = () => countNodes(screen.toJSON() as JsonNode, 'DashPathEffect');

/** White's door on 13 and 13 on 6. Black has a blot on White's 8 (Black's 17). */
const DOOR = { white: { points: { 13: 2, 6: 13 } }, black: { points: { 17: 1, 24: 14 } } };

type Game = 'portes' | 'plakoto' | 'fevga';
const VARIANTS = { portes, plakoto, fevga } as const;

/** White to play 5-3 on `board` in `game`, on the screen. */
async function whiteToPlay(game: Game, board: BoardState): Promise<GameStore> {
  const rules = resolveRules(game, { match: { rotation: [game] } });
  const store = createGameStore({
    players: { white: 'Ann', black: 'Bob' },
    rules,
    rng: createSeededRng(5),
  });
  const state = { ...VARIANTS[game].initialState({ startingPlayer: 'white', rules }), board };
  store.setState({
    flow: { ...store.getState().flow, game: createGameFlow({ state, starter: 'white' }) },
  });
  await renderWithRoot(<GameScreen store={store} />);
  await act(async () => {
    fireEvent(screen.getByTestId('game-board', { includeHiddenElements: true }), 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, ...SIZE } },
    });
  });
  await act(async () => {
    expect(store.getState().dispatch({ type: 'roll', player: 'white', dice: [5, 3] })).toBe(true);
  });
  return store;
}

const played = (store: GameStore) =>
  store
    .getState()
    .flow.game.played.map((m) => `${m.from}/${m.to}${m.capture === 'none' ? '' : '*'}`);

runOnFakeTimers();

beforeEach(async () => {
  await act(async () => {
    settingsStore.setState({ ...DEFAULT_SETTINGS });
  });
});

describe('<GameScreen /> the same checker after a hit (#179)', () => {
  const door = () => createBoard(DOOR, 'contrary');

  it('Portes: hits by tap-tap, then moves the hitter on by tap-tap', async () => {
    const store = await whiteToPlay('portes', door());
    await tapTap(top(13, 2), point(8));
    expect(played(store)).toEqual(['13/8*']);
    expect(store.getState().flow.game.state.board.bar.black).toBe(0);
    // The hitter on 8 is selected: its target (8/5) lights up.
    await touch(PAN, [top(8, 1)]);
    expect(targetRings()).toBe(1);
    await touch(PAN, [point(5)]);
    expect(played(store)).toEqual(['13/8*', '8/5']);
  });

  it('Portes: hits by drag, then drags the hitter on', async () => {
    const store = await whiteToPlay('portes', door());
    await drag(top(13, 2), point(8));
    expect(played(store)).toEqual(['13/8*']);
    await drag(top(8, 1), point(5));
    expect(played(store)).toEqual(['13/8*', '8/5']);
  });

  it('Portes: hits by tap-tap, then drags the hitter on', async () => {
    const store = await whiteToPlay('portes', door());
    await tapTap(top(13, 2), point(8));
    await drag(top(8, 1), point(5));
    expect(played(store)).toEqual(['13/8*', '8/5']);
  });

  it('Portes: hits by drag, then moves the hitter on by tap-tap', async () => {
    const store = await whiteToPlay('portes', door());
    await drag(top(13, 2), point(8));
    await tapTap(top(8, 1), point(5));
    expect(played(store)).toEqual(['13/8*', '8/5']);
  });

  it('Portes: hits with the 3, then moves the hitter on with the 5', async () => {
    // A Black blot on White's 10 (Black's 15).
    const board = createBoard(
      { white: DOOR.white, black: { points: { 15: 1, 24: 14 } } },
      'contrary',
    );
    const store = await whiteToPlay('portes', board);
    await tapTap(top(13, 2), point(10));
    await drag(top(10, 1), point(5));
    expect(played(store)).toEqual(['13/10*', '10/5']);
  });

  it('Plakoto: pins, then moves the pinner on by tap-tap', async () => {
    const store = await whiteToPlay('plakoto', door());
    await tapTap(top(13, 2), point(8));
    expect(played(store)).toEqual(['13/8*']);
    // The pinner sits on top of the pinned checker.
    await touch(PAN, [top(8, 1, true)]);
    expect(targetRings()).toBe(1);
    await touch(PAN, [point(5)]);
    expect(played(store)).toEqual(['13/8*', '8/5']);
  });

  it('Plakoto: pins by drag, then drags the pinner on', async () => {
    const store = await whiteToPlay('plakoto', door());
    await drag(top(13, 2), point(8));
    await drag(top(8, 1, true), point(5));
    expect(played(store)).toEqual(['13/8*', '8/5']);
  });

  const fevgaBoard = () =>
    createBoard(
      { white: { points: { 24: 2, 13: 13 } }, black: { points: { 24: 15 } } },
      'parallel',
    );

  it('Fevga: the checker that just moved plays the other die, by tap-tap', async () => {
    const store = await whiteToPlay('fevga', fevgaBoard());
    await tapTap(top(13, 5), point(8));
    await tapTap(top(8, 1), point(5));
    expect(played(store)).toEqual(['13/8', '8/5']);
  });

  it('Fevga: the checker that just moved plays the other die, by drag', async () => {
    const store = await whiteToPlay('fevga', fevgaBoard());
    await drag(top(13, 5), point(8));
    await drag(top(8, 1), point(5));
    expect(played(store)).toEqual(['13/8', '8/5']);
  });
});

describe('<InteractiveBoard /> while the hit checker flies to the bar (#179)', () => {
  const VIEW: BoardView = { viewer: 'white', direction: 'contrary' };
  const hit: Move = { from: 13, to: 8, die: 5, capture: 'hit' };
  const before = createBoard(DOOR, 'contrary');
  const after = applyMoveToBoard(before, 'white', hit, 'contrary');
  // The legal moves after 13/8*, as the engine lists them.
  const state = { ...portes.initialState({ startingPlayer: 'white' }), board: before };
  const legal: SourceMoves[] = [];
  for (const move of portes.nextMoves(state, [5, 3], [hit])) {
    const group = legal.find((g) => g.from === move.from);
    if (group) (group.moves as Move[]).push(move);
    else legal.push({ from: move.from, moves: [move] });
  }
  // Both flights stay in the air: nobody calls them done.
  const flights = moveFlights(geo, VIEW, 'white', hit, before, after, { id: 'm1' });

  async function showBoard() {
    const onMove = jest.fn(() => true);
    await renderWithRoot(
      <InteractiveBoard
        testID="game-board"
        theme={theme}
        board={after}
        view={VIEW}
        mover="white"
        legal={legal}
        positionKey="1"
        flights={flights}
        onFlightDone={() => {}}
        onMove={onMove}
      />,
    );
    await act(async () => {
      fireEvent(screen.getByTestId('game-board'), 'layout', {
        nativeEvent: { layout: { x: 0, y: 0, ...SIZE } },
      });
    });
    return onMove;
  }

  it('lists the hitter and flies both checkers', () => {
    expect(legal.map((g) => g.from)).toContain(8);
    expect(flights).toHaveLength(2);
    const p8: Slot = { kind: 'point', index: 8 };
    expect(flights[0]).toMatchObject({ hide: 'p8:0', to: stackPosition(geo, p8, 1, 0) });
  });

  it('moves the hitter on by tap-tap', async () => {
    const onMove = await showBoard();
    await touch(PAN, [top(8, 1)]);
    expect(targetRings()).toBe(1);
    await touch(PAN, [point(5)]);
    expect(onMove).toHaveBeenCalledWith(
      expect.objectContaining({ from: 8, to: 5, die: 3 }),
      expect.anything(),
      null,
    );
  });

  it('moves the hitter on by drag', async () => {
    const onMove = await showBoard();
    await drag(top(8, 1), point(5));
    expect(onMove).toHaveBeenCalledWith(
      expect.objectContaining({ from: 8, to: 5, die: 3 }),
      expect.anything(),
      expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) }),
    );
  });
});

/**
 * Settings → Board → Board layout (#184): the tall board (default) and the
 * classic board. Both must play a whole game with real touches (tap-tap
 * and drag), with the dice on the board, the home board side (#175) and
 * the flip view.
 */
import { createSeededRng, resolveRules, type PlayerId } from '@tavli/engine';
import { getTheme } from '@tavli/themes';
import { act, fireEvent, screen, within } from '@testing-library/react-native';

import { boardLayout } from '@/features/board/BoardCanvas';
import { boardDiceBox } from '@/features/board/boardDice';
import {
  boxRatioWithShadow,
  fitBoardWithShadow,
  slotRect,
  stackPosition,
  type BoardGeometry,
} from '@/features/board/geometry';
import { buildSources } from '@/features/board/interaction';
import {
  DEFAULT_SETTINGS,
  type BoardFlipMode,
  type BoardLayoutMode,
  type HomeBoardSide,
} from '@/features/settings/settings';
import { settingsStore } from '@/features/settings/store';

import { createGameStore, turnView, type GameStore } from './gameStore';
import { GameScreen } from './GameScreen';
import { openingStatus } from './opening';
import { passNotice } from './turnNotices';

import { runOnFakeTimers } from '../../../test/clock';
import { touch } from '../../../test/gestureHandlerMock';
import { nativePath } from '../../../test/nativeParent';
import { pressOpeningRoll } from '../../../test/openingRoll';
import { renderWithRoot } from '../../../test/render';

const theme = getTheme('walnut-kafeneio');
/** The space each layout gives the board on an iPhone SE (375 pt wide). */
const SPACE: Readonly<Record<BoardLayoutMode, { width: number; height: number }>> = {
  tall: { width: 375, height: 500 },
  classic: { width: 375, height: 375 / boxRatioWithShadow(theme.layouts.landscape) },
};
const PAN = 'game-board-pan';
const hidden = { includeHiddenElements: true };

const geoFor = (layout: BoardLayoutMode, side: HomeBoardSide = 'right') =>
  fitBoardWithShadow(boardLayout(theme, layout, side), SPACE[layout]);

const center = (r: { x: number; y: number; width: number; height: number }) => ({
  x: r.x + r.width / 2,
  y: r.y + r.height / 2,
});

function newStore(game: 'portes' | 'plakoto' | 'fevga', seed: number): GameStore {
  return createGameStore({
    players: { white: 'Ann', black: 'Bob' },
    targetPoints: 1,
    rules: resolveRules(game, { match: { rotation: [game] } }),
    rng: createSeededRng(seed),
  });
}

/** White starts with 6-1 (opening roll 6 against 1), the result card closed. */
async function whiteToMove61(layout: BoardLayoutMode) {
  const store = createGameStore({
    players: { white: 'Ann', black: 'Bob' },
    rng: createSeededRng(5),
  });
  store.getState().dispatch({ type: 'rollOpening', player: 'white', die: 6 });
  store.getState().dispatch({ type: 'rollOpening', player: 'black', die: 1 });
  await show(store, layout);
  await press('opening-overlay');
  return store;
}

async function setSettings(settings: Partial<typeof DEFAULT_SETTINGS>) {
  await act(async () => {
    settingsStore.setState({ ...DEFAULT_SETTINGS, ...settings });
  });
}

async function show(store: GameStore, layout: BoardLayoutMode, gameLabel?: string) {
  await renderWithRoot(
    <GameScreen store={store} onOpenMenu={() => {}} {...(gameLabel ? { gameLabel } : {})} />,
  );
  await act(async () => {
    fireEvent(screen.getByTestId('game-board', hidden), 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, ...SPACE[layout] } },
    });
  });
}

const press = async (testID: string) => {
  await act(async () => {
    fireEvent.press(screen.getByTestId(testID));
  });
};

const played = (store: GameStore) =>
  store.getState().flow.game.played.map((m) => `${m.from}/${m.to}`);

/** The sources of the player to move, as the screen sees them. */
function sourcesNow(store: GameStore, geo: BoardGeometry, flipMode: BoardFlipMode) {
  const view = turnView(store.getState().flow);
  const viewer: PlayerId = flipMode === 'flip' ? view.toMove : 'white';
  const boardView = { viewer, direction: view.game.state.rules.movement.direction };
  return buildSources(geo, view.board, boardView, view.toMove, view.legal);
}

/**
 * Plays the match to its end: roll, then each move by tap-tap or (every
 * third move) by drag, confirm, close the cards. Plakoto's mother question
 * is answered "play on". Returns how many moves were played by tap and by drag.
 */
async function playToTheEnd(store: GameStore, geo: BoardGeometry, flipMode: BoardFlipMode) {
  let taps = 0;
  let drags = 0;
  let steps = 0;
  for (; steps < 4000; steps++) {
    const { flow } = store.getState();
    const view = turnView(flow);
    if (view.matchPhase !== 'playing') break;
    const card = (testID: string) => screen.queryByTestId(testID) !== null;
    if (view.phase === 'awaiting-answer') await press('mother-play-on-button');
    else if (passNotice(flow) && card('pass-ok-button')) await press('pass-ok-button');
    else if (view.phase === 'opening-roll') await pressOpeningRoll();
    else if (openingStatus(view.game) && card('opening-overlay')) await press('opening-overlay');
    else if (view.phase === 'awaiting-roll') await press('roll-button');
    else if (view.phase === 'awaiting-confirm') await press('confirm-button');
    else {
      const sources = sourcesNow(store, geo, flipMode);
      const source = sources[(taps + drags) % sources.length]!;
      const target = source.targets[0]!;
      const from = { x: source.checker.x, y: source.checker.y };
      if ((taps + drags) % 3 === 2) {
        await touch(PAN, [from, { x: from.x + 12, y: from.y + 12 }, target.landing]);
        drags++;
      } else {
        await touch(PAN, [from]);
        await touch(PAN, [center(target.rect)]);
        taps++;
      }
      expect(store.getState().flow.log.length).toBeGreaterThan(flow.log.length);
    }
  }
  expect(steps).toBeLessThan(4000);
  return { taps, drags };
}

// The game screen closes its cards on timers (see test/clock.ts).
runOnFakeTimers();

afterEach(async () => {
  await setSettings({});
});

describe('<GameScreen /> board layouts (#184)', () => {
  it('starts with the tall board: the menu in the top strip, the game label in the menu', async () => {
    expect(DEFAULT_SETTINGS.boardLayout).toBe('tall');
    await show(newStore('portes', 3), 'tall', 'Game 1 · Portes');
    expect(screen.queryByTestId('game-label')).toBeNull();
    expect(screen.queryByTestId('game-middle')).toBeNull();
    // The menu button and the top strip share one row.
    const menu = screen.getByTestId('menu-button');
    expect(menu.parent).toBe(screen.getByTestId('strip-top').parent?.parent);
  });

  it('shows the classic board in the middle, with its strips and the game label', async () => {
    await setSettings({ boardLayout: 'classic' });
    await show(newStore('portes', 3), 'classic', 'Game 1 · Portes');
    expect(screen.getByTestId('game-label')).toHaveTextContent('Game 1 · Portes');
    const middle = screen.getByTestId('game-middle');
    expect(within(middle).getByTestId('strip-top')).toBeOnTheScreen();
    expect(within(middle).getByTestId('strip-bottom')).toBeOnTheScreen();
    expect(within(middle).getByTestId('game-board', hidden)).toBeTruthy();
    // The buttons stay at the bottom, under the middle.
    expect(within(middle).queryByRole('button', { name: /^Roll/ })).toBeNull();
  });

  describe.each(['tall', 'classic'] as const)('%s layout', (layout) => {
    beforeEach(async () => {
      await setSettings({ boardLayout: layout });
    });

    it.each([
      ['portes', 'flip', 3],
      ['plakoto', 'fixed', 7],
      ['fevga', 'flip', 11],
    ] as const)(
      'plays a whole %s game (%s view) by tap and drag',
      async (game, flipMode, seed) => {
        await setSettings({ boardLayout: layout, boardFlipMode: flipMode });
        const store = newStore(game, seed);
        await show(store, layout);
        const { taps, drags } = await playToTheEnd(store, geoFor(layout), flipMode);
        expect(taps).toBeGreaterThan(10);
        expect(drags).toBeGreaterThan(5);
        expect(store.getState().flow.game.result).not.toBeNull();
      },
      120_000,
    );

    it('moves by drag and by tap on the drawn points, with the home on either side', async () => {
      for (const side of ['right', 'left'] as const) {
        await setSettings({ boardLayout: layout, homeBoardSide: side });
        const store = await whiteToMove61(layout);
        const geo = geoFor(layout, side);
        // 13/7 by drag, then 8/7 by tap-tap.
        const from = stackPosition(geo, { kind: 'point', index: 13 }, 5, 4);
        const to7 = center(slotRect(geo, { kind: 'point', index: 7 }));
        await touch(PAN, [from, { x: from.x + 20, y: from.y + 20 }, to7]);
        expect(played(store)).toEqual(['13/7']);
        await touch(PAN, [stackPosition(geo, { kind: 'point', index: 8 }, 3, 2)]);
        await touch(PAN, [to7]);
        expect(played(store)).toEqual(['13/7', '8/7']);
        await screen.unmount();
      }
    });

    it('puts the dice on the board, in the dice area, and keeps their canvas in place', async () => {
      const store = await whiteToMove61(layout);
      const geo = geoFor(layout);
      const box = screen.getByTestId('board-dice');
      const want = boardDiceBox(geo, 2);
      expect(box.props.style).toEqual(
        expect.arrayContaining([expect.objectContaining({ left: want.left, top: want.top })]),
      );
      expect(box.props.pointerEvents).toBe('none');
      // The dice lie on the board, not in the button row.
      const layer = screen.getByTestId('game-board-layer');
      expect(within(layer).getByLabelText('Dice 6-1, 2 left to play')).toBeOnTheScreen();
      const dice = screen.getByTestId('dice-row');
      const path = nativePath(dice);
      // A move fades a die; the canvas stays in its native views.
      await touch(PAN, [stackPosition(geo, { kind: 'point', index: 8 }, 3, 2)]);
      await touch(PAN, [center(slotRect(geo, { kind: 'point', index: 7 }))]);
      expect(played(store)).toEqual(['8/7']);
      expect(screen.getByTestId('dice-row') === dice).toBe(true);
      expect(nativePath(screen.getByTestId('dice-row'))).toBe(path);
      // One row of two big buttons.
      expect(screen.getByTestId('undo-button')).toBeOnTheScreen();
      expect(screen.getByTestId('confirm-button')).toBeOnTheScreen();
    });
  });

  it('follows a change of the setting during a game at once', async () => {
    await setSettings({ boardLayout: 'tall' });
    const store = await whiteToMove61('tall');
    await act(async () => {
      settingsStore.getState().setSetting('boardLayout', 'classic');
    });
    expect(screen.getByTestId('game-middle')).toBeOnTheScreen();
    // The new board measures its space again.
    await act(async () => {
      fireEvent(screen.getByTestId('game-board', hidden), 'layout', {
        nativeEvent: { layout: { x: 0, y: 0, ...SPACE.classic } },
      });
    });
    const geo = geoFor('classic');
    await touch(PAN, [stackPosition(geo, { kind: 'point', index: 8 }, 3, 2)]);
    await touch(PAN, [center(slotRect(geo, { kind: 'point', index: 7 }))]);
    expect(played(store)).toEqual(['8/7']);
  });
});

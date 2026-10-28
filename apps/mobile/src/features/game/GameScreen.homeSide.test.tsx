/**
 * Settings → Home board: bottom left (#175). The board is mirrored left to
 * right, and every game must play on it with real touches: Portes (hits and
 * the bar), Plakoto (pins), Fevga and Asodio (the "to enter" stack), in
 * flip and in fixed view.
 */
import { createSeededRng, resolveRules, type PlayerId } from '@tavli/engine';
import { getTheme } from '@tavli/themes';
import { act, fireEvent, screen } from '@testing-library/react-native';

import { portraitLayout } from '@/features/board/BoardCanvas';
import { fitBoardWithShadow, slotRect, stackPosition } from '@/features/board/geometry';
import { buildSources } from '@/features/board/interaction';
import { DEFAULT_SETTINGS, type BoardFlipMode } from '@/features/settings/settings';
import { settingsStore } from '@/features/settings/store';

import { createGameStore, turnView, type GameStore } from './gameStore';
import { GameScreen } from './GameScreen';
import { openingStatus } from './opening';
import { passNotice } from './turnNotices';

import { runOnFakeTimers } from '../../../test/clock';
import { touch } from '../../../test/gestureHandlerMock';
import { pressOpeningRoll } from '../../../test/openingRoll';
import { renderWithRoot } from '../../../test/render';

const SIZE = { width: 375, height: 520 };
const theme = getTheme('walnut-kafeneio');
const normal = fitBoardWithShadow(portraitLayout(theme, 'right'), SIZE);
const mirrored = fitBoardWithShadow(portraitLayout(theme, 'left'), SIZE);
const PAN = 'game-board-pan';

const center = (r: { x: number; y: number; width: number; height: number }) => ({
  x: r.x + r.width / 2,
  y: r.y + r.height / 2,
});

type Game = 'portes' | 'plakoto' | 'fevga' | 'asodio';

/** One game of `game` (Asodio: the owner version the app plays). */
function newStore(game: Game, seed: number): GameStore {
  const preset = game === 'asodio' ? 'asodio.kafeneio' : game;
  return createGameStore({
    players: { white: 'Ann', black: 'Bob' },
    targetPoints: 1,
    rules: resolveRules(preset, { match: { rotation: [game] } }),
    rng: createSeededRng(seed),
  });
}

async function show(store: GameStore) {
  await renderWithRoot(<GameScreen store={store} />);
  await act(async () => {
    fireEvent(screen.getByTestId('game-board', { includeHiddenElements: true }), 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, ...SIZE } },
    });
  });
}

const press = async (testID: string) => {
  await act(async () => {
    fireEvent.press(screen.getByTestId(testID));
  });
};

async function setSettings(homeBoardSide: 'right' | 'left', boardFlipMode: BoardFlipMode) {
  await act(async () => {
    settingsStore.setState({ ...DEFAULT_SETTINGS, homeBoardSide, boardFlipMode });
  });
}

/** The sources of the player to move, on the mirrored board, as the screen sees them. */
function sourcesNow(store: GameStore, flipMode: BoardFlipMode) {
  const view = turnView(store.getState().flow);
  const viewer: PlayerId = flipMode === 'flip' ? view.toMove : 'white';
  const boardView = { viewer, direction: view.game.state.rules.movement.direction };
  return buildSources(mirrored, view.board, boardView, view.toMove, view.legal);
}

/**
 * Plays the match to its end on the mirrored board with taps only: roll,
 * tap a checker, tap a target, confirm, close the cards. Plakoto's mother
 * question is answered "play on". Returns how many moves were tapped.
 */
async function playToTheEnd(store: GameStore, flipMode: BoardFlipMode) {
  let moves = 0;
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
      const sources = sourcesNow(store, flipMode);
      // Vary the moves a little: the last source, its first target.
      const source = sources[sources.length - 1]!;
      const target = source.targets[0]!;
      await touch(PAN, [center(source.rect)]);
      await touch(PAN, [center(target.rect)]);
      expect(store.getState().flow.log.length).toBeGreaterThan(flow.log.length);
      moves++;
    }
  }
  expect(steps).toBeLessThan(4000);
  return moves;
}

// The game screen closes its cards on timers (see test/clock.ts).
runOnFakeTimers();

afterEach(async () => {
  await act(async () => {
    settingsStore.setState({ ...DEFAULT_SETTINGS });
  });
});

describe('<GameScreen /> with the home board on the bottom left', () => {
  const cases: [Game, BoardFlipMode, number][] = [
    ['portes', 'flip', 3],
    ['plakoto', 'fixed', 7],
    ['fevga', 'flip', 11],
    ['asodio', 'flip', 5],
  ];
  it.each(cases)(
    'plays a whole %s game (%s view) with taps on the mirrored board',
    async (game, flipMode, seed) => {
      await setSettings('left', flipMode);
      const store = newStore(game, seed);
      await show(store);
      const moves = await playToTheEnd(store, flipMode);
      expect(moves).toBeGreaterThan(10);
      // The game is over (a win, or a draw in Plakoto and Asodio).
      expect(store.getState().flow.game.result).not.toBeNull();
    },
    120_000,
  );

  it('moves by drag to the mirrored place, and not to the old one', async () => {
    await setSettings('left', 'flip');
    const store = createGameStore({
      players: { white: 'Ann', black: 'Bob' },
      rng: createSeededRng(5),
    });
    store.getState().dispatch({ type: 'rollOpening', player: 'white', die: 6 });
    store.getState().dispatch({ type: 'rollOpening', player: 'black', die: 1 });
    await show(store);
    await press('opening-overlay');
    const played = () => store.getState().flow.game.played.map((m) => `${m.from}/${m.to}`);

    // 13/7 dropped where point 7 is on the normal board: that is point 18 now.
    const from = stackPosition(mirrored, { kind: 'point', index: 13 }, 5, 4);
    const old7 = center(slotRect(normal, { kind: 'point', index: 7 }));
    await touch(PAN, [from, { x: from.x + 30, y: from.y + 30 }, old7]);
    expect(played()).toEqual([]);

    // On the mirrored point 7 it moves.
    const to7 = center(slotRect(mirrored, { kind: 'point', index: 7 }));
    await touch(PAN, [from, { x: from.x + 30, y: from.y + 30 }, to7]);
    expect(played()).toEqual(['13/7']);
  });

  it('follows a change of the setting during a game at once', async () => {
    await setSettings('right', 'flip');
    const store = createGameStore({
      players: { white: 'Ann', black: 'Bob' },
      rng: createSeededRng(5),
    });
    store.getState().dispatch({ type: 'rollOpening', player: 'white', die: 6 });
    store.getState().dispatch({ type: 'rollOpening', player: 'black', die: 1 });
    await show(store);
    await press('opening-overlay');
    await act(async () => {
      settingsStore.getState().setSetting('homeBoardSide', 'left');
    });
    // Tap-tap 8/7 on the mirrored places.
    await touch(PAN, [stackPosition(mirrored, { kind: 'point', index: 8 }, 3, 2)]);
    await touch(PAN, [center(slotRect(mirrored, { kind: 'point', index: 7 }))]);
    expect(store.getState().flow.game.played.map((m) => `${m.from}/${m.to}`)).toEqual(['8/7']);
  });
});

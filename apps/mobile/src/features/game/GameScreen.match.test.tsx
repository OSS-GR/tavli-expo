import { createSeededRng } from '@tavli/engine';
import { getLayout, getTheme } from '@tavli/themes';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';

import { fitBoardWithShadow } from '@/features/board/geometry';
import { buildSources } from '@/features/board/interaction';
import { DEFAULT_SETTINGS } from '@/features/settings/settings';
import { settingsStore } from '@/features/settings/store';

import { createGameStore, turnView } from './gameStore';
import { GameScreen, MATCH_END_DELAY_MS } from './GameScreen';
import { openingStatus } from './opening';
import { passNotice } from './turnNotices';

import { runOnFakeTimers } from '../../../test/clock';
import { touch } from '../../../test/gestureHandlerMock';
import { pressOpeningRoll } from '../../../test/openingRoll';
import { renderWithRoot } from '../../../test/render';

const SIZE = { width: 375, height: 520 };
const geo = fitBoardWithShadow(getLayout(getTheme('walnut-kafeneio'), 'portrait-rotated'), SIZE);

const center = (r: { x: number; y: number; width: number; height: number }) => ({
  x: r.x + r.width / 2,
  y: r.y + r.height / 2,
});

// The game screen closes its cards on timers (see test/clock.ts).
runOnFakeTimers();

beforeEach(async () => {
  await act(async () => {
    settingsStore.setState({ ...DEFAULT_SETTINGS });
  });
});

/**
 * A whole match through the screen, as two players would play it: roll,
 * tap a checker, tap a target, confirm, close the cards, next game, and
 * at the end the screen asks for the match-end screen.
 * By default a match to 1 (about 5 s). `FULL_MATCH=1` plays to 3 (about 15 s).
 */
const TARGET = process.env['FULL_MATCH'] === '1' ? 3 : 1;

it(`plays a pass-and-play match to ${TARGET} with taps only`, async () => {
  const store = createGameStore({
    players: { white: 'Ann', black: 'Bob' },
    targetPoints: TARGET,
    rng: createSeededRng(2026),
  });
  const onMatchOver = jest.fn();
  await renderWithRoot(<GameScreen store={store} onMatchOver={onMatchOver} />);
  await act(async () => {
    fireEvent(screen.getByTestId('game-board', { includeHiddenElements: true }), 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, ...SIZE } },
    });
  });
  const press = async (testID: string) => {
    await act(async () => {
      fireEvent.press(screen.getByTestId(testID));
    });
  };

  let steps = 0;
  for (; steps < 3000; steps++) {
    const { flow } = store.getState();
    const view = turnView(flow);
    if (view.matchPhase === 'match-over') break;
    // Close any card first, as a player would. The store says which card
    // may show; the screen says if it is still there.
    const card = (testID: string) => screen.queryByTestId(testID) !== null;
    if (view.matchPhase === 'game-over') await press('next-game-button');
    else if (passNotice(flow) && card('pass-ok-button')) await press('pass-ok-button');
    else if (view.phase === 'opening-roll') await pressOpeningRoll();
    else if (openingStatus(view.game) && card('opening-overlay')) await press('opening-overlay');
    else if (view.phase === 'awaiting-roll') await press('roll-button');
    else if (view.phase === 'awaiting-confirm') await press('confirm-button');
    else {
      // Flip view: the player to move is at the bottom.
      const boardView = { viewer: view.toMove, direction: 'contrary' as const };
      const sources = buildSources(geo, view.board, boardView, view.toMove, view.legal);
      const source = sources[0]!;
      const target = source.targets[0]!;
      await touch('game-board-pan', [center(source.rect)]);
      await touch('game-board-pan', [center(target.rect)]);
      expect(store.getState().flow.log.length).toBeGreaterThan(flow.log.length);
    }
  }

  const { match } = store.getState().flow;
  expect(match.status).toBe('finished');
  expect(Math.max(match.score.white, match.score.black)).toBeGreaterThanOrEqual(TARGET);
  // No game-end sheet for the last game: the match-end screen opens.
  expect(screen.queryByTestId('game-end-card')).toBeNull();
  await waitFor(() => expect(onMatchOver).toHaveBeenCalledTimes(1), {
    timeout: MATCH_END_DELAY_MS + 2000,
  });
  expect(steps).toBeLessThan(3000);
}, 120_000);

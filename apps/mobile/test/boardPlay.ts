/**
 * Plays a whole match on the game screen with real touches (tap-tap and
 * drag), for the board layout tests (#184, #185).
 */
import type { PlayerId } from '@tavli/engine';
import { act, fireEvent, screen } from '@testing-library/react-native';

import type { BoardGeometry } from '@/features/board/geometry';
import { buildSources } from '@/features/board/interaction';
import { turnView, type GameStore } from '@/features/game/gameStore';
import { openingStatus } from '@/features/game/opening';
import { passNotice } from '@/features/game/turnNotices';
import type { BoardFlipMode } from '@/features/settings/settings';

import { touch } from './gestureHandlerMock';
import { pressOpeningRoll } from './openingRoll';

const PAN = 'game-board-pan';

export const center = (r: { x: number; y: number; width: number; height: number }) => ({
  x: r.x + r.width / 2,
  y: r.y + r.height / 2,
});

export const press = async (testID: string) => {
  await act(async () => {
    fireEvent.press(screen.getByTestId(testID));
  });
};

/** The sources of the player to move, as the screen sees them. */
export function sourcesNow(store: GameStore, geo: BoardGeometry, flipMode: BoardFlipMode) {
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
export async function playToTheEnd(store: GameStore, geo: BoardGeometry, flipMode: BoardFlipMode) {
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

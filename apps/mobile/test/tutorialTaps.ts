/**
 * Plays the tutorial (#128, #149) like a finger would: tap a lit checker,
 * then its target. `game` picks the lesson set (default Portes). The taps
 * follow Settings → Home board (#175), like the board does, and the window:
 * in a landscape window (`test/window.ts`) the board is the classic one (#185).
 */
import { currentBoard } from '@tavli/engine';
import { getTheme } from '@tavli/themes';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { Dimensions } from 'react-native';

import { boardLayout } from '@/features/board/BoardCanvas';
import type { BoardView } from '@/features/board/boardModel';
import { fitBoardWithShadow, slotRect, type ScreenRect } from '@/features/board/geometry';
import { buildSources } from '@/features/board/interaction';
import { isLandscapeWindow } from '@/features/board/screenLayout';
import { settingsStore } from '@/features/settings/store';
import {
  LESSON_SETS,
  lessonDirection,
  lessonMoves,
  playLessonMove,
  startLesson,
  type TutorialGame,
} from '@/features/tutorial/lessons';

import { touch } from './gestureHandlerMock';

export const TUTORIAL_BOARD_SIZE = { width: 375, height: 460 };
/** The board's space in a landscape window: right of the lesson column. */
export const TUTORIAL_LANDSCAPE_BOARD_SIZE = { width: 410, height: 340 };

const landscapeNow = () => isLandscapeWindow(Dimensions.get('window'));
const boardSize = () => (landscapeNow() ? TUTORIAL_LANDSCAPE_BOARD_SIZE : TUTORIAL_BOARD_SIZE);

/** The tutorial board as drawn now (it follows the home board side in Settings and the window). */
export const tutorialGeo = () =>
  fitBoardWithShadow(
    boardLayout(
      getTheme('walnut-kafeneio'),
      landscapeNow() ? 'classic' : 'tall',
      settingsStore.getState().homeBoardSide,
    ),
    boardSize(),
  );
const viewOf = (game: TutorialGame): BoardView => ({
  viewer: 'white',
  direction: lessonDirection(game),
});
const PAN = 'tutorial-board-pan';

export const center = (r: ScreenRect) => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });

/** Gives the tutorial board its size, so it draws and takes touches. */
export async function layoutTutorialBoard(): Promise<void> {
  await act(async () => {
    fireEvent(screen.getByTestId('tutorial-board'), 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, ...boardSize() } },
    });
  });
}

/** The lit checkers of lesson `index` at its start, in screen points. */
export function tutorialSources(index: number, game: TutorialGame = 'portes') {
  const lesson = LESSON_SETS[game][index]!;
  const flow = startLesson(lesson);
  return buildSources(
    tutorialGeo(),
    currentBoard(flow),
    viewOf(game),
    'white',
    lessonMoves(lesson, flow),
  );
}

/** Plays lesson `index` to the end with taps only (the board must be laid out). */
export async function playLessonByTaps(
  index: number,
  game: TutorialGame = 'portes',
): Promise<void> {
  const lesson = LESSON_SETS[game][index]!;
  let flow = startLesson(lesson);
  while (!lesson.done(flow)) {
    const sources = buildSources(
      tutorialGeo(),
      currentBoard(flow),
      viewOf(game),
      'white',
      lessonMoves(lesson, flow),
    );
    const source = sources[0]!;
    const target = source.targets[0]!;
    await touch(PAN, [center(source.rect)]);
    await touch(PAN, [center(target.rect)]);
    flow = playLessonMove(lesson, flow, target.move)!;
  }
}

/** Taps point `index` (default 6: your checkers there are not lit in Portes lessons 1 to 6). */
export async function tapWrongPlace(index = 6): Promise<void> {
  await touch(PAN, [center(slotRect(tutorialGeo(), { kind: 'point', index }))]);
}

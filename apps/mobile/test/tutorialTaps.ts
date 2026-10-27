/** Plays the tutorial (#128) like a finger would: tap a lit checker, then its target. */
import { currentBoard } from '@tavli/engine';
import { getLayout, getTheme } from '@tavli/themes';
import { act, fireEvent, screen } from '@testing-library/react-native';

import type { BoardView } from '@/features/board/boardModel';
import { fitBoardWithShadow, slotRect, type ScreenRect } from '@/features/board/geometry';
import { buildSources } from '@/features/board/interaction';
import { LESSONS, lessonMoves, playLessonMove, startLesson } from '@/features/tutorial/lessons';

import { touch } from './gestureHandlerMock';

export const TUTORIAL_BOARD_SIZE = { width: 375, height: 460 };
export const tutorialGeo = fitBoardWithShadow(
  getLayout(getTheme('walnut-kafeneio'), 'portrait-rotated'),
  TUTORIAL_BOARD_SIZE,
);
const VIEW: BoardView = { viewer: 'white', direction: 'contrary' };
const PAN = 'tutorial-board-pan';

export const center = (r: ScreenRect) => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });

/** Gives the tutorial board its size, so it draws and takes touches. */
export async function layoutTutorialBoard(): Promise<void> {
  await act(async () => {
    fireEvent(screen.getByTestId('tutorial-board'), 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, ...TUTORIAL_BOARD_SIZE } },
    });
  });
}

/** The lit checkers of lesson `index` at its start, in screen points. */
export function tutorialSources(index: number) {
  const lesson = LESSONS[index]!;
  const flow = startLesson(lesson);
  return buildSources(tutorialGeo, currentBoard(flow), VIEW, 'white', lessonMoves(lesson, flow));
}

/** Plays lesson `index` to the end with taps only (the board must be laid out). */
export async function playLessonByTaps(index: number): Promise<void> {
  const lesson = LESSONS[index]!;
  let flow = startLesson(lesson);
  while (!lesson.done(flow)) {
    const sources = buildSources(
      tutorialGeo,
      currentBoard(flow),
      VIEW,
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

/** Taps your checkers on point 6: not lit in lessons 1 to 6. */
export async function tapWrongPlace(): Promise<void> {
  await touch(PAN, [center(slotRect(tutorialGeo, { kind: 'point', index: 6 }))]);
}

import type { createRecordingFeedback } from '@tavli/contracts';
import { getTheme } from '@tavli/themes';
import { act, fireEvent, screen, within } from '@testing-library/react-native';
import * as Reanimated from 'react-native-reanimated';

import { moveChoices, moveLabel } from '@/features/accessibility/moveList';
import { DEFAULT_SETTINGS } from '@/features/settings/settings';
import { settingsStore } from '@/features/settings/store';
import i18n from '@/i18n';
import { feedback } from '@/services';

import { LESSONS, lessonMoves, playLessonMove, startLesson } from './lessons';
import { TutorialScreen, type TutorialScreenProps } from './TutorialScreen';

import { touch } from '../../../test/gestureHandlerMock';
import { renderWithRoot } from '../../../test/render';
import { countNodes, findAllNodes, type JsonNode } from '../../../test/tree';
import {
  center,
  layoutTutorialBoard,
  playLessonByTaps,
  tapWrongPlace,
  tutorialSources,
} from '../../../test/tutorialTaps';
import { LANDSCAPE_SE, PORTRAIT_SE, resetWindow, setWindow } from '../../../test/window';

const haptics = feedback as ReturnType<typeof createRecordingFeedback>;

function callbacks(): jest.Mocked<TutorialScreenProps> {
  return {
    onLessonDone: jest.fn(),
    onFinished: jest.fn(),
    onSkip: jest.fn(),
    onPlay: jest.fn(),
    onHome: jest.fn(),
  };
}

async function open(props = callbacks()) {
  await renderWithRoot(<TutorialScreen {...props} />);
  await layoutTutorialBoard();
  haptics.calls.length = 0;
  return props;
}

const press = async (testID: string) => {
  await act(async () => {
    fireEvent.press(screen.getByTestId(testID));
  });
};

/** The "touch this" rings on the board: the lit checkers, or the selected one. */
function selectRings(): number {
  const color = getTheme('walnut-kafeneio').highlights.select.color;
  return findAllNodes(
    screen.toJSON() as JsonNode,
    (n) => n.type === 'Circle' && n.props['style'] === 'stroke' && n.props['color'] === color,
  ).length;
}

beforeEach(async () => {
  jest.restoreAllMocks();
  await act(async () => {
    settingsStore.setState({ ...DEFAULT_SETTINGS });
    await i18n.changeLanguage('en');
  });
});

describe('<TutorialScreen />', () => {
  it('runs the whole tutorial with taps only', async () => {
    const props = await open();

    for (const [i, lesson] of LESSONS.entries()) {
      expect(screen.getByTestId('tutorial-progress')).toHaveTextContent(
        `Lesson ${i + 1} of ${LESSONS.length}`,
      );
      expect(
        screen.getByRole('header', { name: i18n.t(`tutorial.lessons.${lesson.id}.title`) }),
      ).toBeOnTheScreen();
      // Skip is always there; Next only after success.
      expect(screen.getByRole('button', { name: 'Skip' })).toBeOnTheScreen();
      expect(screen.queryByTestId('tutorial-next')).not.toBeOnTheScreen();
      // The screen reader hears what this lesson asks.
      expect(screen.getByTestId('tutorial-board')).toHaveAccessibleName(
        i18n.t(`tutorial.lessons.${lesson.id}.board`),
      );

      await playLessonByTaps(i);

      expect(props.onLessonDone).toHaveBeenLastCalledWith(i + 1, lesson.id);
      expect(screen.getByTestId('tutorial-success')).toHaveTextContent(
        i18n.t(`tutorial.lessons.${lesson.id}.done`),
      );
      // The last lesson counts as done at once, before Next (Back may leave now).
      expect(props.onFinished).toHaveBeenCalledTimes(i === LESSONS.length - 1 ? 1 : 0);
      await press('tutorial-next');
    }

    expect(props.onLessonDone).toHaveBeenCalledTimes(LESSONS.length);
    expect(props.onFinished).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('header', { name: 'You know the basics!' })).toBeOnTheScreen();
    await press('tutorial-play');
    expect(props.onPlay).toHaveBeenCalledTimes(1);
    await press('tutorial-home');
    expect(props.onHome).toHaveBeenCalledTimes(1);
    expect(props.onSkip).not.toHaveBeenCalled();
  });

  it('runs every lesson with the move list, which offers only the lesson’s moves', async () => {
    await act(async () => {
      settingsStore.setState({ ...DEFAULT_SETTINGS, moveList: 'on' });
    });
    const props = await open();

    for (const [i, lesson] of LESSONS.entries()) {
      let flow = startLesson(lesson);
      while (!lesson.done(flow)) {
        const offered = moveChoices(lessonMoves(lesson, flow));
        const list = within(screen.getByTestId('tutorial-move-list'));
        // Only the lesson's moves: as many buttons as moves the lesson takes.
        expect(list.getAllByRole('button')).toHaveLength(offered.length);
        const move = offered[0]!;
        await act(async () => {
          fireEvent.press(list.getByRole('button', { name: moveLabel(i18n.t, move) }));
        });
        flow = playLessonMove(lesson, flow, move)!;
      }
      expect(props.onLessonDone).toHaveBeenLastCalledWith(i + 1, lesson.id);
      // Done: no moves left to offer.
      expect(screen.queryByTestId('tutorial-move-list')).not.toBeOnTheScreen();
      await act(async () => {
        fireEvent.press(screen.getByRole('button', { name: 'Next' }));
      });
    }
    expect(props.onFinished).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('header', { name: 'You know the basics!' })).toBeOnTheScreen();
  });

  it('names the lesson moves in plain words', async () => {
    await act(async () => {
      settingsStore.setState({ ...DEFAULT_SETTINGS, moveList: 'on' });
    });
    await open();
    // Lesson 1: only 13 → 9 with the 4 (the 2 is not part of the lesson).
    const list = within(screen.getByTestId('tutorial-move-list'));
    expect(list.getAllByRole('button')).toHaveLength(1);
    expect(
      list.getByRole('button', { name: 'Checker from point 13 to point 9' }),
    ).toBeOnTheScreen();
  });

  it('hides the move list by default (no screen reader)', async () => {
    await open();
    expect(screen.queryByTestId('tutorial-move-list')).not.toBeOnTheScreen();
  });

  it('rings the checker to touch, then shows its target', async () => {
    await open();
    expect(selectRings()).toBe(1);
    expect(countNodes(screen.toJSON() as JsonNode, 'DashPathEffect')).toBe(0);
    const [source] = tutorialSources(0);
    await touch('tutorial-board-pan', [center(source!.rect)]);
    // Selected: one target ring (13 → 9 with the 4).
    expect(countNodes(screen.toJSON() as JsonNode, 'DashPathEffect')).toBe(1);
  });

  it('rings both checkers of the "make a door" lesson', async () => {
    await open();
    for (let i = 0; i < 3; i++) {
      await playLessonByTaps(i);
      await press('tutorial-next');
    }
    expect(selectRings()).toBe(2);
  });

  it('shakes and shows a hint after a wrong touch', async () => {
    const shake = jest.spyOn(Reanimated, 'withSequence');
    await open();
    expect(screen.queryByTestId('tutorial-hint')).not.toBeOnTheScreen();

    await tapWrongPlace();

    expect(screen.getByTestId('tutorial-hint')).toHaveTextContent(
      'Move the lit checker 4 points, with the 4.',
    );
    expect(shake).toHaveBeenCalledTimes(1);
    expect(haptics.calls).toContain('warning');
  });

  it('shows a hint when the picked checker goes to the wrong place', async () => {
    await open();
    const [source] = tutorialSources(0);
    await touch('tutorial-board-pan', [center(source!.rect)]);
    await tapWrongPlace();
    expect(screen.getByTestId('tutorial-hint')).toBeOnTheScreen();
    expect(screen.queryByTestId('tutorial-next')).not.toBeOnTheScreen();
  });

  it('with Reduce motion on, shows the hint without a shake', async () => {
    jest.spyOn(Reanimated, 'useReducedMotion').mockReturnValue(true);
    const shake = jest.spyOn(Reanimated, 'withSequence');
    await open();
    await tapWrongPlace();
    expect(screen.getByTestId('tutorial-hint')).toBeOnTheScreen();
    expect(shake).not.toHaveBeenCalled();
    // Checkers jump to their place: lesson 1 still works.
    await playLessonByTaps(0);
    expect(screen.getByTestId('tutorial-next')).toBeOnTheScreen();
  });

  it('skips from any lesson', async () => {
    const props = await open();
    await press('tutorial-skip');
    expect(props.onSkip).toHaveBeenLastCalledWith(1, 'move');
    await playLessonByTaps(0);
    await press('tutorial-next');
    await press('tutorial-skip');
    expect(props.onSkip).toHaveBeenLastCalledWith(2, 'bothDice');
    expect(props.onFinished).not.toHaveBeenCalled();
  });

  it('speaks Greek', async () => {
    await act(async () => {
      await i18n.changeLanguage('el');
    });
    await open();
    expect(screen.getByTestId('tutorial-progress')).toHaveTextContent('Μάθημα 1 από 7');
    expect(screen.getByRole('button', { name: 'Παράλειψη' })).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'Κίνησε ένα πούλι' })).toBeOnTheScreen();
  });
});

describe('<TutorialScreen /> in landscape (#185)', () => {
  afterEach(async () => {
    await resetWindow();
  });

  it('puts the lesson in a left column and plays on the classic board', async () => {
    await setWindow(LANDSCAPE_SE);
    const props = await open();
    const side = screen.getByTestId('tutorial-side');
    expect(within(side).getByTestId('tutorial-card')).toBeOnTheScreen();
    expect(within(side).getByTestId('tutorial-dice')).toBeOnTheScreen();
    // `playLessonByTaps` taps the classic board's drawn places in a landscape window.
    await playLessonByTaps(0);
    expect(props.onLessonDone).toHaveBeenCalledWith(1, LESSONS[0]!.id);
    expect(within(side).getByTestId('tutorial-next')).toBeOnTheScreen();
  });

  it('keeps the lesson and a picked-up checker when the phone turns', async () => {
    await setWindow(PORTRAIT_SE);
    const props = await open();
    const board = screen.getByTestId('tutorial-board');
    const [source] = tutorialSources(0);
    await touch('tutorial-board-pan', [center(source!.rect)]);
    expect(countNodes(screen.toJSON() as JsonNode, 'DashPathEffect')).toBe(1);

    await setWindow(LANDSCAPE_SE);
    await layoutTutorialBoard();
    expect(screen.getByTestId('tutorial-board')).toBe(board);
    expect(screen.getByTestId('tutorial-side')).toBeOnTheScreen();
    // Still picked up: its target ring shows, and one tap on it in the new place moves it.
    expect(countNodes(screen.toJSON() as JsonNode, 'DashPathEffect')).toBe(1);
    const [turned] = tutorialSources(0);
    await touch('tutorial-board-pan', [center(turned!.targets[0]!.rect)]);
    expect(props.onLessonDone).toHaveBeenCalledWith(1, LESSONS[0]!.id);
  });
});

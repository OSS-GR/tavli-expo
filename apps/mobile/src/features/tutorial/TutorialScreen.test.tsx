import type { createRecordingFeedback } from '@tavli/contracts';
import { getTheme } from '@tavli/themes';
import { act, fireEvent, screen } from '@testing-library/react-native';
import * as Reanimated from 'react-native-reanimated';

import { DEFAULT_SETTINGS } from '@/features/settings/settings';
import { settingsStore } from '@/features/settings/store';
import i18n from '@/i18n';
import { feedback } from '@/services';

import { LESSONS } from './lessons';
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
      expect(props.onFinished).not.toHaveBeenCalled();
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

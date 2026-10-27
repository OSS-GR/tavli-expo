/** The Plakoto and Fevga lessons (#149) on the screen: taps, the move list, the mother card. */
import { act, fireEvent, screen, within } from '@testing-library/react-native';

import { moveChoices, moveLabel } from '@/features/accessibility/moveList';
import { DEFAULT_SETTINGS } from '@/features/settings/settings';
import { settingsStore } from '@/features/settings/store';
import i18n from '@/i18n';

import {
  LESSON_SETS,
  lessonMoves,
  playLessonMove,
  startLesson,
  type TutorialGame,
} from './lessons';
import { TutorialScreen, type TutorialScreenProps } from './TutorialScreen';

import { renderWithRoot } from '../../../test/render';
import { layoutTutorialBoard, playLessonByTaps, tapWrongPlace } from '../../../test/tutorialTaps';

function callbacks(): jest.Mocked<TutorialScreenProps> {
  return {
    onLessonDone: jest.fn(),
    onFinished: jest.fn(),
    onSkip: jest.fn(),
    onPlay: jest.fn(),
    onHome: jest.fn(),
  };
}

async function open(game: TutorialGame, props = callbacks()) {
  await renderWithRoot(<TutorialScreen game={game} {...props} />);
  await layoutTutorialBoard();
  return props;
}

const press = async (testID: string) => {
  await act(async () => {
    fireEvent.press(screen.getByTestId(testID));
  });
};

const GAMES = [
  ['plakoto', 'Learn Plakoto', 'You know Plakoto!', 'Play Plakoto'],
  ['fevga', 'Learn Fevga', 'You know Fevga!', 'Play Fevga'],
] as const;

beforeEach(async () => {
  await act(async () => {
    settingsStore.setState({ ...DEFAULT_SETTINGS });
    await i18n.changeLanguage('en');
  });
});

describe('<TutorialScreen game="plakoto|fevga" />', () => {
  it.each(GAMES)(
    'runs the %s lessons to the end with taps only',
    async (game, title, end, play) => {
      const props = await open(game);
      const lessons = LESSON_SETS[game];
      expect(screen.getByRole('header', { name: title })).toBeOnTheScreen();

      for (const [i, lesson] of lessons.entries()) {
        expect(screen.getByTestId('tutorial-progress')).toHaveTextContent(
          `Lesson ${i + 1} of ${lessons.length}`,
        );
        expect(
          screen.getByRole('header', { name: i18n.t(`tutorial.lessons.${lesson.id}.title`) }),
        ).toBeOnTheScreen();
        expect(screen.getByTestId('tutorial-board')).toHaveAccessibleName(
          i18n.t(`tutorial.lessons.${lesson.id}.board`),
        );
        expect(screen.queryByTestId('tutorial-next')).not.toBeOnTheScreen();

        await playLessonByTaps(i, game);

        expect(props.onLessonDone).toHaveBeenLastCalledWith(i + 1, lesson.id);
        expect(screen.getByTestId('tutorial-success')).toHaveTextContent(
          i18n.t(`tutorial.lessons.${lesson.id}.done`),
        );
        await press('tutorial-next');
      }

      expect(props.onLessonDone).toHaveBeenCalledTimes(lessons.length);
      expect(props.onFinished).toHaveBeenCalledTimes(1);
      expect(screen.getByRole('header', { name: end })).toBeOnTheScreen();
      await act(async () => {
        fireEvent.press(screen.getByRole('button', { name: play }));
      });
      expect(props.onPlay).toHaveBeenCalledTimes(1);
      expect(props.onSkip).not.toHaveBeenCalled();
    },
  );

  it.each(GAMES)('runs the %s lessons with the move list', async (game, _title, end) => {
    await act(async () => {
      settingsStore.setState({ ...DEFAULT_SETTINGS, moveList: 'on' });
    });
    const props = await open(game);

    for (const [i, lesson] of LESSON_SETS[game].entries()) {
      let flow = startLesson(lesson);
      while (!lesson.done(flow)) {
        const offered = moveChoices(lessonMoves(lesson, flow));
        const list = within(screen.getByTestId('tutorial-move-list'));
        expect(list.getAllByRole('button')).toHaveLength(offered.length);
        const move = offered[0]!;
        await act(async () => {
          fireEvent.press(list.getByRole('button', { name: moveLabel(i18n.t, move) }));
        });
        flow = playLessonMove(lesson, flow, move)!;
      }
      expect(props.onLessonDone).toHaveBeenLastCalledWith(i + 1, lesson.id);
      expect(screen.queryByTestId('tutorial-move-list')).not.toBeOnTheScreen();
      await act(async () => {
        fireEvent.press(screen.getByRole('button', { name: 'Next' }));
      });
    }
    expect(props.onFinished).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('header', { name: end })).toBeOnTheScreen();
  });

  it('names the pin in the move list', async () => {
    await act(async () => {
      settingsStore.setState({ ...DEFAULT_SETTINGS, moveList: 'on' });
    });
    await open('plakoto');
    const list = within(screen.getByTestId('tutorial-move-list'));
    expect(
      list.getByRole('button', { name: 'Checker from point 13 to point 9, pins' }),
    ).toBeOnTheScreen();
  });

  it('shows the hint when the pinned checker is touched', async () => {
    await open('plakoto');
    await playLessonByTaps(0, 'plakoto');
    await press('tutorial-next');
    await tapWrongPlace(16);
    expect(screen.getByTestId('tutorial-hint')).toHaveTextContent(
      'Your checker on point 16 is pinned and cannot move. Move the lit checker.',
    );
  });

  it('ends the mother lesson with the "resign or play on" card', async () => {
    await open('plakoto');
    for (let i = 0; i < 2; i++) {
      await playLessonByTaps(i, 'plakoto');
      await press('tutorial-next');
    }
    expect(screen.queryByTestId('tutorial-mother-card')).not.toBeOnTheScreen();
    await playLessonByTaps(2, 'plakoto');

    const card = within(screen.getByTestId('tutorial-mother-card'));
    expect(
      card.getByRole('header', { name: "Your opponent's mother is pinned" }),
    ).toBeOnTheScreen();
    // The same two answers as the game's mother card.
    await act(async () => {
      fireEvent.press(card.getByRole('button', { name: 'Resign (lose 2)' }));
    });
    expect(card.getByText('Resign: you win 2 points and the game ends.')).toBeOnTheScreen();
    await act(async () => {
      fireEvent.press(card.getByRole('button', { name: 'Play on' }));
    });
    expect(card.getByText(/^Play on: the game goes on\./)).toBeOnTheScreen();

    // Next leaves the card behind.
    await press('tutorial-next');
    expect(screen.queryByTestId('tutorial-mother-card')).not.toBeOnTheScreen();
  });

  it('skips with the lesson set’s own hint', async () => {
    const props = await open('fevga');
    expect(screen.getByRole('button', { name: 'Skip' })).toHaveProp(
      'accessibilityHint',
      'Leave the lesson. You can open it again from the Fevga rules page.',
    );
    await press('tutorial-skip');
    expect(props.onSkip).toHaveBeenLastCalledWith(1, 'sameWay');
  });

  it('speaks Greek', async () => {
    await act(async () => {
      await i18n.changeLanguage('el');
    });
    await open('fevga');
    expect(screen.getByRole('header', { name: 'Μάθε τη φεύγα' })).toBeOnTheScreen();
    expect(screen.getByTestId('tutorial-progress')).toHaveTextContent('Μάθημα 1 από 4');
    expect(screen.getByRole('header', { name: 'Προς την ίδια φορά' })).toBeOnTheScreen();
  });
});

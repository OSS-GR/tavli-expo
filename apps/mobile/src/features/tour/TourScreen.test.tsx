import { applyGameAction, currentBoard, legalNextMoves, type GameFlow } from '@tavli/engine';
import { getTheme } from '@tavli/themes';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';
import * as Reanimated from 'react-native-reanimated';

import { boardLayout } from '@/features/board/BoardCanvas';
import { fitBoardWithShadow } from '@/features/board/geometry';
import { buildSources } from '@/features/board/interaction';
import { settingsStore } from '@/features/settings/store';

import { tourPages, type TourOffers } from './pages';
import { TOUR_READ_MS } from './TimedNext';
import { TOUR_VIEW, startTourMove } from './tourBoard';
import { TourScreen, type TourScreenProps } from './TourScreen';

import { runOnFakeTimers } from '../../../test/clock';
import { touch } from '../../../test/gestureHandlerMock';
import { renderWithRoot } from '../../../test/render';
import { center } from '../../../test/tutorialTaps';

runOnFakeTimers();

afterEach(() => {
  // React Native's mock is a `jest.fn` itself: a restore keeps the value.
  jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockResolvedValue(false);
  jest.restoreAllMocks();
});

const ALL: TourOffers = { friend: true, ranked: true, friends: true, ratings: true };
const SIZE = { width: 375, height: 420 };

const geo = () =>
  fitBoardWithShadow(
    boardLayout(getTheme('walnut-kafeneio'), 'tall', settingsStore.getState().homeBoardSide),
    SIZE,
  );

function callbacks(): jest.Mocked<Pick<TourScreenProps, 'onSkip' | 'onLesson' | 'onFinish'>> {
  return { onSkip: jest.fn(), onLesson: jest.fn(), onFinish: jest.fn() };
}

async function open(offers: TourOffers = ALL, firstRun = true) {
  const props = callbacks();
  await renderWithRoot(
    <TourScreen pages={tourPages(offers)} offers={offers} firstRun={firstRun} {...props} />,
  );
  return props;
}

const press = async (testID: string) => {
  await act(async () => {
    fireEvent.press(screen.getByTestId(testID));
  });
};

const wait = async (ms: number) => {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
};

const nextEnabled = (id = 'tour-next') =>
  screen.getByTestId(id).props.accessibilityState?.disabled !== true;

async function layoutBoard(testID: string) {
  await act(async () => {
    fireEvent(screen.getByTestId(testID), 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, ...SIZE } },
    });
  });
}

/** Plays the roll page: Roll, then a swipe up the board. */
async function passRoll() {
  await layoutBoard('tour-roll-board');
  await press('tour-roll-button');
  await touch('tour-roll-board-pan', [
    { x: 180, y: 380 },
    { x: 185, y: 120 },
  ]);
  await wait(2000);
}

/** The lit checkers of the move page now, with their targets. */
function sources(flow: GameFlow) {
  return buildSources(geo(), currentBoard(flow), TOUR_VIEW, 'white', legalNextMoves(flow));
}

describe('TourScreen (#573)', () => {
  it('starts on the welcome page; Not now leaves', async () => {
    const props = await open();
    expect(screen.getByTestId('tour-title-welcome')).toBeTruthy();
    expect(screen.queryByTestId('tour-back')).toBeNull();
    await press('tour-not-now');
    expect(props.onSkip).toHaveBeenCalledTimes(1);
  });

  it('has Skip on every page, working at once', async () => {
    const props = await open();
    await press('tour-start');
    await press('tour-skip');
    expect(props.onSkip).toHaveBeenCalledTimes(1);
  });

  it('shows one bar per page', async () => {
    await open();
    expect(screen.getByTestId('tour-steps').props.accessibilityLabel).toBe('Step 1 of 8');
  });

  it('asks for a tap and a swipe on the roll page before Next works', async () => {
    await open();
    await press('tour-start');
    expect(screen.getByTestId('tour-title-roll')).toBeTruthy();
    await layoutBoard('tour-roll-board');
    expect(nextEnabled()).toBe(false);

    await press('tour-roll-button');
    expect(screen.getByTestId('tour-step-tap-done')).toBeTruthy();
    expect(screen.getByTestId('tour-step-swipe')).toBeTruthy();
    expect(nextEnabled()).toBe(false);

    await touch('tour-roll-board-pan', [
      { x: 180, y: 380 },
      { x: 185, y: 120 },
    ]);
    expect(screen.getByTestId('tour-step-swipe-done')).toBeTruthy();
    expect(screen.getByTestId('tour-roll-done')).toBeTruthy();
    // A try-it page does not wait for the clock: done is done.
    expect(nextEnabled()).toBe(true);
  });

  it('asks for a tap move, then a drag move, then Confirm', async () => {
    await open();
    await press('tour-start');
    await passRoll();
    await press('tour-next');
    expect(screen.getByTestId('tour-title-move')).toBeTruthy();
    await layoutBoard('tour-move-board');
    expect(nextEnabled()).toBe(false);

    // First move by tap: a lit checker, then its target.
    let flow = startTourMove();
    const first = sources(flow)[0]!;
    await touch('tour-move-board-pan', [center(first.rect)]);
    await touch('tour-move-board-pan', [center(first.targets[0]!.rect)]);
    expect(screen.getByTestId('tour-step-tap-done')).toBeTruthy();
    flow = applyGameAction(flow, { type: 'move', player: 'white', move: first.targets[0]!.move });
    await wait(500);

    // A second move by tap goes back, with a hint to drag.
    const second = sources(flow)[0]!;
    await touch('tour-move-board-pan', [center(second.rect)]);
    await touch('tour-move-board-pan', [center(second.targets[0]!.rect)]);
    expect(screen.getByTestId('tour-move-hint')).toHaveTextContent(/Drag this time/);
    expect(screen.queryByTestId('tour-step-drag-done')).toBeNull();

    // By drag it is taken.
    await touch('tour-move-board-pan', [center(second.rect), center(second.targets[0]!.rect)]);
    expect(screen.getByTestId('tour-step-drag-done')).toBeTruthy();
    expect(nextEnabled()).toBe(false);

    await press('tour-confirm');
    expect(screen.getByTestId('tour-step-confirm-done')).toBeTruthy();
    expect(screen.getByTestId('tour-move-done')).toBeTruthy();
    expect(nextEnabled()).toBe(true);
  });

  it('takes a move back with Undo, and its step with it', async () => {
    await open();
    await press('tour-start');
    await passRoll();
    await press('tour-next');
    await layoutBoard('tour-move-board');
    const first = sources(startTourMove())[0]!;
    await touch('tour-move-board-pan', [center(first.rect), center(first.targets[0]!.rect)]);
    expect(screen.getByTestId('tour-step-drag-done')).toBeTruthy();
    await press('tour-undo');
    expect(screen.queryByTestId('tour-step-drag-done')).toBeNull();
  });

  it('keeps a try-it page done after Back', async () => {
    await open();
    await press('tour-start');
    await passRoll();
    await press('tour-next');
    await press('tour-back');
    expect(screen.getByTestId('tour-title-roll')).toBeTruthy();
    expect(nextEnabled()).toBe(true);
  });

  it('shows the swipe with Show me, then hides it', async () => {
    await open();
    await press('tour-start');
    await layoutBoard('tour-roll-board');
    await press('tour-show-me');
    expect(screen.getByTestId('tour-finger', { includeHiddenElements: true })).toBeTruthy();
    await wait(5000);
    expect(screen.queryByTestId('tour-finger', { includeHiddenElements: true })).toBeNull();
  });

  it('asks only for Roll with a screen reader on, and Next never waits', async () => {
    jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockResolvedValue(true);
    await renderWithRoot(
      <TourScreen pages={['roll', 'home', 'help']} offers={ALL} firstRun {...callbacks()} />,
    );
    await layoutBoard('tour-roll-board');
    expect(screen.queryByTestId('tour-step-swipe')).toBeNull();
    await press('tour-roll-button');
    expect(nextEnabled()).toBe(true);
    await press('tour-next');
    expect(screen.getByTestId('tour-title-home')).toBeTruthy();
    expect(nextEnabled()).toBe(true);
  });

  it('keeps Next dim on a reading page until the wait is over', async () => {
    jest.spyOn(Reanimated, 'useReducedMotion').mockReturnValue(false);
    await renderWithRoot(
      <TourScreen pages={['home', 'help']} offers={ALL} firstRun {...callbacks()} />,
    );
    expect(screen.getByTestId('tour-title-home')).toBeTruthy();
    expect(screen.getByTestId('tour-home-sketch')).toBeTruthy();
    expect(nextEnabled()).toBe(false);
    await wait(TOUR_READ_MS - 1);
    expect(nextEnabled()).toBe(false);
    await wait(1);
    expect(nextEnabled()).toBe(true);
    await press('tour-next');
    expect(screen.getByTestId('tour-title-help')).toBeTruthy();
  });

  it('ends with the first lesson or Home', async () => {
    const props = callbacks();
    await renderWithRoot(<TourScreen pages={['help']} offers={ALL} firstRun {...props} />);
    expect(screen.getByTestId('tour-finish')).toHaveTextContent('Go to Home');
    expect(nextEnabled('tour-lesson')).toBe(false);
    await wait(TOUR_READ_MS);
    await press('tour-lesson');
    expect(props.onLesson).toHaveBeenCalledTimes(1);
    await press('tour-finish');
    expect(props.onFinish).toHaveBeenCalledTimes(1);
  });

  it('says Done on the last page when opened from a menu', async () => {
    await renderWithRoot(
      <TourScreen pages={['help']} offers={ALL} firstRun={false} {...callbacks()} />,
    );
    expect(screen.getByTestId('tour-finish')).toHaveTextContent('Done');
  });

  it('lists only the modes this build has', async () => {
    await renderWithRoot(
      <TourScreen
        pages={['account', 'help']}
        offers={{ friend: true, ranked: false, friends: true, ratings: false }}
        firstRun
        {...callbacks()}
      />,
    );
    expect(screen.getByTestId('tour-row-friends')).toBeTruthy();
    expect(screen.queryByTestId('tour-row-ranked')).toBeNull();
    expect(screen.queryByTestId('tour-row-ratings')).toBeNull();
  });
});

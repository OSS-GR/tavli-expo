import { createSeededRng, rollDice } from '@tavli/engine';
import { getTheme } from '@tavli/themes';
import { act, fireEvent, screen } from '@testing-library/react-native';

import { SAMPLE_DIRECTIONS, SAMPLE_POSITIONS } from '@/features/board/positions';
import type { FeedbackEvent } from '@/features/feedback/feedback';

import { runOnFakeTimers } from '../../../test/clock';
import { touch } from '../../../test/gestureHandlerMock';
import { renderWithRoot } from '../../../test/render';
import { countNodes, findAllNodes, type JsonNode } from '../../../test/tree';

import type { BoardLayoutMode } from '@/features/settings/settings';

import { DiceThrowBoard } from './DiceThrowBoard';

const SEED = 11;
const SIZE = { width: 360, height: 590 };

async function setup(layout: BoardLayoutMode = 'tall') {
  const events: FeedbackEvent[] = [];
  const feedback = { event: (e: FeedbackEvent) => events.push(e) };
  await renderWithRoot(
    <DiceThrowBoard
      board={SAMPLE_POSITIONS.start}
      view={{ viewer: 'white', direction: SAMPLE_DIRECTIONS.start }}
      rng={createSeededRng(SEED)}
      theme={getTheme('walnut-kafeneio')}
      layout={layout}
      feedback={feedback}
    />,
  );
  await fireEvent(screen.getByTestId('dice-throw'), 'layout', {
    nativeEvent: { layout: { x: 0, y: 0, ...SIZE } },
  });
  return { events };
}

/** The rolls the same seed gives, in order. */
function expectedRolls(n: number) {
  const rng = createSeededRng(SEED);
  return Array.from({ length: n }, () => rollDice(rng));
}

const resultText = () => screen.getByTestId('dice-throw-result').props.children as string;

type Pose = readonly [{ translateX: number }, { translateY: number }, ...unknown[]];

/** Where each thrown die is now, read from its transform (`ThrownDie`). */
function dicePlaces(): number[][] {
  const dice = findAllNodes(screen.toJSON() as JsonNode | null, (n) => {
    const transform = n.props.transform as { get?: unknown } | undefined;
    return n.type === 'Group' && typeof transform?.get === 'function';
  });
  return dice.map((n) => {
    const [x, y] = (n.props.transform as { get: () => Pose }).get();
    return [Math.round(x.translateX), Math.round(y.translateY)];
  });
}

describe('DiceThrowBoard (dice throw spike, #183)', () => {
  // The throw plays on timers (the knocks); keep them on a fake clock.
  runOnFakeTimers();

  it('asks for a swipe before the first throw', async () => {
    await setup();
    expect(resultText()).toBe('Swipe anywhere to throw the dice.');
  });

  it('throws on a swipe on the board and shows the values the RNG rolled', async () => {
    const { events } = await setup();
    // A finger on the board reaches its tap and the pan around it: the pan wins.
    // Sideways: the dice cross the board's width and hit the far wall.
    await touch('dice-throw-tap', [
      { x: 60, y: 450 },
      { x: 180, y: 445 },
      { x: 300, y: 440 },
    ]);
    const [first] = expectedRolls(1);
    expect(resultText()).toBe(`Rolled ${first![0]} and ${first![1]}.`);
    expect(events).toEqual(['diceRoll']);
    // A hard swipe bounces off the far wall: a knock on each hit.
    await act(async () => {
      jest.advanceTimersByTime(3000);
    });
    expect(events.filter((e) => e === 'diceLand').length).toBeGreaterThan(0);
  });

  it('throws on a swipe that starts under the board', async () => {
    const { events } = await setup();
    // Off the board (the Roll row, the controls): only the pan gets the finger.
    await touch('dice-throw-pan', [
      { x: 180, y: 680 },
      { x: 185, y: 560 },
      { x: 190, y: 420 },
    ]);
    const [first] = expectedRolls(1);
    expect(resultText()).toBe(`Rolled ${first![0]} and ${first![1]}.`);
    expect(events).toEqual(['diceRoll']);
  });

  it('throws from the side the finger went down on, and the same swipe lands the same', async () => {
    await setup();
    // The same swipe from the same place lands in the same place.
    await touch('dice-throw-pan', [
      { x: 60, y: 420 },
      { x: 70, y: 320 },
    ]);
    const first = dicePlaces();
    expect(first).toHaveLength(2);
    await touch('dice-throw-pan', [
      { x: 60, y: 420 },
      { x: 70, y: 320 },
    ]);
    expect(dicePlaces()).toEqual(first);
    // The same swipe from the other side throws from the other side.
    await touch('dice-throw-pan', [
      { x: 300, y: 420 },
      { x: 310, y: 320 },
    ]);
    expect(dicePlaces()).not.toEqual(first);
  });

  it('throws with the Roll button (screen readers, no swipe)', async () => {
    const { events } = await setup();
    await fireEvent.press(screen.getByTestId('dice-throw-roll'));
    await fireEvent.press(screen.getByTestId('dice-throw-roll'));
    const [, second] = expectedRolls(2);
    expect(resultText()).toBe(`Rolled ${second![0]} and ${second![1]}.`);
    expect(events.filter((e) => e === 'diceRoll')).toHaveLength(2);
  });

  it('throws on a tap, and a small wobble is one tap, not a swipe too', async () => {
    const { events } = await setup();
    await touch('dice-throw-tap', [
      { x: 180, y: 450 },
      { x: 184, y: 453 },
    ]);
    expect(events.filter((e) => e === 'diceRoll')).toHaveLength(1);
    const [first] = expectedRolls(1);
    expect(resultText()).toBe(`Rolled ${first![0]} and ${first![1]}.`);
  });

  it('does not throw when the system takes the touch away', async () => {
    const { events } = await setup();
    await touch(
      'dice-throw-pan',
      [
        { x: 180, y: 560 },
        { x: 180, y: 400 },
      ],
      { canceled: true },
    );
    expect(events).toEqual([]);
    expect(resultText()).toBe('Swipe anywhere to throw the dice.');
  });

  it('draws two dice on the board after a throw', async () => {
    await setup();
    // Each die draws one blurred shadow (`DieBody`).
    const shadows = () => countNodes(screen.toJSON() as JsonNode | null, 'BlurMask');
    const before = shadows();
    await fireEvent.press(screen.getByTestId('dice-throw-roll'));
    expect(shadows() - before).toBe(2);
  });

  it('throws on the classic board too', async () => {
    await setup('classic');
    await fireEvent.press(screen.getByTestId('dice-throw-roll'));
    const [first] = expectedRolls(1);
    expect(resultText()).toBe(`Rolled ${first![0]} and ${first![1]}.`);
  });
});

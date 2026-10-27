import { createSeededRng, rollDice } from '@tavli/engine';
import { getTheme } from '@tavli/themes';
import { act, fireEvent, screen } from '@testing-library/react-native';

import { SAMPLE_DIRECTIONS, SAMPLE_POSITIONS } from '@/features/board/positions';
import type { FeedbackEvent } from '@/features/feedback/feedback';

import { touch } from '../../../test/gestureHandlerMock';
import { renderWithRoot } from '../../../test/render';
import { countNodes, type JsonNode } from '../../../test/tree';

import { DiceThrowBoard } from './DiceThrowBoard';

const SEED = 11;
const SIZE = { width: 360, height: 590 };

async function setup() {
  const events: FeedbackEvent[] = [];
  const feedback = { event: (e: FeedbackEvent) => events.push(e) };
  await renderWithRoot(
    <DiceThrowBoard
      board={SAMPLE_POSITIONS.start}
      view={{ viewer: 'white', direction: SAMPLE_DIRECTIONS.start }}
      rng={createSeededRng(SEED)}
      theme={getTheme('walnut-kafeneio')}
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

describe('DiceThrowBoard (dice throw spike, #183)', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('asks for a swipe before the first throw', async () => {
    await setup();
    expect(resultText()).toBe('Swipe the board to throw the dice.');
  });

  it('throws on a swipe and shows the values the RNG rolled', async () => {
    const { events } = await setup();
    await touch('dice-throw-pan', [
      { x: 180, y: 560 },
      { x: 185, y: 450 },
      { x: 190, y: 300 },
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
    expect(resultText()).toBe('Swipe the board to throw the dice.');
  });

  it('draws two dice on the board after a throw', async () => {
    await setup();
    // Each die draws one blurred shadow (`DieBody`).
    const shadows = () => countNodes(screen.toJSON() as JsonNode | null, 'BlurMask');
    const before = shadows();
    await fireEvent.press(screen.getByTestId('dice-throw-roll'));
    expect(shadows() - before).toBe(2);
  });
});

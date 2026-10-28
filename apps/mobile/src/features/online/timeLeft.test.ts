import { TURN_TIME_MS } from '@tavli/contracts';

import { estimateOffset, timeLeft } from './timeLeft';

const SAVED = Date.UTC(2026, 9, 28, 12, 0, 0);
const live = { pace: 'live' as const, turnDeadline: SAVED + TURN_TIME_MS.live };

describe('timeLeft', () => {
  it('counts down to the deadline on the server clock', () => {
    expect(timeLeft(live, SAVED, 0)).toBe(TURN_TIME_MS.live);
    expect(timeLeft(live, SAVED + 20_000, 0)).toBe(40_000);
  });

  it('adds the offset to the phone clock', () => {
    // The phone is 5 s ahead: offset -5 s.
    expect(timeLeft(live, SAVED + 5_000, -5_000)).toBe(TURN_TIME_MS.live);
    // The phone is 5 s behind: offset +5 s.
    expect(timeLeft(live, SAVED - 5_000, 5_000)).toBe(TURN_TIME_MS.live);
  });

  it('never goes below 0', () => {
    expect(timeLeft(live, SAVED + TURN_TIME_MS.live, 0)).toBe(0);
    expect(timeLeft(live, SAVED + 10 * TURN_TIME_MS.live, 0)).toBe(0);
  });

  it('is null when the match is over', () => {
    expect(timeLeft({ turnDeadline: null }, SAVED, 0)).toBeNull();
  });
});

describe('estimateOffset', () => {
  it('reads the save time from the deadline', () => {
    expect(estimateOffset(live, SAVED)).toBe(0);
    expect(estimateOffset(live, SAVED + 5_000)).toBe(-5_000);
    const async = { pace: 'async' as const, turnDeadline: SAVED + TURN_TIME_MS.async };
    expect(estimateOffset(async, SAVED - 3_000)).toBe(3_000);
  });

  it('is null with no deadline', () => {
    expect(estimateOffset({ pace: 'live', turnDeadline: null }, SAVED)).toBeNull();
  });
});

import { ASYNC_TURN_TIME_MS } from '@tavli/contracts';

import { estimateOffset, timeLeft } from './timeLeft';

const SAVED = Date.UTC(2026, 9, 28, 12, 0, 0);
const live = { turnTimeMinutes: 1 as const, turnDeadline: SAVED + 60_000 };

describe('timeLeft', () => {
  it('counts down to the deadline on the server clock', () => {
    expect(timeLeft(live, SAVED, 0)).toBe(60_000);
    expect(timeLeft(live, SAVED + 20_000, 0)).toBe(40_000);
  });

  it('adds the offset to the phone clock', () => {
    // The phone is 5 s ahead: offset -5 s.
    expect(timeLeft(live, SAVED + 5_000, -5_000)).toBe(60_000);
    // The phone is 5 s behind: offset +5 s.
    expect(timeLeft(live, SAVED - 5_000, 5_000)).toBe(60_000);
  });

  it('never goes below 0', () => {
    expect(timeLeft(live, SAVED + 60_000, 0)).toBe(0);
    expect(timeLeft(live, SAVED + 10 * 60_000, 0)).toBe(0);
  });

  it('is null when the match is over', () => {
    expect(timeLeft({ turnDeadline: null }, SAVED, 0)).toBeNull();
  });
});

describe('estimateOffset', () => {
  it('reads the save time from the deadline', () => {
    expect(estimateOffset(live, SAVED)).toBe(0);
    expect(estimateOffset(live, SAVED + 5_000)).toBe(-5_000);
    const async = { turnTimeMinutes: null, turnDeadline: SAVED + ASYNC_TURN_TIME_MS };
    expect(estimateOffset(async, SAVED - 3_000)).toBe(3_000);
  });

  it('is null with no deadline', () => {
    expect(estimateOffset({ turnTimeMinutes: 1, turnDeadline: null }, SAVED)).toBeNull();
  });
});

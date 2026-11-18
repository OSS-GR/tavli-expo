import { fasterSpeed, keepPeak, swipeEnd, type SharedNumber } from './interaction';

const shared = (value: number): SharedNumber => {
  let v = value;
  return { get: () => v, set: (next) => (v = next) };
};

describe('swipe to roll (#625)', () => {
  it('keeps the fastest finger speed of the swipe', () => {
    expect(fasterSpeed(0, 0, { x: 0, y: 0, velocityX: 300, velocityY: -400 })).toEqual({
      vx: 300,
      vy: -400,
    });
    // Slower than what it has: it keeps the old one.
    expect(fasterSpeed(300, -400, { x: 0, y: 0, velocityX: 0, velocityY: -100 })).toEqual({
      vx: 300,
      vy: -400,
    });
    // No speed, or not a number: nothing changes.
    expect(fasterSpeed(10, 0, { x: 0, y: 0 })).toEqual({ vx: 10, vy: 0 });
    expect(fasterSpeed(10, 0, { x: 0, y: 0, velocityX: NaN, velocityY: 5 })).toEqual({
      vx: 10,
      vy: 0,
    });
  });

  it('keeps the peak in shared values over a flick that slows at the end', () => {
    const vx = shared(0);
    const vy = shared(0);
    for (const v of [-200, -1400, -900, -150])
      keepPeak(vx, vy, { x: 0, y: 0, velocityX: 0, velocityY: v });
    expect([vx.get(), vy.get()]).toEqual([0, -1400]);
  });

  it('gives the swipe from where the finger went down to where it lifted', () => {
    expect(swipeEnd({ x: 20, y: 200 }, { x: 120, y: 120 }, 0, -1400)).toEqual({
      x: 20,
      y: 200,
      dx: 100,
      dy: -80,
      vx: 0,
      vy: -1400,
    });
    // No speed seen: no `vx`, `vy`, so the throw works it out from the swipe.
    expect(swipeEnd({ x: 20, y: 200 }, { x: 120, y: 120 }, 0, 0)).toEqual({
      x: 20,
      y: 200,
      dx: 100,
      dy: -80,
    });
  });
});

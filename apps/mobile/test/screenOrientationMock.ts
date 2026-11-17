/**
 * A fake `expo-screen-orientation` (#611): the interface orientation is a
 * value the test sets with `setOrientation`, and the listeners hear it, as
 * on a phone that turns. Each test starts upright (`test/afterEnv.ts`).
 */
export enum Orientation {
  UNKNOWN = 0,
  PORTRAIT_UP = 1,
  PORTRAIT_DOWN = 2,
  LANDSCAPE_LEFT = 3,
  LANDSCAPE_RIGHT = 4,
}

type Listener = (e: { orientationInfo: { orientation: Orientation } }) => void;

let current = Orientation.PORTRAIT_UP;
const listeners = new Set<Listener>();

export function getOrientationAsync(): Promise<Orientation> {
  return Promise.resolve(current);
}

export function addOrientationChangeListener(listener: Listener): { remove: () => void } {
  listeners.add(listener);
  return { remove: () => listeners.delete(listener) };
}

export function removeOrientationChangeListener(sub: { remove: () => void }): void {
  sub.remove();
}

/** Turns the fake phone: every listener hears the new orientation. */
export function setOrientation(orientation: Orientation): void {
  current = orientation;
  for (const l of [...listeners]) l({ orientationInfo: { orientation } });
}

/**
 * Turns the phone in a test (#185). React Native's `Dimensions` is real in
 * Jest (a 750 × 1334 portrait window), and `useWindowDimensions` follows
 * `Dimensions.set`, like on a phone that turns.
 */
import { act } from '@testing-library/react-native';
import { Dimensions } from 'react-native';

export interface TestWindow {
  readonly width: number;
  readonly height: number;
  readonly fontScale?: number;
}

/** iPhone SE and iPhone Pro Max, in points. */
export const PORTRAIT_SE: TestWindow = { width: 375, height: 667 };
export const LANDSCAPE_SE: TestWindow = { width: 667, height: 375 };
export const LANDSCAPE_PRO_MAX: TestWindow = { width: 956, height: 440 };

const original = { window: Dimensions.get('window'), screen: Dimensions.get('screen') };

function set(window: TestWindow) {
  const metrics = {
    width: window.width,
    height: window.height,
    scale: 3,
    fontScale: window.fontScale ?? 1,
  };
  Dimensions.set({ window: metrics, screen: metrics });
}

/** Sets the window size (and the font scale, default 1), as if the phone turned. */
export async function setWindow(window: TestWindow): Promise<void> {
  await act(async () => {
    set(window);
  });
}

/** Puts back Jest's own window. Call it in `afterEach` after `setWindow`. */
export async function resetWindow(): Promise<void> {
  await act(async () => {
    Dimensions.set(original);
  });
}

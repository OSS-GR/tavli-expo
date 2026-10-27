/**
 * A small stand-in for react-native-gesture-handler in Jest.
 *
 * Gesture Handler 3 needs native code and a real Reanimated. Here
 * `usePanGesture` only remembers its config by `testID`, and a test drives
 * it with `touch()`: begin, move, end, like a finger would.
 */
import { act } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { View, type ViewProps } from 'react-native';

interface PanEvent {
  x: number;
  y: number;
  canceled?: boolean;
}

interface PanConfig {
  testID?: string;
  onBegin?: (e: PanEvent) => void;
  onUpdate?: (e: PanEvent) => void;
  onFinalize?: (e: PanEvent) => void;
}

const pans = new Map<string, PanConfig>();

export function usePanGesture(config: PanConfig) {
  if (config.testID) pans.set(config.testID, config);
  return { config };
}

export function GestureDetector({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

export function GestureHandlerRootView(props: ViewProps) {
  return <View {...props} />;
}

export interface Point {
  x: number;
  y: number;
}

/**
 * A finger on the pan gesture `testID`: down at `path[0]`, through the
 * other points, up at the last one. One point is a tap. `canceled`: the
 * system takes the touch away at the last point.
 */
export async function touch(
  testID: string,
  path: Point[],
  { canceled = false }: { canceled?: boolean } = {},
): Promise<void> {
  const pan = pans.get(testID);
  if (pan === undefined) throw new Error(`No pan gesture with testID ${testID}`);
  const [first, ...rest] = path;
  if (first === undefined) throw new Error('A touch needs a point');
  await act(async () => {
    pan.onBegin?.(first);
    for (const p of rest) pan.onUpdate?.(p);
    pan.onFinalize?.({ ...(rest[rest.length - 1] ?? first), canceled });
  });
}

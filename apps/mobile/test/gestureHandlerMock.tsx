/**
 * A small stand-in for react-native-gesture-handler in Jest.
 *
 * Gesture Handler 3 needs native code and a real Reanimated. Here
 * `usePanGesture` and `useTapGesture` only remember their config by
 * `testID`, and a test drives them with `touch()`: down, move, up, like a
 * finger would.
 *
 * The mock follows the native state machine of Gesture Handler 3.3 (see
 * `PanGestureHandler.kt`, `TapGestureHandler.kt` and `eventHandler.ts`):
 *
 * - Pan begins on touch down. It activates only on a move of at least
 *   `minDistance`. A finger that lifts before that makes the pan FAIL, so
 *   its `onFinalize` gets `canceled: true` (#174).
 * - Tap begins on touch down. It fails on a move of more than
 *   `maxDistance`, or when the finger stays down longer than `maxDuration`
 *   (default 500 ms). Otherwise it activates and ends when the finger lifts.
 * - `useCompetingGestures` (Race): the first gesture to activate cancels the
 *   others.
 * - Nested detectors: a finger on the inner view reaches the gestures of the
 *   detectors around it too. With no relation set, Gesture Handler lets only
 *   one of them run: the first to activate cancels the others, like a race
 *   (`shouldHandlerBeCancelledBy` in `GestureHandlerOrchestrator.kt`). A
 *   finger outside the inner view reaches only the outer gestures.
 *
 * Give every gesture a `testID`: the mock finds gestures by it.
 */
import { act } from '@testing-library/react-native';
import { createContext, useContext, type ReactNode } from 'react';
import { View, type ViewProps } from 'react-native';

interface GestureEvent {
  x: number;
  y: number;
}

interface EndEvent extends GestureEvent {
  canceled: boolean;
}

interface Callbacks {
  testID?: string;
  onBegin?: (e: GestureEvent) => void;
  onActivate?: (e: GestureEvent) => void;
  onUpdate?: (e: GestureEvent) => void;
  onDeactivate?: (e: EndEvent) => void;
  onFinalize?: (e: EndEvent) => void;
}

interface PanConfig extends Callbacks {
  minDistance?: number;
}

interface TapConfig extends Callbacks {
  maxDistance?: number;
  maxDuration?: number;
}

type Gesture = { kind: 'pan'; config: PanConfig } | { kind: 'tap'; config: TapConfig };

/** Gesture Handler's defaults. */
const PAN_MIN_DISTANCE = 10;
const TAP_MAX_DURATION = 500;

/**
 * The latest gesture with each testID. The hooks run on every render, so a
 * touch always calls the latest callbacks. The two maps below hold testIDs,
 * not gestures, so a detector that skips a render never leaves an old one.
 */
const latest = new Map<string, Gesture>();
/** The testIDs each gesture races (`useCompetingGestures`), itself included. */
const races = new Map<string, readonly string[]>();
/** The testIDs of the gestures on the detectors around each gesture's detector. */
const around = new Map<string, readonly string[]>();

const idOf = (g: Gesture) => g.config.testID;
const idsOf = (gestures: readonly Gesture[]) =>
  gestures.map(idOf).filter((id): id is string => id !== undefined);

function remember(gesture: Gesture) {
  const id = idOf(gesture);
  if (id === undefined) return;
  latest.set(id, gesture);
  races.set(id, [id]);
}

export function usePanGesture(config: PanConfig): Gesture {
  const gesture: Gesture = { kind: 'pan', config };
  remember(gesture);
  return gesture;
}

export function useTapGesture(config: TapConfig): Gesture {
  const gesture: Gesture = { kind: 'tap', config };
  remember(gesture);
  return gesture;
}

export function useCompetingGestures(...gestures: Gesture[]): Gesture[] {
  const ids = idsOf(gestures);
  for (const id of ids) races.set(id, ids);
  return gestures;
}

/** The testIDs of the gestures on the detectors around this one. */
const Around = createContext<readonly string[]>([]);

export function GestureDetector({
  gesture,
  children,
}: {
  gesture: Gesture | Gesture[];
  children: ReactNode;
}) {
  const outer = useContext(Around);
  const own = idsOf(Array.isArray(gesture) ? gesture : [gesture]);
  for (const id of own) around.set(id, outer);
  return <Around.Provider value={[...own, ...outer]}>{children}</Around.Provider>;
}

export function GestureHandlerRootView(props: ViewProps) {
  return <View {...props} />;
}

export interface Point {
  x: number;
  y: number;
}

type State = 'began' | 'active' | 'done';

/**
 * A finger on the view of the gesture `testID`: it drives that gesture, the
 * gestures it races and those of the detectors around it. Down at
 * `path[0]`, through the other points, up at the last one. One point is a
 * tap. `holdMs`: how long the finger stays down (default 100 ms, a quick
 * tap). `canceled`: the system takes the touch away at the last point.
 */
export async function touch(
  testID: string,
  path: Point[],
  { canceled = false, holdMs = 100 }: { canceled?: boolean; holdMs?: number } = {},
): Promise<void> {
  if (!latest.has(testID)) throw new Error(`No gesture with testID ${testID}`);
  const ids = new Set([...(races.get(testID) ?? [testID]), ...(around.get(testID) ?? [])]);
  const gestures = [...ids].flatMap((id) => latest.get(id) ?? []);
  const [first, ...rest] = path;
  if (first === undefined) throw new Error('A touch needs a point');
  const last = rest[rest.length - 1] ?? first;
  const states = new Map<Gesture, State>();

  const fail = (g: Gesture, at: Point) => {
    states.set(g, 'done');
    g.config.onFinalize?.({ ...at, canceled: true });
  };
  const activate = (g: Gesture, at: Point) => {
    states.set(g, 'active');
    g.config.onActivate?.(at);
    // Race (or nested detectors): the others stop at once.
    for (const other of gestures) if (other !== g && states.get(other) === 'began') fail(other, at);
  };
  const end = (g: Gesture, at: Point, wasCanceled: boolean) => {
    states.set(g, 'done');
    g.config.onDeactivate?.({ ...at, canceled: wasCanceled });
    g.config.onFinalize?.({ ...at, canceled: wasCanceled });
  };

  await act(async () => {
    for (const g of gestures) {
      states.set(g, 'began');
      g.config.onBegin?.(first);
    }
    for (const p of rest) {
      const distance = Math.hypot(p.x - first.x, p.y - first.y);
      for (const g of gestures) {
        const state = states.get(g);
        if (g.kind === 'tap') {
          const max = g.config.maxDistance;
          if (state === 'began' && max !== undefined && distance > max) fail(g, p);
        } else if (state === 'began') {
          if (distance >= (g.config.minDistance ?? PAN_MIN_DISTANCE)) {
            activate(g, p);
            g.config.onUpdate?.(p);
          }
        } else if (state === 'active') {
          g.config.onUpdate?.(p);
        }
      }
    }
    // The finger stayed down too long for a tap.
    for (const g of gestures) {
      if (g.kind !== 'tap' || states.get(g) !== 'began') continue;
      if (holdMs > (g.config.maxDuration ?? TAP_MAX_DURATION)) fail(g, last);
    }
    for (const g of gestures) {
      const state = states.get(g);
      if (state === 'done') continue;
      if (canceled) {
        if (state === 'active') end(g, last, true);
        else fail(g, last);
      } else if (state === 'active') {
        end(g, last, false);
      } else if (g.kind === 'tap') {
        // A tap activates and ends when the finger lifts.
        activate(g, last);
        end(g, last, false);
      } else {
        // A pan that never moved far enough fails when the finger lifts.
        fail(g, last);
      }
    }
  });
}

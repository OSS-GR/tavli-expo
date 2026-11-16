/**
 * "Show me" on the tour's try-it pages (#573): a round fingertip mark over
 * the board that shows the gesture once.
 *
 * - `tap`: it taps `from`, then taps `to` (pick a checker, then its place).
 * - `drag`: it presses `from`, slides to `to` and lifts.
 * - `swipe`: it slides fast from `from` to `to` (roll the dice).
 *
 * With Reduce Motion on, nothing moves: a still mark at `from`, a ring at
 * `to` and a line between them. Touches go through. Screen readers skip
 * it: the page text says the same.
 */
import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { StyleSheet } from 'react-native-unistyles';

import type { ScreenPoint } from '@/features/board/geometry';

export type FingerKind = 'tap' | 'drag' | 'swipe';

/** How long one showing takes. The page hides the mark after it. */
export const FINGER_MS: Record<FingerKind, number> = { tap: 1600, drag: 1500, swipe: 900 };

const SIZE = 44;

export interface FingerProps {
  kind: FingerKind;
  from: ScreenPoint;
  to: ScreenPoint;
}

export function Finger({ kind, from, to }: FingerProps) {
  const reduceMotion = useReducedMotion();
  const x = useSharedValue(from.x);
  const y = useSharedValue(from.y);
  const scale = useSharedValue(1);
  const opacity = useSharedValue(reduceMotion ? 1 : 0);
  useEffect(() => {
    if (reduceMotion) return;
    const ease = { easing: Easing.inOut(Easing.quad) };
    if (kind === 'tap') {
      opacity.set(
        withSequence(
          withTiming(1, { duration: 150 }),
          withDelay(1300, withTiming(0, { duration: 150 })),
        ),
      );
      scale.set(
        withSequence(
          withDelay(250, withTiming(0.7, { duration: 120 })),
          withTiming(1, { duration: 120 }),
          withDelay(500, withTiming(0.7, { duration: 120 })),
          withTiming(1, { duration: 120 }),
        ),
      );
      x.set(withDelay(650, withTiming(to.x, { duration: 250, ...ease })));
      y.set(withDelay(650, withTiming(to.y, { duration: 250, ...ease })));
    } else {
      const press = kind === 'drag' ? 300 : 120;
      const slide = kind === 'drag' ? 800 : 450;
      opacity.set(
        withSequence(
          withTiming(1, { duration: 150 }),
          withDelay(press + slide, withTiming(0, { duration: 200 })),
        ),
      );
      scale.set(withTiming(0.8, { duration: press }));
      x.set(withDelay(press, withTiming(to.x, { duration: slide, ...ease })));
      y.set(withDelay(press, withTiming(to.y, { duration: slide, ...ease })));
    }
    // One showing per mount: the page mounts a new mark each time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const dot = useAnimatedStyle(() => ({
    opacity: opacity.get(),
    transform: [
      { translateX: x.get() - SIZE / 2 },
      { translateY: y.get() - SIZE / 2 },
      { scale: scale.get() },
    ],
  }));
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  const angle = Math.atan2(dy, dx);
  return (
    <View
      testID="tour-finger"
      style={styles.layer}
      pointerEvents="none"
      collapsable={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants">
      {reduceMotion ? (
        <>
          <View
            style={[
              styles.line,
              {
                width: length,
                left: (from.x + to.x) / 2 - length / 2,
                top: (from.y + to.y) / 2 - 1.5,
                transform: [{ rotate: `${angle}rad` }],
              },
            ]}
          />
          <View style={[styles.ring, { left: to.x - SIZE / 2, top: to.y - SIZE / 2 }]} />
        </>
      ) : null}
      <Animated.View style={[styles.dot, dot]} />
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  layer: {
    ...StyleSheet.absoluteFillObject,
  },
  dot: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    borderWidth: 2,
    borderColor: theme.colors.onAccent,
    backgroundColor: theme.colors.accentLight,
    opacity: 0.85,
  },
  ring: {
    position: 'absolute',
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    borderWidth: 3,
    borderColor: theme.colors.accentLight,
  },
  line: {
    position: 'absolute',
    height: 3,
    borderRadius: 1.5,
    backgroundColor: theme.colors.accentLight,
  },
}));

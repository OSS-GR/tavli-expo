/**
 * The tour's Next button on a reading page (#573, Figma frame 22): it
 * starts dim, fills with brass from left to right over `TOUR_READ_MS`,
 * then works. The wait asks the player to read the page; Skip works at
 * once, so nobody is stuck.
 *
 * - With a screen reader on, Next works at once (reading takes longer
 *   there, and a dim button that only says "disabled" helps nobody).
 * - With Reduce Motion on, no sweep: the button turns on at the end.
 *
 * Mount it with a `key` per page, so each page waits again.
 */
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { StyleSheet } from 'react-native-unistyles';

import { useScreenReaderEnabled } from '@/features/accessibility/screenReader';

/** How long Next waits on a reading page. */
export const TOUR_READ_MS = 3000;

export interface TimedNextProps {
  label: string;
  onPress: () => void;
  testID?: string;
  /** `false`: no wait (a try-it page passes its own `ready`). Default `true`. */
  wait?: boolean;
  /** A try-it page: Next works only when its steps are done. Default `true`. */
  ready?: boolean;
}

export function TimedNext({
  label,
  onPress,
  testID,
  wait = true,
  ready: stepsDone = true,
}: TimedNextProps) {
  const screenReader = useScreenReaderEnabled();
  const reduceMotion = useReducedMotion();
  const [waited, setWaited] = useState(!wait);
  const progress = useSharedValue(wait ? 0 : 1);
  useEffect(() => {
    if (!wait) return;
    if (!reduceMotion) {
      progress.set(withTiming(1, { duration: TOUR_READ_MS, easing: Easing.linear }));
    }
    const id = setTimeout(() => {
      progress.set(1);
      setWaited(true);
    }, TOUR_READ_MS);
    return () => clearTimeout(id);
    // Once per page: the parent mounts a new button for each page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const ready = stepsDone && (waited || screenReader);
  const fillStyle = useAnimatedStyle(() => ({
    width: `${(ready ? 1 : stepsDone ? progress.get() : 0) * 100}%`,
  }));
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !ready }}
      disabled={!ready}
      onPress={onPress}
      style={({ pressed }) => [styles.button, pressed && ready && styles.pressed]}>
      {/* The fill sits under the label; it never takes a touch. */}
      <View style={styles.track} pointerEvents="none" collapsable={false}>
        <Animated.View
          testID={testID ? `${testID}-fill` : undefined}
          style={[styles.fill, fillStyle]}
        />
      </View>
      <Text style={styles.label(ready)}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create((theme) => ({
  button: {
    flex: 1,
    minHeight: theme.touch.button,
    minWidth: 104,
    paddingHorizontal: theme.space.lg,
    paddingVertical: theme.space.sm,
    borderRadius: theme.radii.lg,
    borderWidth: 1,
    borderColor: theme.colors.accentMuted,
    backgroundColor: theme.colors.accentMuted,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  pressed: {
    transform: [{ scale: 0.98 }],
  },
  track: {
    ...StyleSheet.absoluteFillObject,
  },
  fill: {
    height: '100%',
    backgroundColor: theme.colors.accent,
    backgroundImage: `linear-gradient(160deg, ${theme.colors.accentLight} 0%, ${theme.colors.accent} 70%)`,
  },
  label: (ready: boolean) => ({
    ...theme.type.bodyStrong,
    textAlign: 'center',
    color: ready ? theme.colors.onAccent : theme.colors.onAccentMuted,
  }),
}));

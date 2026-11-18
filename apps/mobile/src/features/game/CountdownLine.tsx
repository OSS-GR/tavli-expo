/**
 * The gold countdown line (#613, #615): a thin line that shrinks to its
 * middle while `running`. Every card over the board that closes by itself
 * shows it, so they all look alike and show that they will close: the
 * pass inlay, the online news cards ("The game changed", "Not accepted")
 * and the opening result.
 *
 * With `onEnd` the line runs the timer too, so the line and the close
 * always agree, and the timer runs only while the line is mounted (a card
 * under another card is not closed unseen). After a pause (`running`
 * false, then true) both start again in full.
 *
 * Screen readers skip it: the card it sits in says what it needs to.
 */
import { useEffect, useRef } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { StyleSheet } from 'react-native-unistyles';

export interface CountdownLineProps {
  /** How long the line runs. */
  durationMs: number;
  /** The line runs only while this is true (not paused, no screen reader). */
  running: boolean;
  /** Called once when the line ends. Without it the line only shows the time. */
  onEnd?: () => void;
  /** Where the track sits: the default is 180 wide, centered. */
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function CountdownLine({ durationMs, running, onEnd, style, testID }: CountdownLineProps) {
  const left = useSharedValue(1);

  useEffect(() => {
    cancelAnimation(left);
    left.set(1);
    if (running) left.set(withTiming(0, { duration: durationMs, easing: Easing.linear }));
  }, [left, running, durationMs]);

  const end = useRef(onEnd);
  useEffect(() => {
    end.current = onEnd;
  }, [onEnd]);
  const timed = onEnd !== undefined;
  useEffect(() => {
    if (!running || !timed) return;
    const timer = setTimeout(() => end.current?.(), durationMs);
    return () => clearTimeout(timer);
  }, [running, timed, durationMs]);

  const lineStyle = useAnimatedStyle(() => ({ transform: [{ scaleX: left.get() }] }));

  return (
    <View
      style={[styles.track, style]}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants">
      <Animated.View testID={testID} style={[styles.fill, lineStyle]} />
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  track: {
    alignSelf: 'center',
    width: 180,
    maxWidth: '100%',
    height: 2,
    borderRadius: 1,
    backgroundColor: theme.colors.accentWash,
    overflow: 'hidden',
  },
  fill: {
    flex: 1,
    height: 2,
    borderRadius: 1,
    backgroundColor: theme.colors.accentLight,
  },
}));

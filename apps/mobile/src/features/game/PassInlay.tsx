/**
 * "No moves" as an inlay on the board's bar (#613, Figma "27 v2 · No legal
 * moves, inlay on the bar"). It took the place of the pass card: no scrim
 * and no OK, so the board stays in view. A walnut plate with a gold inlay
 * line: the title in Piazzolla between two small diamonds, one plain line
 * (who rolled what, whose turn), and in Asodio one reason line.
 *
 * The countdown is the inlay itself: a gold line at the foot of the plate
 * that shrinks to the middle while `running`. The screen owns the timer
 * (`PASS_NOTICE_MS`); a tap anywhere over the board closes it sooner.
 *
 * Screen readers: the plate reads as one element with a Close action and
 * gets focus when it shows, and the screen does not close it by itself
 * while a screen reader is on. The board under it stays readable: the
 * inlay covers only the bar.
 */
import { useEffect } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { StyleSheet } from 'react-native-unistyles';

import { useFocusOnShow } from '@/features/accessibility/focus';

import { useAnnouncement } from './useAnnouncement';

/** How fast the inlay comes in. */
const FADE_IN_MS = 200;

export interface PassInlayProps {
  title: string;
  /** "Bot rolled 6-6 · Your turn". */
  line: string;
  /** Asodio only: why the board cannot move (locked board, frozen army). */
  reason?: string | undefined;
  /** What screen readers hear. */
  spoken: string;
  /** The label of the screen reader action that closes it. */
  closeLabel: string;
  /** Names the pass for this app run: it is read once (#216). */
  announceKey: string;
  /** How long the countdown line runs. */
  durationMs: number;
  /** The line runs only while this is true (not paused, no screen reader). */
  running: boolean;
  onClose: () => void;
}

export function PassInlay({
  title,
  line,
  reason,
  spoken,
  closeLabel,
  announceKey,
  durationMs,
  running,
  onClose,
}: PassInlayProps) {
  useAnnouncement(spoken, announceKey);
  const plateRef = useFocusOnShow();
  const reduceMotion = useReducedMotion();
  const left = useSharedValue(1);
  const shown = useSharedValue(reduceMotion ? 1 : 0);

  useEffect(() => {
    shown.set(withTiming(1, { duration: reduceMotion ? 0 : FADE_IN_MS }));
  }, [shown, reduceMotion]);

  // The screen's timer starts again in full after a pause, so the line does too.
  useEffect(() => {
    cancelAnimation(left);
    left.set(1);
    if (running) left.set(withTiming(0, { duration: durationMs, easing: Easing.linear }));
  }, [left, running, durationMs]);

  const lineStyle = useAnimatedStyle(() => ({ transform: [{ scaleX: left.get() }] }));
  const fadeStyle = useAnimatedStyle(() => ({ opacity: shown.get() }));

  return (
    <Pressable
      testID="pass-inlay-cover"
      style={styles.cover}
      onPress={onClose}
      accessible={false}
      importantForAccessibility="no">
      <Animated.View style={[styles.wrap, fadeStyle]}>
        <View
          ref={plateRef}
          testID="pass-inlay"
          style={styles.plate}
          accessible
          accessibilityLabel={spoken}
          accessibilityActions={[{ name: 'activate', label: closeLabel }]}
          onAccessibilityAction={(e) => {
            if (e.nativeEvent.actionName === 'activate') onClose();
          }}>
          <View style={styles.inner}>
            <View style={styles.head}>
              <View style={styles.rule} />
              <View style={styles.diamond} />
              <Text testID="pass-inlay-title" style={styles.title}>
                {title}
              </Text>
              <View style={styles.diamond} />
              <View style={styles.rule} />
            </View>
            <Text testID="pass-inlay-line" style={styles.line}>
              {line}
            </Text>
            {reason !== undefined ? (
              <Text testID="pass-inlay-reason" style={styles.reason}>
                {reason}
              </Text>
            ) : null}
            <View style={styles.track}>
              <Animated.View testID="pass-inlay-countdown" style={[styles.fill, lineStyle]} />
            </View>
          </View>
        </View>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create((theme) => ({
  cover: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.space.lg,
  },
  wrap: {
    maxWidth: '100%',
  },
  plate: {
    padding: 3,
    borderRadius: theme.radii.sm,
    backgroundColor: theme.colors.surfaceRaised,
    borderWidth: 1,
    borderColor: theme.colors.border,
    shadowColor: '#000000',
    shadowOpacity: 0.45,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  inner: {
    borderWidth: 1,
    borderColor: theme.colors.accentLine,
    borderRadius: 4,
    paddingTop: theme.space.sm + 3,
    paddingBottom: theme.space.md + 4,
    paddingHorizontal: theme.space.lg,
    alignItems: 'center',
    gap: 2,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.sm,
  },
  rule: {
    width: 26,
    height: 1,
    backgroundColor: theme.colors.accentLine,
  },
  diamond: {
    width: 6,
    height: 6,
    backgroundColor: theme.colors.accent,
    transform: [{ rotate: '45deg' }],
  },
  title: {
    ...theme.type.title3,
    color: theme.colors.accentLight,
    textAlign: 'center',
    flexShrink: 1,
  },
  line: {
    ...theme.type.footnote,
    color: theme.colors.textDim,
    textAlign: 'center',
  },
  reason: {
    ...theme.type.footnote,
    color: theme.colors.accentLight,
    textAlign: 'center',
  },
  track: {
    position: 'absolute',
    left: theme.space.lg,
    right: theme.space.lg,
    bottom: theme.space.sm,
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

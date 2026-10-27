/**
 * A small celebration when a human wins (wireframes 8 and 9): a burst of
 * confetti around a cup or a party popper. It plays once, on one shared
 * value, so it costs little.
 *
 * With "Reduce motion" on (system setting), it shows the still icon and
 * no confetti. Screen readers skip it: the title says who won.
 */
import { useEffect } from 'react';
import { Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { StyleSheet } from 'react-native-unistyles';

/** How long the confetti flies. */
export const CELEBRATION_MS = 1400;

const PIECES = 14;

/** A fixed spread (no randomness): angle, distance and spin per piece. */
const confetti = Array.from({ length: PIECES }, (_, i) => {
  const angle = (i / PIECES) * Math.PI * 2 + (i % 2 === 0 ? 0.2 : -0.1);
  const distance = 70 + ((i * 37) % 50);
  return {
    dx: Math.cos(angle) * distance,
    dy: Math.sin(angle) * distance * 0.6,
    spin: ((i * 97) % 360) - 180,
    tone: i % 3,
  };
});

export interface CelebrationProps {
  /** `match`: a cup (wireframe 9). `game`: a party popper (wireframe 8). */
  kind: 'game' | 'match';
  testID?: string;
}

export function Celebration({ kind, testID }: CelebrationProps) {
  const reduceMotion = useReducedMotion();
  const progress = useSharedValue(reduceMotion ? 1 : 0);
  const pop = useSharedValue(reduceMotion ? 1 : 0.6);

  useEffect(() => {
    if (reduceMotion) return;
    progress.set(withTiming(1, { duration: CELEBRATION_MS, easing: Easing.out(Easing.quad) }));
    pop.set(withSpring(1, { damping: 8, stiffness: 160 }));
  }, [reduceMotion, progress, pop]);

  const iconStyle = useAnimatedStyle(() => ({ transform: [{ scale: pop.get() }] }));

  return (
    <View
      testID={testID}
      style={styles.area(kind)}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants">
      {reduceMotion
        ? null
        : confetti.map((piece, i) => <Piece key={i} piece={piece} progress={progress} />)}
      <Animated.View testID={testID ? `${testID}-icon` : undefined} style={iconStyle}>
        {/* U+1F3C6 trophy, U+1F389 party popper. */}
        <Text style={styles.icon(kind)}>{kind === 'match' ? '🏆' : '🎉'}</Text>
      </Animated.View>
    </View>
  );
}

function Piece({
  piece,
  progress,
}: {
  piece: (typeof confetti)[number];
  progress: SharedValue<number>;
}) {
  const style = useAnimatedStyle(() => {
    const p = progress.get();
    return {
      opacity: 1 - p,
      transform: [
        { translateX: piece.dx * p },
        // A little gravity: the pieces fall at the end.
        { translateY: piece.dy * p + 40 * p * p },
        { rotate: `${piece.spin * p}deg` },
      ],
    };
  });
  return <Animated.View style={[styles.piece(piece.tone), style]} />;
}

const styles = StyleSheet.create((theme) => ({
  area: (kind: 'game' | 'match') => ({
    height: kind === 'match' ? 120 : 64,
    alignItems: 'center',
    justifyContent: 'center',
  }),
  icon: (kind: 'game' | 'match') => ({
    fontSize: kind === 'match' ? 64 : 40,
    lineHeight: kind === 'match' ? 76 : 48,
    textAlign: 'center',
  }),
  piece: (tone: number) => ({
    position: 'absolute',
    width: 8,
    height: 12,
    borderRadius: 2,
    backgroundColor:
      tone === 0 ? theme.colors.accent : tone === 1 ? theme.colors.turn : theme.colors.text,
  }),
}));

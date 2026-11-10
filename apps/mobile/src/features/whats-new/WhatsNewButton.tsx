/**
 * The What's new button in Home's top row, left of Settings (#471). It is
 * always there, with its name in text, so players know what it opens.
 *
 * While the phone has a release it has not opened (`fresh`), a gold dot
 * sits on the icon. When Home first shows (the app opens), a gold ring
 * beats around the icon for a few seconds (`HEARTBEATS`), then stops. With
 * reduce motion on, only the dot shows. Screen readers hear "new" in the
 * label instead.
 */
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { Icon } from '@/components/Icon';

/** How many heartbeats play when the app opens. */
export const HEARTBEATS = 3;
/** One heartbeat ("lub-dub" and the rest), in ms. */
export const HEARTBEAT_MS = 2000;
/**
 * The parts of a beat: a slow swell (lub), a small dip that keeps the ring
 * in view, a second swell (dub). The rest of the beat fades out. Slow on
 * purpose: a quick pop of the ring feels nagging (owner, #471).
 */
const LUB_MS = 520;
const DIP_MS = 260;
const DUB_MS = 520;
/** The wait before the first beat, so Home has drawn. */
const START_DELAY_MS = 400;

/** The ring around the icon, and the dot, in points. */
const ICON = 18;
const RING = 30;
const DOT = 10;

export interface WhatsNewButtonProps {
  /** A release this phone has not opened yet: the dot and the heartbeat. */
  fresh: boolean;
  onPress: () => void;
}

export function WhatsNewButton({ fresh, onPress }: WhatsNewButtonProps) {
  const { t } = useTranslation();
  const { theme } = useUnistyles();
  const label = t('home.whatsNew.label');
  return (
    <Pressable
      testID="home-whats-new"
      accessibilityRole="button"
      accessibilityLabel={fresh ? t('home.whatsNew.labelFresh') : label}
      hitSlop={8}
      onPress={onPress}
      style={({ pressed }) => [styles.button, fresh && styles.fresh, pressed && styles.pressed]}>
      <View style={styles.iconBox} collapsable={false}>
        {fresh ? (
          <BeatingIcon color={theme.colors.accentLight} />
        ) : (
          <Icon name="sparkles" size={ICON} color={theme.colors.accent} />
        )}
        {fresh ? (
          <View
            testID="home-whats-new-dot"
            style={styles.dot}
            importantForAccessibility="no-hide-descendants"
            accessibilityElementsHidden
          />
        ) : null}
      </View>
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
}

/**
 * The icon with a gold ring around it that beats `HEARTBEATS` times: the
 * ring slowly swells and glows, the icon grows a little with it. With reduce motion: the
 * icon only, still.
 */
function BeatingIcon({ color }: { color: string }) {
  const reduceMotion = useReducedMotion();
  const beat = useSharedValue(0);
  useEffect(() => {
    if (reduceMotion) return undefined;
    const ease = Easing.inOut(Easing.sin);
    const to = (value: number, ms: number) => withTiming(value, { duration: ms, easing: ease });
    beat.set(
      withDelay(
        START_DELAY_MS,
        withRepeat(
          withSequence(
            to(0.6, LUB_MS),
            to(0.35, DIP_MS),
            to(1, DUB_MS),
            to(0, HEARTBEAT_MS - LUB_MS - DIP_MS - DUB_MS),
          ),
          HEARTBEATS,
          false,
        ),
      ),
    );
    return () => cancelAnimation(beat);
  }, [reduceMotion, beat]);
  const ring = useAnimatedStyle(() => ({
    opacity: beat.get(),
    transform: [{ scale: 0.85 + 0.3 * beat.get() }],
  }));
  const icon = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + 0.15 * beat.get() }],
  }));
  if (reduceMotion) return <Icon name="sparkles" size={ICON} color={color} />;
  return (
    <>
      <Animated.View
        testID="home-whats-new-heartbeat"
        style={[styles.ring, ring]}
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden
      />
      <Animated.View style={icon}>
        <Icon name="sparkles" size={ICON} color={color} />
      </Animated.View>
    </>
  );
}

const styles = StyleSheet.create((theme) => ({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
    gap: theme.space.xs,
    minHeight: theme.touch.minTarget,
    paddingLeft: theme.space.xs,
    paddingRight: theme.space.md,
    borderRadius: theme.touch.minTarget / 2,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  fresh: {
    borderColor: theme.colors.accentLine,
  },
  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.97 }],
  },
  iconBox: {
    width: RING + 4,
    height: RING + 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
    width: RING,
    height: RING,
    borderRadius: RING / 2,
    borderWidth: 2,
    borderColor: theme.colors.accentLight,
    backgroundColor: theme.colors.accentWash,
  },
  label: {
    ...theme.type.bodyStrong,
    flexShrink: 1,
    color: theme.colors.text,
  },
  dot: {
    position: 'absolute',
    top: 2,
    right: 2,
    width: DOT,
    height: DOT,
    borderRadius: DOT / 2,
    backgroundColor: theme.colors.accentLight,
    borderWidth: 1.5,
    borderColor: theme.colors.surface,
  },
}));

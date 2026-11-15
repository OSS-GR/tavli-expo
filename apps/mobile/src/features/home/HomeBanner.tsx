/**
 * A banner card on Home (#342): an icon, a title, a line and two
 * buttons. The "Learn to play" card (#128) and the reminder card (#404)
 * use it. No text has a line limit: large fonts wrap. The reminder is the
 * raised card that leads Home; the lesson card is a `tile`, in the look
 * and size of the mode tiles below it (#517).
 */
import { Pressable, Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { Icon } from '@/components/Icon';
import type { IconName } from '@/components/icons';
import { surfaceStyle } from '@/components/Surface';

import { BADGE, BADGE_ICON, tileSurface } from './ModeTile';

export type HomeBannerTier = 'tile' | 'raised';

export interface HomeBannerButton {
  readonly testID: string;
  readonly label: string;
  readonly onPress: () => void;
}

export interface HomeBannerProps {
  readonly testID: string;
  readonly icon: IconName;
  readonly title: string;
  readonly line: string;
  /** The filled button. */
  readonly main: HomeBannerButton;
  /** The underlined button next to it. */
  readonly other: HomeBannerButton;
  /** `tile`: like the mode tiles (the default). `raised`: the card that leads Home. */
  readonly tier?: HomeBannerTier;
}

export function HomeBanner({
  testID,
  icon,
  title,
  line,
  main,
  other,
  tier = 'tile',
}: HomeBannerProps) {
  const { theme } = useUnistyles();
  return (
    <View testID={testID} style={styles.card(tier)}>
      <View style={styles.head}>
        <View style={styles.badge(tier)}>
          <Icon
            name={icon}
            size={tier === 'tile' ? BADGE_ICON : 22}
            color={theme.colors.turnText}
          />
        </View>
        <View style={styles.texts}>
          <Text style={styles.title} accessibilityRole="header">
            {title}
          </Text>
          <Text style={styles.line(tier)}>{line}</Text>
        </View>
      </View>
      <View style={styles.buttons}>
        <Pressable
          testID={main.testID}
          accessibilityRole="button"
          accessibilityLabel={main.label}
          onPress={main.onPress}
          style={({ pressed }) => [styles.start(tier), pressed && styles.pressed]}>
          <Text style={styles.startText(tier)}>{main.label}</Text>
        </Pressable>
        <Pressable
          testID={other.testID}
          accessibilityRole="button"
          accessibilityLabel={other.label}
          onPress={other.onPress}
          hitSlop={4}
          style={({ pressed }) => [styles.dismiss, pressed && styles.pressed]}>
          <Text style={styles.dismissText(tier)}>{other.label}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  card: (tier: HomeBannerTier) => ({
    ...(tier === 'tile' ? tileSurface(theme) : surfaceStyle(theme, 'raised')),
    gap: tier === 'tile' ? theme.space.xs : theme.space.sm,
    padding: tier === 'tile' ? theme.space.md : theme.space.lg,
  }),
  head: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.space.md,
  },
  badge: (tier: HomeBannerTier) => ({
    width: tier === 'tile' ? BADGE : theme.touch.minTarget,
    height: tier === 'tile' ? BADGE : theme.touch.minTarget,
    borderRadius: tier === 'tile' ? theme.radii.md : theme.radii.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.backgroundDeep,
  }),
  texts: {
    flex: 1,
    gap: theme.space.xxs,
  },
  title: {
    ...theme.type.bodyStrong,
    color: theme.colors.text,
  },
  line: (tier: HomeBannerTier) => ({
    ...(tier === 'tile' ? theme.type.footnote : theme.type.caption),
    color: theme.colors.textDim,
  }),
  // Greek labels are longer: the buttons wrap instead of shrinking.
  buttons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: theme.space.md,
    paddingTop: theme.space.xs,
  },
  start: (tier: HomeBannerTier) => ({
    minHeight: theme.touch.minTarget,
    justifyContent: 'center',
    paddingHorizontal: tier === 'tile' ? theme.space.lg : theme.space.xl,
    borderRadius: theme.radii.pill,
    backgroundColor: theme.colors.accent,
  }),
  startText: (tier: HomeBannerTier) => ({
    ...(tier === 'tile'
      ? { ...theme.type.callout, fontWeight: '600' as const }
      : theme.type.bodyStrong),
    color: theme.colors.onAccent,
  }),
  dismiss: {
    minHeight: theme.touch.minTarget,
    justifyContent: 'center',
    paddingHorizontal: theme.space.sm,
  },
  dismissText: (tier: HomeBannerTier) => ({
    ...(tier === 'tile'
      ? { ...theme.type.callout, fontWeight: '600' as const }
      : theme.type.bodyStrong),
    color: theme.colors.text,
    textDecorationLine: 'underline',
  }),
  pressed: {
    opacity: 0.7,
  },
}));

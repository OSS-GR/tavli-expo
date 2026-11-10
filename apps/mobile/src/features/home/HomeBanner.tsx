/**
 * A brass-edged banner on Home (#342): an icon, a title, a line and two
 * buttons. The "Learn to play" card (#128) and the reminder card (#404)
 * use it. No text has a line limit: large fonts wrap.
 */
import { Pressable, Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { Icon } from '@/components/Icon';
import type { IconName } from '@/components/icons';

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
}

export function HomeBanner({ testID, icon, title, line, main, other }: HomeBannerProps) {
  const { theme } = useUnistyles();
  return (
    <View testID={testID} style={styles.card}>
      <View style={styles.head}>
        <View style={styles.badge}>
          <Icon name={icon} size={22} color={theme.colors.turnText} />
        </View>
        <View style={styles.texts}>
          <Text style={styles.title} accessibilityRole="header">
            {title}
          </Text>
          <Text style={styles.line}>{line}</Text>
        </View>
      </View>
      <View style={styles.buttons}>
        <Pressable
          testID={main.testID}
          accessibilityRole="button"
          accessibilityLabel={main.label}
          onPress={main.onPress}
          style={({ pressed }) => [styles.start, pressed && styles.pressed]}>
          <Text style={styles.startText}>{main.label}</Text>
        </Pressable>
        <Pressable
          testID={other.testID}
          accessibilityRole="button"
          accessibilityLabel={other.label}
          onPress={other.onPress}
          hitSlop={4}
          style={({ pressed }) => [styles.dismiss, pressed && styles.pressed]}>
          <Text style={styles.dismissText}>{other.label}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  // A brass-tinted banner (#342): it stands out from the walnut tiles.
  card: {
    gap: theme.space.sm,
    padding: theme.space.lg,
    borderRadius: theme.radii.xl,
    borderWidth: 1,
    borderColor: theme.colors.accentLine,
    backgroundColor: theme.colors.surface,
    backgroundImage: `linear-gradient(135deg, ${theme.colors.accentWash} 0%, ${theme.colors.surface} 80%)`,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.space.md,
  },
  badge: {
    width: theme.touch.minTarget,
    height: theme.touch.minTarget,
    borderRadius: theme.radii.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.backgroundDeep,
  },
  texts: {
    flex: 1,
    gap: theme.space.xxs,
  },
  title: {
    ...theme.type.bodyStrong,
    color: theme.colors.text,
  },
  line: {
    ...theme.type.caption,
    color: theme.colors.textDim,
  },
  // Greek labels are longer: the buttons wrap instead of shrinking.
  buttons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: theme.space.md,
    paddingTop: theme.space.xs,
  },
  start: {
    minHeight: theme.touch.minTarget,
    justifyContent: 'center',
    paddingHorizontal: theme.space.xl,
    borderRadius: theme.radii.pill,
    backgroundColor: theme.colors.accent,
  },
  startText: {
    ...theme.type.bodyStrong,
    color: theme.colors.onAccent,
  },
  dismiss: {
    minHeight: theme.touch.minTarget,
    justifyContent: 'center',
    paddingHorizontal: theme.space.sm,
  },
  dismissText: {
    ...theme.type.bodyStrong,
    color: theme.colors.text,
    textDecorationLine: 'underline',
  },
  pressed: {
    opacity: 0.7,
  },
}));

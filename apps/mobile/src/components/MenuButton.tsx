import { Pressable, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

/** `primary`: filled. `secondary`: outlined. `locked`: dashed, with a "Coming soon" chip. */
export type MenuButtonKind = 'primary' | 'secondary' | 'locked';

export interface MenuButtonProps {
  title: string;
  subtitle?: string;
  /** A short mark in the round badge, for example "AI" or "2P". */
  badge?: string;
  kind?: MenuButtonKind;
  /** The chip of a locked button. */
  chip?: string;
  onPress: () => void;
  testID?: string;
}

/**
 * A full-width Home button (wireframe 3). A locked button keeps its full
 * target, so a tap can still show "Coming soon".
 */
export function MenuButton({
  title,
  subtitle,
  badge,
  kind = 'secondary',
  chip,
  onPress,
  testID,
}: MenuButtonProps) {
  const locked = kind === 'locked';
  const label = [title, subtitle, locked ? chip : undefined].filter(Boolean).join(', ');
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: locked }}
      onPress={onPress}
      style={({ pressed }) => [styles.button(kind), pressed && styles.pressed]}>
      {badge ? (
        <View style={styles.badge(kind)}>
          {/* A mark in a fixed circle: it keeps its size with a large system font. */}
          <Text
            style={styles.badgeText(kind)}
            importantForAccessibility="no"
            allowFontScaling={false}>
            {badge}
          </Text>
        </View>
      ) : null}
      <View style={styles.texts}>
        <Text style={styles.title(kind)}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle(kind)}>{subtitle}</Text> : null}
      </View>
      {locked && chip ? (
        <View style={styles.chip}>
          <Text style={styles.chipText}>{chip}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create((theme) => ({
  button: (kind: MenuButtonKind) => ({
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.md,
    minHeight: theme.touch.button + theme.space.sm,
    paddingHorizontal: theme.space.lg,
    paddingVertical: theme.space.md,
    borderRadius: theme.radii.lg,
    borderWidth: 2,
    borderStyle: kind === 'locked' ? 'dashed' : 'solid',
    borderColor: kind === 'primary' ? theme.colors.accent : theme.colors.border,
    backgroundColor:
      kind === 'primary'
        ? theme.colors.accent
        : kind === 'locked'
          ? 'transparent'
          : theme.colors.surface,
  }),
  pressed: {
    opacity: 0.75,
  },
  badge: (kind: MenuButtonKind) => ({
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: kind === 'primary' ? theme.colors.onAccent : theme.colors.surfaceSelected,
  }),
  badgeText: (kind: MenuButtonKind) => ({
    ...theme.type.section,
    color:
      kind === 'primary'
        ? theme.colors.accent
        : kind === 'locked'
          ? theme.colors.textDisabled
          : theme.colors.text,
  }),
  texts: {
    flex: 1,
  },
  title: (kind: MenuButtonKind) => ({
    ...theme.type.title,
    color:
      kind === 'primary'
        ? theme.colors.onAccent
        : kind === 'locked'
          ? theme.colors.textDisabled
          : theme.colors.text,
  }),
  subtitle: (kind: MenuButtonKind) => ({
    ...theme.type.caption,
    color:
      kind === 'primary'
        ? theme.colors.onAccent
        : kind === 'locked'
          ? theme.colors.textDisabled
          : theme.colors.textDim,
  }),
  chip: {
    paddingHorizontal: theme.space.sm,
    paddingVertical: theme.space.xxs,
    borderRadius: theme.radii.pill,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  chipText: {
    ...theme.type.section,
    color: theme.colors.textDim,
  },
}));

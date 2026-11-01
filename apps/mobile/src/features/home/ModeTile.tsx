/**
 * A play mode on Home (#342): an icon, a title and a short line. `wide`
 * tiles fill the row (icon left); the others share it two by two and fall
 * back to one per row with a large font (`homeGrid` in `HomeScreen`). A
 * locked tile keeps its full target, so a tap can still say "Coming soon".
 */
import { Pressable, Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { Icon } from '@/components/Icon';
import type { IconName } from '@/components/icons';

/** `primary`: brass. `secondary`: walnut. `locked`: dashed, with a chip. */
export type ModeTileKind = 'primary' | 'secondary' | 'locked';

export interface ModeTileProps {
  title: string;
  subtitle?: string;
  icon: IconName;
  kind?: ModeTileKind;
  /** Fills the row, with the icon on the left. */
  wide?: boolean;
  /** The chip of a locked tile, for example "Coming soon". */
  chip?: string;
  onPress: () => void;
  testID?: string;
}

export function ModeTile({
  title,
  subtitle,
  icon,
  kind = 'secondary',
  wide = false,
  chip,
  onPress,
  testID,
}: ModeTileProps) {
  const { theme } = useUnistyles();
  const locked = kind === 'locked';
  const label = [title, subtitle, locked ? chip : undefined].filter(Boolean).join(', ');
  const iconColor =
    kind === 'primary'
      ? theme.colors.accent
      : locked
        ? theme.colors.textDisabled
        : theme.colors.turnText;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: locked }}
      onPress={onPress}
      style={({ pressed }) => [styles.tile(kind, wide), pressed && styles.pressed]}>
      <View style={styles.badge(kind)}>
        <Icon name={icon} size={22} color={iconColor} />
      </View>
      <View style={styles.texts(wide)}>
        <Text style={styles.title(kind)}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle(kind)}>{subtitle}</Text> : null}
        {locked && chip ? (
          <View style={styles.chip}>
            <Text style={styles.chipText}>{chip}</Text>
          </View>
        ) : null}
      </View>
      {wide && !locked ? (
        <Icon
          name="chevronRight"
          size={20}
          color={kind === 'primary' ? theme.colors.onAccent : theme.colors.textDim}
        />
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create((theme) => ({
  // A wide tile fills its row; a narrow one fills its cell's height, so two
  // tiles side by side match.
  tile: (kind: ModeTileKind, wide: boolean) => ({
    ...(wide ? { width: '100%' as const } : { flexGrow: 1 }),
    flexDirection: wide ? 'row' : 'column',
    alignItems: wide ? 'center' : 'flex-start',
    gap: theme.space.md,
    padding: theme.space.lg,
    borderRadius: theme.radii.xl,
    borderWidth: kind === 'locked' ? 2 : 1,
    borderStyle: kind === 'locked' ? 'dashed' : 'solid',
    borderColor: kind === 'primary' ? theme.colors.accent : theme.colors.border,
    backgroundColor:
      kind === 'primary'
        ? theme.colors.accent
        : kind === 'locked'
          ? 'transparent'
          : theme.colors.surface,
    ...(kind === 'secondary'
      ? {
          backgroundImage: `linear-gradient(160deg, ${theme.colors.surfaceSelected} 0%, ${theme.colors.surface} 70%)`,
        }
      : {}),
    ...(kind === 'locked' ? {} : { boxShadow: '0px 8px 20px rgba(0, 0, 0, 0.3)' }),
  }),
  pressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
  badge: (kind: ModeTileKind) => ({
    width: theme.touch.minTarget,
    height: theme.touch.minTarget,
    borderRadius: theme.radii.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: kind === 'primary' ? theme.colors.onAccent : theme.colors.backgroundDeep,
  }),
  texts: (wide: boolean) => ({
    flex: wide ? 1 : undefined,
    alignSelf: wide ? undefined : 'stretch',
    gap: theme.space.xxs,
  }),
  title: (kind: ModeTileKind) => ({
    ...theme.type.bodyStrong,
    color:
      kind === 'primary'
        ? theme.colors.onAccent
        : kind === 'locked'
          ? theme.colors.textDisabled
          : theme.colors.text,
  }),
  subtitle: (kind: ModeTileKind) => ({
    ...theme.type.caption,
    color:
      kind === 'primary'
        ? theme.colors.onAccent
        : kind === 'locked'
          ? theme.colors.textDisabled
          : theme.colors.textDim,
  }),
  chip: {
    alignSelf: 'flex-start',
    marginTop: theme.space.xs,
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

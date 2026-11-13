/**
 * A play mode on Home (#342): an icon, a title and a short line. `wide`
 * tiles fill the row (icon left, chevron right); the others share it two by
 * two and fall back to one per row with a large font (`cell` in
 * `HomeScreen`). A locked tile keeps its full target, so a tap can still
 * say "Coming soon".
 *
 * The Figma pass (#517): a tray with the brass line icon on it (no dark
 * badge) and the title in Piazzolla. Brass fill is for the one main button
 * of Home, so no tile has it.
 */
import { Pressable, Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { Icon } from '@/components/Icon';
import type { IconName } from '@/components/icons';
import { surfaceStyle } from '@/components/Surface';

/** `open`: a tray. `locked`: dashed, with a chip. */
export type ModeTileKind = 'open' | 'locked';

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
  kind = 'open',
  wide = false,
  chip,
  onPress,
  testID,
}: ModeTileProps) {
  const { theme } = useUnistyles();
  const locked = kind === 'locked';
  const label = [title, subtitle, locked ? chip : undefined].filter(Boolean).join(', ');
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: locked }}
      onPress={onPress}
      style={({ pressed }) => [styles.tile(locked, wide), pressed && styles.pressed]}>
      <Icon
        name={icon}
        size={28}
        color={locked ? theme.colors.textDisabled : theme.colors.accentLight}
      />
      <View style={styles.texts(wide)}>
        <Text style={styles.title(locked)}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle(locked)}>{subtitle}</Text> : null}
        {locked && chip ? (
          <View style={styles.chip}>
            <Text style={styles.chipText}>{chip}</Text>
          </View>
        ) : null}
      </View>
      {wide && !locked ? <Icon name="chevronRight" size={20} color={theme.colors.textDim} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create((theme) => ({
  // A wide tile fills its row; a narrow one fills its cell's height, so two
  // tiles side by side match.
  tile: (locked: boolean, wide: boolean) => ({
    ...(locked
      ? {
          borderRadius: theme.radii.tray,
          borderWidth: 2,
          borderStyle: 'dashed' as const,
          borderColor: theme.colors.border,
        }
      : surfaceStyle(theme, 'tray')),
    ...(wide ? { width: '100%' as const } : { flexGrow: 1, minHeight: 118 }),
    flexDirection: wide ? 'row' : 'column',
    alignItems: wide ? 'center' : 'flex-start',
    gap: wide ? theme.space.md : 10,
    padding: theme.space.lg,
  }),
  pressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
  texts: (wide: boolean) => ({
    flex: wide ? 1 : undefined,
    alignSelf: wide ? undefined : 'stretch',
    gap: theme.space.xxs,
  }),
  title: (locked: boolean) => ({
    ...theme.type.title3,
    color: locked ? theme.colors.textDisabled : theme.colors.text,
  }),
  subtitle: (locked: boolean) => ({
    ...theme.type.footnote,
    color: locked ? theme.colors.textDisabled : theme.colors.textDim,
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

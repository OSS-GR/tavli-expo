/**
 * A play mode on Home (#342): an icon, a title and a short line, side by
 * side (#517: compact, so no tile has an empty half). `wide` tiles fill the
 * row and get a chevron; the others share it two by two and fall back to
 * one per row with a large font (`inRows` in `HomeScreen`). A locked tile
 * keeps its full target, so a tap can still say "Coming soon".
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
  /** Fills the row, with a chevron on the right. */
  wide?: boolean;
  /** The line is news to act on (a friend request): brass. */
  highlight?: boolean;
  /** The chip of a locked tile, for example "Coming soon". */
  chip?: string;
  /** `link` for a page to read (How to play, History). Default: `button`. */
  accessibilityRole?: 'button' | 'link';
  accessibilityHint?: string;
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
  highlight = false,
  accessibilityRole = 'button',
  accessibilityHint,
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
      accessibilityRole={accessibilityRole}
      accessibilityLabel={label}
      {...(accessibilityHint ? { accessibilityHint } : {})}
      accessibilityState={{ disabled: locked }}
      onPress={onPress}
      style={({ pressed }) => [styles.tile(kind, wide), pressed && styles.pressed]}>
      <View style={styles.badge(kind)}>
        <Icon name={icon} size={BADGE_ICON} color={iconColor} />
      </View>
      <View style={styles.texts}>
        <Text style={styles.title(kind, wide)}>{title}</Text>
        {subtitle ? (
          <Text style={[styles.subtitle(kind, wide), highlight && styles.highlight]}>
            {subtitle}
          </Text>
        ) : null}
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

/** The icon badge and its icon, in points. Home's banner uses them too. */
export const BADGE = 32;
export const BADGE_ICON = 18;

interface TileTheme {
  colors: { border: string; surface: string; surfaceSelected: string };
  radii: { xl: number };
}

/**
 * The walnut tile: edge, fill, corners and shadow. Every card in Home's
 * lower half uses it (#517), so the tiles, the lesson banner and the links
 * look alike.
 */
export function tileSurface(theme: TileTheme) {
  return {
    borderRadius: theme.radii.xl,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    backgroundImage: `linear-gradient(160deg, ${theme.colors.surfaceSelected} 0%, ${theme.colors.surface} 70%)`,
    boxShadow: '0px 8px 20px rgba(0, 0, 0, 0.3)',
  };
}

const styles = StyleSheet.create((theme) => ({
  // A wide tile fills its row; a narrow one fills its cell's height, so two
  // tiles side by side match.
  tile: (kind: ModeTileKind, wide: boolean) => ({
    ...(kind === 'secondary' ? tileSurface(theme) : {}),
    ...(wide ? { width: '100%' as const } : { flexGrow: 1 }),
    flexDirection: 'row',
    alignItems: 'center',
    gap: wide ? theme.space.md : theme.space.sm,
    paddingVertical: theme.space.md,
    paddingHorizontal: theme.space.md,
    ...(kind === 'primary'
      ? {
          borderRadius: theme.radii.xl,
          borderWidth: 1,
          borderColor: theme.colors.accent,
          backgroundColor: theme.colors.accent,
          boxShadow: '0px 8px 20px rgba(0, 0, 0, 0.3)',
        }
      : {}),
    ...(kind === 'locked'
      ? {
          borderRadius: theme.radii.xl,
          borderWidth: 2,
          borderStyle: 'dashed' as const,
          borderColor: theme.colors.border,
          backgroundColor: 'transparent',
        }
      : {}),
  }),
  pressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
  badge: (kind: ModeTileKind) => ({
    width: BADGE,
    height: BADGE,
    borderRadius: theme.radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: kind === 'primary' ? theme.colors.onAccent : theme.colors.backgroundDeep,
  }),
  texts: {
    flex: 1,
    minWidth: 0,
    gap: theme.space.xxs,
  },
  // Two tiles share a row, so their text is a step smaller than a wide
  // tile's: "Pass-and-play" fits on one line next to the badge.
  title: (kind: ModeTileKind, wide: boolean) => ({
    ...(wide ? theme.type.bodyStrong : { ...theme.type.callout, fontWeight: '600' as const }),
    color:
      kind === 'primary'
        ? theme.colors.onAccent
        : kind === 'locked'
          ? theme.colors.textDisabled
          : theme.colors.text,
  }),
  subtitle: (kind: ModeTileKind, wide: boolean) => ({
    ...(wide ? theme.type.caption : theme.type.footnote),
    color:
      kind === 'primary'
        ? theme.colors.onAccent
        : kind === 'locked'
          ? theme.colors.textDisabled
          : theme.colors.textDim,
  }),
  highlight: {
    color: theme.colors.accentLight,
    fontWeight: '600',
  },
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

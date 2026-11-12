import { ActivityIndicator, Pressable, Text, useWindowDimensions, View } from 'react-native';
import type { BoardColors, UiColors } from '@tavli/ui';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { Icon } from './Icon';
import type { IconName } from './icons';

/**
 * `primary`: brass gradient, one per screen. `secondary`: a raised surface
 * with a brass hairline. `text`: brass text with no frame ("See all").
 * `destructive`: a red wash for an action that removes something.
 * `destructiveText`: coral text only, for a quiet risky choice ("Cancel the
 * invite").
 */
export type ActionButtonKind = 'primary' | 'secondary' | 'text' | 'destructive' | 'destructiveText';

/** `regular` is 52 pt tall; `small` is 36 pt (still a 44 pt hit area), for row buttons. */
export type ActionButtonSize = 'regular' | 'small';

export interface ActionButtonProps {
  label: string;
  /** A second, smaller line, e.g. "or swipe the board". */
  subtitle?: string;
  kind?: ActionButtonKind;
  size?: ActionButtonSize;
  /** A line icon before the label. It only decorates: screen readers hear the label. */
  icon?: IconName;
  disabled?: boolean;
  /**
   * The action is running: a spinner shows before the label, presses are
   * ignored and screen readers hear "busy". The button keeps its normal look.
   */
  busy?: boolean;
  onPress: () => void;
  testID?: string;
  /** Grow to fill the row. */
  grow?: boolean;
  /**
   * Less side padding and no minimum width, for a narrow column (the side
   * columns of the landscape game screen, #185). Still 52 pt tall.
   */
  compact?: boolean;
  /** What screen readers say, when the label has a symbol ("↶ Undo" → "Undo"). */
  accessibilityLabel?: string;
  /**
   * A 52 pt square with only the icon (the game's Hint, #499). Screen
   * readers still hear the label, and with a large font the label shows.
   */
  iconOnly?: boolean;
}

/** From this font scale an `iconOnly` button shows its label too. */
export const ICON_ONLY_LABEL_SCALE = 1.3;

/** The small button's hit area grows to 44 pt (36 + 4 + 4). */
const SMALL_HIT_SLOP = { top: 4, bottom: 4, left: 0, right: 0 };

/**
 * A button in the Figma polish pass style (#491, Components → Buttons):
 * five kinds, a pressed look per kind, a flat disabled look (never dashed)
 * and a busy state. It shrinks a little when pressed. Text may wrap for
 * longer Greek labels and large system fonts; the button grows with it.
 */
export function ActionButton({
  label,
  subtitle,
  kind = 'primary',
  size = 'regular',
  icon,
  disabled = false,
  busy = false,
  onPress,
  testID,
  grow = false,
  compact = false,
  accessibilityLabel = label,
  iconOnly = false,
}: ActionButtonProps) {
  const { theme } = useUnistyles();
  const { fontScale } = useWindowDimensions();
  const square = iconOnly && icon !== undefined && fontScale < ICON_ONLY_LABEL_SCALE;
  const inactive = disabled || busy;
  const small = size === 'small';
  const color = labelColor(theme.colors, kind, disabled);
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={subtitle ? `${accessibilityLabel}, ${subtitle}` : accessibilityLabel}
      // A busy button does nothing, so screen readers hear it as disabled and busy.
      accessibilityState={{ disabled: inactive, busy }}
      disabled={inactive}
      onPress={onPress}
      {...(small ? { hitSlop: SMALL_HIT_SLOP } : {})}
      style={({ pressed }) => [
        styles.button(kind, disabled),
        small && styles.small,
        grow && styles.grow,
        compact && styles.compact,
        square && styles.square,
        pressed && !inactive && styles.pressed(kind),
      ]}>
      <View style={styles.row}>
        {busy ? (
          <ActivityIndicator testID={testID ? `${testID}-busy` : undefined} color={color} />
        ) : icon ? (
          <Icon name={icon} color={color} size={small ? 18 : 20} />
        ) : null}
        {/* No line limit: with a large system font the text wraps, never cut. */}
        {square ? null : (
          <Text style={[styles.label, small && styles.smallLabel, { color }]}>{label}</Text>
        )}
      </View>
      {subtitle ? <Text style={[styles.subtitle, { color }]}>{subtitle}</Text> : null}
    </Pressable>
  );
}

function labelColor(colors: UiColors, kind: ActionButtonKind, disabled: boolean): string {
  switch (kind) {
    case 'primary':
      return disabled ? colors.onAccentMuted : colors.onAccent;
    case 'secondary':
      return disabled ? colors.textFaint : colors.text;
    case 'text':
      return colors.accentLight;
    case 'destructive':
    case 'destructiveText':
      return colors.problem;
  }
}

const styles = StyleSheet.create((theme) => ({
  button: (kind: ActionButtonKind, disabled: boolean) => ({
    minHeight: theme.touch.button,
    minWidth: 104,
    paddingHorizontal: theme.space.lg,
    paddingVertical: theme.space.sm,
    borderRadius: theme.radii.lg,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    ...frame(theme.colors, theme.board, kind, disabled),
  }),
  small: {
    minHeight: 36,
    minWidth: 0,
    paddingHorizontal: theme.space.md,
    paddingVertical: theme.space.xs,
    borderRadius: theme.radii.md,
  },
  grow: {
    flex: 1,
  },
  compact: {
    minWidth: 0,
    paddingHorizontal: theme.space.xs,
  },
  square: {
    width: theme.touch.button,
    minWidth: theme.touch.button,
    paddingHorizontal: 0,
  },
  pressed: (kind: ActionButtonKind) => ({
    transform: [{ scale: 0.98 }],
    ...pressedFrame(theme.colors, kind),
  }),
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.space.sm,
  },
  label: {
    ...theme.type.bodyStrong,
    textAlign: 'center',
    flexShrink: 1,
  },
  smallLabel: {
    fontSize: 15,
    lineHeight: 20,
  },
  subtitle: {
    ...theme.type.caption,
    textAlign: 'center',
  },
}));

/** Fill, outline and shadow per kind (Figma: Components → Buttons). */
function frame(colors: UiColors, board: BoardColors, kind: ActionButtonKind, disabled: boolean) {
  switch (kind) {
    case 'primary':
      return disabled
        ? { borderColor: colors.accentMuted, backgroundColor: colors.accentMuted }
        : {
            borderColor: colors.accent,
            backgroundColor: colors.accent,
            // Lit from the top, like the Home tiles: a bright top edge and a drop shadow.
            backgroundImage: `linear-gradient(160deg, ${colors.accentLight} 0%, ${colors.accent} 70%)`,
            boxShadow: `inset 0px 1px 0px ${board.brassLight}, 0px 8px 18px rgba(0, 0, 0, 0.45)`,
          };
    case 'secondary':
      return disabled
        ? { borderColor: colors.surfaceRaised, backgroundColor: colors.surfaceSunken }
        : {
            borderColor: colors.accentLine,
            backgroundColor: colors.surfaceRaised,
            boxShadow: `inset 0px 1px 0px ${colors.border}`,
          };
    case 'destructive':
      return {
        borderColor: colors.problemLine,
        backgroundColor: colors.problemWash,
        ...(disabled ? { opacity: 0.45 } : {}),
      };
    case 'text':
    case 'destructiveText':
      return {
        borderColor: 'transparent',
        backgroundColor: 'transparent',
        ...(disabled ? { opacity: 0.45 } : {}),
      };
  }
}

function pressedFrame(colors: UiColors, kind: ActionButtonKind) {
  switch (kind) {
    case 'primary':
      return {
        backgroundImage: `linear-gradient(160deg, ${colors.accent} 0%, ${colors.accentPressed} 70%)`,
        boxShadow: 'inset 0px 2px 4px rgba(0, 0, 0, 0.35)',
      };
    case 'secondary':
      return { backgroundColor: colors.surface };
    case 'destructive':
      return { backgroundColor: colors.problemPressed };
    case 'text':
    case 'destructiveText':
      return { backgroundColor: colors.surfaceRaised };
  }
}

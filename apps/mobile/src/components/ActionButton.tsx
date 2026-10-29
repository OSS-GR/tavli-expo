import { Pressable, Text } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

/** `primary`: filled. `secondary`: outlined. `text`: no frame, for a quiet last choice ("Home"). */
export type ActionButtonKind = 'primary' | 'secondary' | 'text';

export interface ActionButtonProps {
  label: string;
  /** A second, smaller line, e.g. "or swipe the board". */
  subtitle?: string;
  kind?: ActionButtonKind;
  disabled?: boolean;
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
}

/**
 * A big game button (wireframe rules: main = filled brass, second =
 * outlined, quiet = text only, disabled = dashed). At least 52 pt tall,
 * and text may wrap for longer Greek labels and large system fonts.
 */
export function ActionButton({
  label,
  subtitle,
  kind = 'primary',
  disabled = false,
  onPress,
  testID,
  grow = false,
  compact = false,
  accessibilityLabel = label,
}: ActionButtonProps) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={subtitle ? `${accessibilityLabel}, ${subtitle}` : accessibilityLabel}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button(kind, disabled),
        grow && styles.grow,
        compact && styles.compact,
        pressed && !disabled && styles.pressed,
      ]}>
      {/* No line limit: with a large system font the text wraps, never cut. */}
      <Text style={styles.label(kind, disabled)}>{label}</Text>
      {subtitle ? <Text style={styles.subtitle(kind, disabled)}>{subtitle}</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create((theme) => ({
  button: (kind: ActionButtonKind, disabled: boolean) => ({
    minHeight: theme.touch.button,
    minWidth: 104,
    paddingHorizontal: theme.space.lg,
    paddingVertical: theme.space.sm,
    borderRadius: theme.radii.lg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderStyle: disabled ? 'dashed' : 'solid',
    borderColor: disabled
      ? theme.colors.border
      : kind === 'primary'
        ? theme.colors.accent
        : kind === 'text'
          ? 'transparent'
          : theme.colors.border,
    backgroundColor: disabled
      ? 'transparent'
      : kind === 'primary'
        ? theme.colors.accent
        : kind === 'text'
          ? 'transparent'
          : theme.colors.surface,
  }),
  grow: {
    flex: 1,
  },
  compact: {
    minWidth: 0,
    paddingHorizontal: theme.space.xs,
  },
  pressed: {
    opacity: 0.75,
  },
  label: (kind: ActionButtonKind, disabled: boolean) => ({
    ...theme.type.bodyStrong,
    textAlign: 'center',
    color: disabled
      ? theme.colors.textDisabled
      : kind === 'primary'
        ? theme.colors.onAccent
        : theme.colors.text,
  }),
  subtitle: (kind: ActionButtonKind, disabled: boolean) => ({
    ...theme.type.caption,
    textAlign: 'center',
    color: disabled
      ? theme.colors.textDisabled
      : kind === 'primary'
        ? theme.colors.onAccent
        : theme.colors.textDim,
  }),
}));

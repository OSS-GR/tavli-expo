import { Pressable, Text } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

export type ActionButtonKind = 'primary' | 'secondary';

export interface ActionButtonProps {
  label: string;
  /** A second, smaller line, e.g. "or tap the board". */
  subtitle?: string;
  kind?: ActionButtonKind;
  disabled?: boolean;
  onPress: () => void;
  testID?: string;
  /** Grow to fill the row. */
  grow?: boolean;
}

/**
 * A big game button (wireframe rules: main = filled brass, second =
 * outlined, disabled = dashed). At least 52 pt tall, and text may wrap
 * for longer Greek labels.
 */
export function ActionButton({
  label,
  subtitle,
  kind = 'primary',
  disabled = false,
  onPress,
  testID,
  grow = false,
}: ActionButtonProps) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={subtitle ? `${label}, ${subtitle}` : label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button(kind, disabled),
        grow && styles.grow,
        pressed && !disabled && styles.pressed,
      ]}>
      <Text style={styles.label(kind, disabled)} numberOfLines={2}>
        {label}
      </Text>
      {subtitle ? (
        <Text style={styles.subtitle(kind, disabled)} numberOfLines={1}>
          {subtitle}
        </Text>
      ) : null}
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
        : theme.colors.border,
    backgroundColor: disabled
      ? 'transparent'
      : kind === 'primary'
        ? theme.colors.accent
        : theme.colors.surface,
  }),
  grow: {
    flex: 1,
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

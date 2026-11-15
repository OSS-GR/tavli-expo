/**
 * A round turn button (#185, Figma "18 Game · Portrait and landscape"): a
 * circle with a line icon, and its label under it. The same buttons sit on
 * the right rail in landscape and in the row under the board in portrait.
 *
 * - `primary`: the big brass circle (Roll, Confirm).
 * - `secondary`: a smaller dark circle with a brass line (Undo, Fast
 *   forward, Stop).
 * - `iconOnly`: no label under the circle (the hint); screen readers still
 *   hear the label.
 *
 * The label wraps for Greek and a large font; the circle keeps its size.
 * Screen readers hear the label (and the subtitle) as one button. A busy
 * button shows a spinner in place of its icon and does nothing.
 */
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { Icon } from '@/components/Icon';
import type { IconName } from '@/components/icons';

export type RailButtonKind = 'primary' | 'secondary';

export interface RailButtonProps {
  label: string;
  /** A second, smaller line under the label, e.g. "or swipe the board". */
  subtitle?: string;
  /** The screen draws the subtitle beside the button; screen readers still hear it. */
  subtitleBeside?: boolean;
  kind?: RailButtonKind;
  icon: IconName;
  /** The circle's size; the default follows `kind`. */
  size?: number;
  /** Shows no label under the circle (screen readers still hear it). */
  iconOnly?: boolean;
  /**
   * The height of the box the circle sits in, centered. A row of buttons of
   * different sizes gives each the same box, so the circles share one center
   * line and the labels one top line.
   */
  circleBox?: number;
  disabled?: boolean;
  /** The number of lines the label wraps to, after each layout. */
  onLabelLines?: (lines: number) => void;
  /** Working: a spinner in place of the icon; taps do nothing. */
  busy?: boolean;
  onPress: () => void;
  testID?: string;
  /** What screen readers say, when it differs from the label. */
  accessibilityLabel?: string;
}

/** The circle of the main button, and of Undo and the hint. */
export const RAIL_PRIMARY = 64;
export const RAIL_SECONDARY = 52;
/** Undo on the landscape rail: a little smaller, so the rail fits a short phone. */
export const RAIL_LANDSCAPE_SECONDARY = 48;
/** The line height of a label under a circle. */
export const RAIL_LABEL_LINE = 16;

export function RailButton({
  label,
  subtitle,
  subtitleBeside = false,
  kind = 'primary',
  icon,
  size = kind === 'primary' ? RAIL_PRIMARY : RAIL_SECONDARY,
  iconOnly = false,
  circleBox = size,
  disabled = false,
  busy = false,
  onLabelLines,
  onPress,
  testID,
  accessibilityLabel = label,
}: RailButtonProps) {
  const { theme } = useUnistyles();
  const primary = kind === 'primary';
  const inactive = disabled || busy;
  const iconColor = primary
    ? disabled
      ? theme.colors.onAccentMuted
      : theme.colors.onAccent
    : disabled
      ? theme.colors.textFaint
      : theme.colors.text;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={subtitle ? `${accessibilityLabel}, ${subtitle}` : accessibilityLabel}
      accessibilityState={{ disabled: inactive, busy }}
      disabled={inactive}
      onPress={onPress}
      // A small circle still gets a 44 pt target.
      hitSlop={Math.max(0, (theme.touch.minTarget - size) / 2)}
      style={styles.button}>
      {({ pressed }) => (
        <>
          <View style={styles.circleBox(Math.max(circleBox, size))}>
            <View style={[styles.circle(kind, size, disabled), pressed && styles.pressed(kind)]}>
              {busy ? (
                <ActivityIndicator
                  testID={testID ? `${testID}-busy` : undefined}
                  color={iconColor}
                />
              ) : (
                <Icon name={icon} color={iconColor} size={Math.round(size * 0.4)} />
              )}
            </View>
          </View>
          {/* No line limit: with Greek or a large font the text wraps, never cut. */}
          {iconOnly ? null : (
            <Text
              style={[styles.label, disabled && styles.labelDisabled]}
              onTextLayout={
                onLabelLines ? (event) => onLabelLines(event.nativeEvent.lines.length) : undefined
              }>
              {label}
            </Text>
          )}
          {subtitle && !iconOnly && !subtitleBeside ? (
            <Text style={styles.subtitle}>{subtitle}</Text>
          ) : null}
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create((theme) => ({
  button: {
    alignItems: 'center',
    gap: theme.space.xs,
  },
  circleBox: (height: number) => ({
    height,
    justifyContent: 'center',
  }),
  circle: (kind: RailButtonKind, size: number, disabled: boolean) => ({
    width: size,
    height: size,
    borderRadius: size / 2,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    ...(kind === 'primary'
      ? disabled
        ? { borderColor: theme.colors.accentMuted, backgroundColor: theme.colors.accentMuted }
        : {
            borderColor: theme.colors.accent,
            backgroundColor: theme.colors.accent,
            // Lit from the top, like the main ActionButton.
            backgroundImage: `linear-gradient(160deg, ${theme.colors.accentLight} 0%, ${theme.colors.accent} 70%)`,
            boxShadow: `inset 0px 1px 0px ${theme.board.brassLight}, 0px 6px 14px rgba(0, 0, 0, 0.45)`,
          }
      : disabled
        ? { borderColor: theme.colors.surfaceRaised, backgroundColor: theme.colors.surfaceSunken }
        : {
            borderColor: theme.colors.accentLine,
            backgroundColor: theme.colors.surfaceRaised,
            boxShadow: `inset 0px 1px 0px ${theme.colors.border}`,
          }),
  }),
  pressed: (kind: RailButtonKind) => ({
    transform: [{ scale: 0.96 }],
    ...(kind === 'primary'
      ? {
          backgroundImage: `linear-gradient(160deg, ${theme.colors.accent} 0%, ${theme.colors.accentPressed} 70%)`,
          boxShadow: 'inset 0px 2px 4px rgba(0, 0, 0, 0.35)',
        }
      : { backgroundColor: theme.colors.surface }),
  }),
  label: {
    ...theme.type.footnote,
    fontSize: 12,
    lineHeight: RAIL_LABEL_LINE,
    fontWeight: '600',
    textAlign: 'center',
    color: theme.colors.text,
  },
  labelDisabled: {
    color: theme.colors.textFaint,
  },
  subtitle: {
    ...theme.type.footnote,
    fontSize: 11,
    lineHeight: 14,
    textAlign: 'center',
    color: theme.colors.textDim,
  },
}));

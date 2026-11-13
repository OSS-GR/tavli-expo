/**
 * A titled group in one rounded card, in the Home style (#356). See "Shared
 * screen parts" in `docs/architecture/app-shell.md`.
 *
 * - `SectionCard`: an optional title (a `SectionHeader`), then one card, a
 *   tray (`Surface`, #496). By default each child
 *   is a row and thin lines sit between them; `padded` holds one block
 *   instead (a picker and its hint).
 * - `SectionRow`: a row with an optional icon, a label, a hint and a value.
 *   With `onPress` it is a button with a chevron.
 *
 * `ToggleRow` and `OptionList` see when they sit in a `SectionCard` and then
 * draw as plain rows of that card.
 */
import { Children, createContext, isValidElement, useContext, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { Icon } from './Icon';
import type { IconName } from './icons';
import { SectionHeader } from './SectionHeader';
import { surfaceStyle } from './Surface';

const InSectionCard = createContext(false);

/** True inside the rows of a `SectionCard`: a row then draws no frame or line of its own. */
export function useInSectionCard(): boolean {
  return useContext(InSectionCard);
}

/**
 * The card itself: a tray (#496). The inner view clips the rows to the
 * corners; the outer one keeps the lit top edge.
 */
export function CardFrame({ children, testID }: { children: ReactNode; testID?: string }) {
  return (
    <View testID={testID} style={styles.frame}>
      <View style={styles.clip}>{children}</View>
    </View>
  );
}

/** A thin line between two rows of a card. */
export function RowDivider() {
  return <View style={styles.divider} />;
}

export interface SectionCardProps {
  /** The section header above the card. */
  title?: string;
  children: ReactNode;
  /**
   * Pads the inside for one block that is not rows, for example a
   * `SegmentedControl` and its hint. Default: rows with lines between them.
   */
  padded?: boolean;
  testID?: string;
}

export function SectionCard({ title, children, padded = false, testID }: SectionCardProps) {
  // `toArray` drops null, false and undefined, so a hidden row leaves no
  // double line. A fragment counts as one row.
  const rows = Children.toArray(children);
  return (
    <View style={styles.section}>
      {title ? <SectionHeader title={title} /> : null}
      <CardFrame testID={testID}>
        {padded ? (
          <View style={styles.padded}>{children}</View>
        ) : (
          <InSectionCard.Provider value>
            {rows.map((row, index) => (
              <View key={isValidElement(row) ? row.key : index}>
                {index > 0 ? <RowDivider /> : null}
                {row}
              </View>
            ))}
          </InSectionCard.Provider>
        )}
      </CardFrame>
    </View>
  );
}

export interface SectionRowProps {
  label: string;
  /** One short line under the label. It may wrap. */
  hint?: string;
  /** A short value on the right, for example "Normal". */
  value?: string;
  /** A Lucide icon on the left: in a small dark badge, or bare (`iconLook`). */
  icon?: IconName;
  /**
   * `badge` (default): the icon in a small dark badge. `bare`: the brass
   * icon alone, as in the Settings index (#501).
   */
  iconLook?: 'badge' | 'bare';
  /** Makes the row one button, with a chevron on the right. */
  onPress?: () => void;
  /** Other content on the right, in place of `value`. */
  right?: ReactNode;
  /**
   * What screen readers say. Default for a button row: the label and the
   * value. A row with no `onPress` reads as one item only with it.
   */
  accessibilityLabel?: string;
  /** Default for a button row: the hint. */
  accessibilityHint?: string;
  /** A button row's role: `link` for a row that opens a web page. Default: `button`. */
  accessibilityRole?: 'button' | 'link';
  /** A button row that cannot be pressed now: dim label, read as disabled. */
  disabled?: boolean;
  /**
   * `danger`: the label and the icon in the problem coral, for a risky
   * action (Resign this game, #515). Default `normal`.
   */
  tone?: 'normal' | 'danger';
  testID?: string;
}

export function SectionRow({
  label,
  hint,
  value,
  icon,
  iconLook = 'badge',
  onPress,
  right,
  accessibilityLabel,
  accessibilityHint,
  accessibilityRole = 'button',
  disabled = false,
  tone = 'normal',
  testID,
}: SectionRowProps) {
  const { theme } = useUnistyles();
  const danger = tone === 'danger';
  // A risky row that cannot be pressed now loses its coral too.
  const iconColor = danger
    ? disabled
      ? theme.colors.textDisabled
      : theme.colors.problem
    : theme.colors.accent;
  const content = (
    <>
      {icon ? (
        iconLook === 'bare' ? (
          <View style={styles.bareIcon}>
            <Icon name={icon} size={20} color={iconColor} />
          </View>
        ) : (
          <RowIcon name={icon} color={iconColor} />
        )
      ) : null}
      <View style={styles.texts}>
        <Text style={[styles.label, danger && styles.danger, disabled && styles.disabled]}>
          {label}
        </Text>
        {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      </View>
      {right ?? (value ? <Text style={styles.value}>{value}</Text> : null)}
      {onPress ? <Icon name="chevronRight" size={18} color={theme.colors.textDim} /> : null}
    </>
  );
  if (!onPress) {
    // With a label for screen readers the row reads as one item (a locked option, say).
    const oneItem = accessibilityLabel !== undefined;
    return (
      <View
        testID={testID}
        style={styles.row}
        accessible={oneItem || undefined}
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={oneItem ? (accessibilityHint ?? hint) : undefined}
        accessibilityState={oneItem && disabled ? { disabled } : undefined}>
        {content}
      </View>
    );
  }
  return (
    <Pressable
      testID={testID}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel ?? [label, value].filter(Boolean).join(', ')}
      accessibilityHint={accessibilityHint ?? hint}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      {content}
    </Pressable>
  );
}

/** The small dark badge with a brass icon (or `color`) at the start of a row. */
export function RowIcon({ name, color }: { name: IconName; color?: string }) {
  const { theme } = useUnistyles();
  return (
    <View style={styles.badge}>
      <Icon name={name} size={20} color={color ?? theme.colors.accent} />
    </View>
  );
}

const BADGE = 36;

const styles = StyleSheet.create((theme) => ({
  section: {
    gap: theme.space.sm,
  },
  frame: surfaceStyle(theme, 'tray'),
  clip: {
    borderRadius: theme.radii.tray,
    overflow: 'hidden',
  },
  padded: {
    gap: theme.space.md,
    padding: theme.space.md,
  },
  divider: {
    height: 1,
    backgroundColor: theme.colors.separator,
  },
  row: {
    minHeight: theme.touch.row,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.md,
    paddingHorizontal: theme.space.lg,
    paddingVertical: theme.space.md,
  },
  pressed: {
    opacity: 0.7,
  },
  badge: {
    width: BADGE,
    height: BADGE,
    borderRadius: theme.radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.backgroundDeep,
  },
  bareIcon: {
    width: 24,
    alignItems: 'center',
  },
  texts: {
    flex: 1,
    gap: theme.space.xxs,
  },
  label: {
    ...theme.type.bodyStrong,
    color: theme.colors.text,
  },
  danger: {
    color: theme.colors.problem,
  },
  disabled: {
    color: theme.colors.textDisabled,
  },
  hint: {
    ...theme.type.caption,
    color: theme.colors.textDim,
  },
  value: {
    ...theme.type.caption,
    flexShrink: 1,
    textAlign: 'right',
    color: theme.colors.textDim,
  },
}));

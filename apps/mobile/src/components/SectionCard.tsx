/**
 * A titled group in one rounded card, in the Home style (#356). See "Shared
 * screen parts" in `docs/architecture/app-shell.md`.
 *
 * - `SectionTitle`: the small caps title (a screen reader header).
 * - `SectionCard`: an optional title, then one card. By default each child
 *   is a row and thin lines sit between them; `padded` holds one block
 *   instead (a picker and its hint).
 * - `SectionRow`: a row with an optional icon, a label, a hint and a value.
 *   With `onPress` it is a button with a chevron.
 *
 * `ToggleRow` and `OptionList` see when they sit in a `SectionCard` and then
 * draw as plain rows of that card.
 */
import { displayCaps } from '@tavli/ui';
import { Children, createContext, isValidElement, useContext, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { Icon } from './Icon';
import type { IconName } from './icons';

const InSectionCard = createContext(false);

/** True inside the rows of a `SectionCard`: a row then draws no frame or line of its own. */
export function useInSectionCard(): boolean {
  return useContext(InSectionCard);
}

/** The section title: caps (Greek drops the tonos), read as a header. */
export function SectionTitle({ title }: { title: string }) {
  return (
    <Text style={styles.title} accessibilityRole="header" accessibilityLabel={title}>
      {displayCaps(title)}
    </Text>
  );
}

/**
 * The card itself: surface, border, round corners and a shadow. The inner
 * view clips the rows to the corners; the outer one keeps the shadow.
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
  /** The small caps title above the card. */
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
      {title ? <SectionTitle title={title} /> : null}
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
  /** A Lucide icon in a small dark badge on the left. */
  icon?: IconName;
  /** Makes the row one button, with a chevron on the right. */
  onPress?: () => void;
  /** Other content on the right, in place of `value`. */
  right?: ReactNode;
  /** What screen readers say for a button row. Default: the label and the value. */
  accessibilityLabel?: string;
  /** Default for a button row: the hint. */
  accessibilityHint?: string;
  testID?: string;
}

export function SectionRow({
  label,
  hint,
  value,
  icon,
  onPress,
  right,
  accessibilityLabel,
  accessibilityHint,
  testID,
}: SectionRowProps) {
  const { theme } = useUnistyles();
  const content = (
    <>
      {icon ? <RowIcon name={icon} /> : null}
      <View style={styles.texts}>
        <Text style={styles.label}>{label}</Text>
        {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      </View>
      {right ?? (value ? <Text style={styles.value}>{value}</Text> : null)}
      {onPress ? <Icon name="chevronRight" size={18} color={theme.colors.textDim} /> : null}
    </>
  );
  if (!onPress) {
    return (
      <View testID={testID} style={styles.row}>
        {content}
      </View>
    );
  }
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? [label, value].filter(Boolean).join(', ')}
      accessibilityHint={accessibilityHint ?? hint}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      {content}
    </Pressable>
  );
}

/** The small dark badge with a brass icon at the start of a row. */
export function RowIcon({ name }: { name: IconName }) {
  const { theme } = useUnistyles();
  return (
    <View style={styles.badge}>
      <Icon name={name} size={20} color={theme.colors.accent} />
    </View>
  );
}

const BADGE = 36;

const styles = StyleSheet.create((theme) => ({
  section: {
    gap: theme.space.sm,
  },
  title: {
    ...theme.type.section,
    color: theme.colors.textDim,
    paddingTop: theme.space.xs,
  },
  frame: {
    borderRadius: theme.radii.xl,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    boxShadow: '0px 8px 20px rgba(0, 0, 0, 0.3)',
  },
  clip: {
    borderRadius: theme.radii.xl - 1,
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
  texts: {
    flex: 1,
    gap: theme.space.xxs,
  },
  label: {
    ...theme.type.bodyStrong,
    color: theme.colors.text,
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

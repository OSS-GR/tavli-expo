/**
 * A section header in the Figma polish pass style (#496, Patterns →
 * Section header): the title in Piazzolla, then a brass hairline across the
 * row, then an optional count or action ("See all") on the right. Screen
 * readers hear the title as a header. The title keeps its own case, so
 * Greek keeps its accents. See "Shared screen parts" in
 * `docs/architecture/app-shell.md`.
 */
import { Pressable, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

export interface SectionHeaderAction {
  label: string;
  onPress: () => void;
  testID?: string;
  /** What screen readers say. Default: the label. */
  accessibilityLabel?: string;
}

export interface SectionHeaderProps {
  title: string;
  /** A count on the right, for example the number of friends. Hidden when `action` is set. */
  count?: number;
  /** A small text button on the right, in place of the count. */
  action?: SectionHeaderAction;
  testID?: string;
}

export function SectionHeader({ title, count, action, testID }: SectionHeaderProps) {
  return (
    <View testID={testID} style={styles.row}>
      <Text style={styles.title} accessibilityRole="header">
        {title}
      </Text>
      <View style={styles.line} importantForAccessibility="no" accessibilityElementsHidden />
      {action ? (
        <Pressable
          testID={action.testID}
          accessibilityRole="button"
          accessibilityLabel={action.accessibilityLabel ?? action.label}
          onPress={action.onPress}
          hitSlop={12}
          style={({ pressed }) => pressed && styles.pressed}>
          <Text style={styles.trail}>{action.label}</Text>
        </Pressable>
      ) : count !== undefined ? (
        <Text style={styles.trail}>{count}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.md,
    paddingTop: theme.space.sm,
  },
  title: {
    ...theme.type.sectionHeader,
    flexShrink: 1,
    color: theme.colors.textDim,
  },
  line: {
    flex: 1,
    minWidth: theme.space.lg,
    height: 1,
    backgroundColor: theme.colors.accentLine,
  },
  trail: {
    ...theme.type.callout,
    fontWeight: '600',
    color: theme.colors.accentLight,
  },
  pressed: {
    opacity: 0.7,
  },
}));

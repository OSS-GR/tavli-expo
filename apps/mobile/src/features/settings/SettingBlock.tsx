/**
 * A Settings card row with more than a switch (#360): the icon badge and
 * the label on top, then a picker or a button, and its hints, under them.
 * Use it as one row of a `SectionCard`; a plain switch is a `ToggleRow`.
 */
import type { ReactNode } from 'react';
import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import type { IconName } from '@/components/icons';
import { RowIcon } from '@/components/SectionCard';

export interface SettingBlockProps {
  icon: IconName;
  label: string;
  children: ReactNode;
  testID?: string;
}

export function SettingBlock({ icon, label, children, testID }: SettingBlockProps) {
  return (
    <View testID={testID} style={styles.block}>
      <View style={styles.head}>
        <RowIcon name={icon} />
        <Text style={styles.label}>{label}</Text>
      </View>
      {children}
    </View>
  );
}

/** A short caption in a `SettingBlock`. It may wrap. */
export function BlockHint({ children, testID }: { children: string; testID?: string }) {
  return (
    <Text testID={testID} style={styles.hint}>
      {children}
    </Text>
  );
}

const styles = StyleSheet.create((theme) => ({
  block: {
    gap: theme.space.sm,
    paddingHorizontal: theme.space.lg,
    paddingVertical: theme.space.md,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.md,
  },
  label: {
    ...theme.type.bodyStrong,
    flex: 1,
    color: theme.colors.text,
  },
  hint: {
    ...theme.type.caption,
    color: theme.colors.textDim,
  },
}));

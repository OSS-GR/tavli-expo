import type { ReactNode } from 'react';
import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { SectionHeader } from '../SectionHeader';

interface SettingsSectionProps {
  title: string;
  children: ReactNode;
}

/** A titled group of settings rows, under a `SectionHeader` (#496). */
export function SettingsSection({ title, children }: SettingsSectionProps) {
  return (
    <View style={styles.section}>
      <SectionHeader title={title} />
      {children}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  section: {
    gap: theme.space.xs,
    paddingTop: theme.space.xl,
  },
}));

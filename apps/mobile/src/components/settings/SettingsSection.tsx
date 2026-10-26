import { displayCaps } from '@tavli/ui';
import type { ReactNode } from 'react';
import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

interface SettingsSectionProps {
  title: string;
  children: ReactNode;
}

/** A titled group of settings rows. The title shows in caps (Greek drops the tonos). */
export function SettingsSection({ title, children }: SettingsSectionProps) {
  return (
    <View style={styles.section}>
      <Text style={styles.title} accessibilityRole="header" accessibilityLabel={title}>
        {displayCaps(title)}
      </Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  section: {
    gap: theme.space.xs,
    paddingTop: theme.space.xl,
  },
  title: {
    ...theme.type.section,
    color: theme.colors.textDim,
    paddingBottom: theme.space.xs,
  },
}));

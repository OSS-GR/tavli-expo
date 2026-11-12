/**
 * A small pill of Settings (#501): "On this phone only" on the account
 * card, "Soon" on a locked option. Text only repeats what the row says,
 * so the row's label carries it for screen readers.
 */
import { Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { Icon } from '@/components/Icon';
import type { IconName } from '@/components/icons';

export interface SettingsChipProps {
  label: string;
  icon?: IconName;
  testID?: string;
}

export function SettingsChip({ label, icon, testID }: SettingsChipProps) {
  const { theme } = useUnistyles();
  return (
    <View testID={testID} style={styles.chip}>
      {icon ? <Icon name={icon} size={12} color={theme.colors.textDim} /> : null}
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.xxs,
    paddingHorizontal: theme.space.sm,
    paddingVertical: theme.space.xxs,
    borderRadius: theme.radii.pill,
    borderWidth: 1,
    borderColor: theme.colors.separator,
    backgroundColor: theme.colors.backgroundDeep,
  },
  label: {
    ...theme.type.caption,
    color: theme.colors.textDim,
  },
}));

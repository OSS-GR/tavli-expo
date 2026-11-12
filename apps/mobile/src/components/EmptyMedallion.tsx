/**
 * The empty-state medallion of the Figma polish pass (#503, Patterns →
 * Empty-state medallion): a checker seen from above, with a dashed inner
 * ring and a Lucide icon at 1.6 stroke. An empty state shows one
 * medallion, one sentence and one action. It only decorates: screen
 * readers skip it.
 */
import { View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { Icon } from './Icon';
import type { IconName } from './icons';

const SIZE = 110;
const RING = 72;
const ICON = 36;

export function EmptyMedallion({ icon, testID }: { icon: IconName; testID?: string }) {
  const { theme } = useUnistyles();
  return (
    <View
      testID={testID}
      style={styles.face}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants">
      <View style={styles.ring}>
        <Icon name={icon} size={ICON} strokeWidth={1.6} color={theme.colors.accent} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  face: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.colors.accentLine,
    backgroundImage: `radial-gradient(circle closest-side, ${theme.colors.surfaceRaised} 0%, ${theme.colors.surface} 70%, ${theme.colors.backgroundFloor} 100%)`,
    backgroundColor: theme.colors.surface,
    boxShadow: `inset 0px 1px 0px ${theme.colors.edgeLight}, 0px 12px 28px rgba(0, 0, 0, 0.45)`,
  },
  ring: {
    width: RING,
    height: RING,
    borderRadius: RING / 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: theme.colors.accentLine,
  },
}));

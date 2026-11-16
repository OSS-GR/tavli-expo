/**
 * The empty-state medallion of the Figma polish pass (#503, Patterns →
 * Empty-state medallion): a checker seen from above, with a dashed inner
 * ring and a Lucide icon at 1.6 stroke. An empty state shows one
 * medallion, one sentence and one action. It only decorates: screen
 * readers skip it.
 *
 * `small` is the trophy medallion of match end (#515): 96 pt, a 62 pt
 * ring and a 32 pt icon.
 */
import { View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { Icon } from './Icon';
import type { IconName } from './icons';

export type MedallionSize = 'regular' | 'small';

/** Face, ring and icon sizes in points. */
const SIZES = {
  regular: { face: 110, ring: 72, icon: 36 },
  small: { face: 96, ring: 62, icon: 32 },
} as const;

export interface EmptyMedallionProps {
  icon: IconName;
  size?: MedallionSize;
  testID?: string;
}

export function EmptyMedallion({ icon, size = 'regular', testID }: EmptyMedallionProps) {
  const { theme } = useUnistyles();
  return (
    <View
      testID={testID}
      style={styles.face(size)}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants">
      <View style={styles.ring(size)}>
        <Icon name={icon} size={SIZES[size].icon} strokeWidth={1.6} color={theme.colors.accent} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  face: (size: MedallionSize) => ({
    width: SIZES[size].face,
    height: SIZES[size].face,
    borderRadius: SIZES[size].face / 2,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.colors.accentLine,
    backgroundImage: `radial-gradient(circle closest-side, ${theme.colors.surfaceRaised} 0%, ${theme.colors.surface} 70%, ${theme.colors.backgroundFloor} 100%)`,
    backgroundColor: theme.colors.surface,
    boxShadow: `inset 0px 1px 0px ${theme.colors.edgeLight}, 0px 12px 28px rgba(0, 0, 0, 0.45)`,
  }),
  ring: (size: MedallionSize) => ({
    width: SIZES[size].ring,
    height: SIZES[size].ring,
    borderRadius: SIZES[size].ring / 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: theme.colors.accentLine,
  }),
}));

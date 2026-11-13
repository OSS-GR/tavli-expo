/**
 * The empty-state medallion of the Figma polish pass (#503, Patterns →
 * Empty-state medallion): a checker seen from above, with a dashed inner
 * ring and a Lucide icon at 1.6 stroke. An empty state shows one
 * medallion, one sentence and one action. The `large` size leads the
 * consent step (Figma frame 12). It only decorates: screen readers skip it.
 */
import { View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { Icon } from './Icon';
import type { IconName } from './icons';

/** Face, dashed ring and icon sizes in points. */
const SIZES = {
  regular: { face: 110, ring: 72, icon: 36 },
  large: { face: 132, ring: 84, icon: 40 },
} as const;

export interface EmptyMedallionProps {
  icon: IconName;
  size?: keyof typeof SIZES;
  testID?: string;
}

export function EmptyMedallion({ icon, size = 'regular', testID }: EmptyMedallionProps) {
  const { theme } = useUnistyles();
  const sizes = SIZES[size];
  return (
    <View
      testID={testID}
      style={styles.face(sizes.face)}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants">
      <View style={styles.ring(sizes.ring)}>
        <Icon name={icon} size={sizes.icon} strokeWidth={1.6} color={theme.colors.accent} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  face: (size: number) => ({
    width: size,
    height: size,
    borderRadius: size / 2,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.colors.accentLine,
    backgroundImage: `radial-gradient(circle closest-side, ${theme.colors.surfaceRaised} 0%, ${theme.colors.surface} 70%, ${theme.colors.backgroundFloor} 100%)`,
    backgroundColor: theme.colors.surface,
    boxShadow: `inset 0px 1px 0px ${theme.colors.edgeLight}, 0px 12px 28px rgba(0, 0, 0, 0.45)`,
  }),
  ring: (size: number) => ({
    width: size,
    height: size,
    borderRadius: size / 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: theme.colors.accentLine,
  }),
}));

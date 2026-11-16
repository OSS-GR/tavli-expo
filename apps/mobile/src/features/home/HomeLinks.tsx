/**
 * Home's links under the play modes (#517): Join with a code, How to play
 * and History as rows of one card. The card and the icon badges have the
 * tiles' look (`tileSurface`, `BADGE`), so the lower half of Home is one
 * family; thin lines sit between the rows. No text has a line limit.
 */
import { Fragment } from 'react';
import { Pressable, Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { Icon } from '@/components/Icon';
import type { IconName } from '@/components/icons';

import { BADGE, BADGE_ICON, tileSurface } from './ModeTile';

export interface HomeLink {
  readonly testID: string;
  readonly icon: IconName;
  readonly label: string;
  /** `link` for a page to read (How to play, History). Default: `button`. */
  readonly accessibilityRole?: 'button' | 'link';
  readonly accessibilityHint?: string;
  readonly onPress: () => void;
}

export function HomeLinks({ links, testID }: { links: readonly HomeLink[]; testID?: string }) {
  const { theme } = useUnistyles();
  return (
    <View testID={testID} style={styles.card}>
      <View style={styles.clip}>
        {links.map((link, index) => (
          <Fragment key={link.testID}>
            {index > 0 ? <View style={styles.divider} /> : null}
            <Pressable
              testID={link.testID}
              accessibilityRole={link.accessibilityRole ?? 'button'}
              accessibilityLabel={link.label}
              {...(link.accessibilityHint ? { accessibilityHint: link.accessibilityHint } : {})}
              onPress={link.onPress}
              style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
              <View style={styles.badge}>
                <Icon name={link.icon} size={BADGE_ICON} color={theme.colors.turnText} />
              </View>
              <Text style={styles.label}>{link.label}</Text>
              <Icon name="chevronRight" size={20} color={theme.colors.textDim} />
            </Pressable>
          </Fragment>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  card: {
    ...tileSurface(theme),
  },
  // Clips the pressed rows to the corners; the outer view keeps the shadow.
  clip: {
    borderRadius: theme.radii.xl,
    overflow: 'hidden',
  },
  divider: {
    height: 1,
    marginLeft: theme.space.md + BADGE + theme.space.md,
    backgroundColor: theme.colors.border,
  },
  row: {
    minHeight: theme.touch.row,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.md,
    paddingVertical: theme.space.sm,
    paddingHorizontal: theme.space.md,
  },
  badge: {
    width: BADGE,
    height: BADGE,
    borderRadius: theme.radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.backgroundDeep,
  },
  label: {
    ...theme.type.bodyStrong,
    flex: 1,
    color: theme.colors.text,
  },
  pressed: {
    backgroundColor: theme.colors.surfaceSelected,
  },
}));

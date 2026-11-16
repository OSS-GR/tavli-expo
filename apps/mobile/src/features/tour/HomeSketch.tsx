/**
 * A small sketch of Home for the tour (#573, Figma frame 22): the top
 * buttons, the hero card, Your games and the mode tiles, each with a
 * numbered brass badge. The page lists what each number is, so screen
 * readers hear the sketch as one picture and read the list.
 */
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

function Badge({ n }: { n: number }) {
  return (
    <View style={styles.badge}>
      <Text style={styles.badgeText}>{n}</Text>
    </View>
  );
}

export function HomeSketch() {
  const { t } = useTranslation();
  return (
    <View
      testID="tour-home-sketch"
      style={styles.phone}
      accessible
      accessibilityRole="image"
      accessibilityLabel={t('tour.mock.label')}>
      <View style={styles.top}>
        <View style={styles.titleBar} />
        <View style={styles.round} />
        <View style={styles.round} />
        <Badge n={4} />
      </View>
      <View style={styles.hero}>
        <View style={styles.heroBoard} />
        <View style={styles.heroLines}>
          <View style={styles.line(0.8)} />
          <View style={styles.line(0.5)} />
        </View>
        <Badge n={1} />
      </View>
      <View style={styles.games}>
        <View style={styles.line(0.6)} />
        <Badge n={2} />
      </View>
      <View style={styles.tiles}>
        <View style={styles.wideTile} />
        <View style={styles.tileRow}>
          <View style={styles.tile} />
          <View style={styles.tile} />
        </View>
        <View style={styles.tileRow}>
          <View style={styles.tile} />
          <View style={styles.tile} />
        </View>
        <View style={styles.tilesBadge}>
          <Badge n={3} />
        </View>
      </View>
    </View>
  );
}

const BADGE = 24;

const styles = StyleSheet.create((theme) => ({
  phone: {
    alignSelf: 'center',
    width: 200,
    gap: theme.space.sm,
    padding: theme.space.md,
    borderRadius: theme.radii.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.xs,
  },
  titleBar: {
    flex: 1,
    height: 10,
    borderRadius: 5,
    backgroundColor: theme.colors.border,
  },
  round: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.sm,
    padding: theme.space.sm,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: theme.colors.accent,
    backgroundColor: theme.colors.accentWash,
  },
  heroBoard: {
    width: 44,
    height: 34,
    borderRadius: 4,
    backgroundColor: theme.colors.accentMuted,
  },
  heroLines: {
    flex: 1,
    gap: 6,
  },
  line: (width: number) => ({
    width: `${width * 100}%`,
    height: 6,
    borderRadius: 3,
    backgroundColor: theme.colors.border,
  }),
  games: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.sm,
    padding: theme.space.sm,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  tiles: {
    gap: 6,
  },
  wideTile: {
    height: 22,
    borderRadius: theme.radii.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  tileRow: {
    flexDirection: 'row',
    gap: 6,
  },
  tile: {
    flex: 1,
    height: 26,
    borderRadius: theme.radii.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  tilesBadge: {
    position: 'absolute',
    right: -BADGE / 3,
    top: -BADGE / 3,
  },
  badge: {
    width: BADGE,
    height: BADGE,
    borderRadius: BADGE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.accent,
  },
  badgeText: {
    ...theme.type.caption,
    fontWeight: '700',
    color: theme.colors.onAccent,
  },
}));

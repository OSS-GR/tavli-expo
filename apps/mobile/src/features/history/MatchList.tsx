/**
 * The rows of History (#142): one card, one row per match, each read as
 * one item. The local matches and the online ones (#313) share it.
 */
import { displayCaps } from '@tavli/ui';
import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import type { ResultBadge } from './format';

export interface MatchListRow {
  readonly key: string;
  readonly testID: string;
  readonly title: string;
  readonly score: string;
  /** No badge when `null`. */
  readonly badge: ResultBadge | null;
  readonly result: string | null;
  /** No date line when empty. */
  readonly date: string;
  /** What a screen reader reads for the whole row. */
  readonly label: string;
}

export function MatchList({ rows }: { rows: readonly MatchListRow[] }) {
  return (
    <View style={styles.list}>
      {rows.map((row, i) => (
        <View
          key={row.key}
          testID={row.testID}
          style={[styles.row, i > 0 && styles.rowLine]}
          accessible
          accessibilityLabel={row.label}>
          <View style={styles.rowTop}>
            <Text style={styles.rowTitle}>{row.title}</Text>
            {row.badge !== null && row.result !== null ? (
              <View style={styles.badge(row.badge)}>
                <Text style={styles.badgeText(row.badge)}>{row.result}</Text>
              </View>
            ) : null}
          </View>
          <Text style={styles.rowScore}>{row.score}</Text>
          {row.date ? <Text style={styles.rowDate}>{row.date}</Text> : null}
        </View>
      ))}
    </View>
  );
}

/** A section title in caps, read as a header in normal case. */
export function SectionTitle({ title }: { title: string }) {
  return (
    <Text style={styles.section} accessibilityRole="header" accessibilityLabel={title}>
      {displayCaps(title)}
    </Text>
  );
}

const styles = StyleSheet.create((theme) => ({
  section: {
    ...theme.type.section,
    color: theme.colors.textDim,
    paddingTop: theme.space.lg,
  },
  list: {
    paddingHorizontal: theme.space.lg,
    borderRadius: theme.radii.lg,
    backgroundColor: theme.colors.surface,
  },
  row: {
    gap: theme.space.xxs,
    minHeight: theme.touch.row,
    paddingVertical: theme.space.md,
  },
  rowLine: {
    borderTopWidth: 1,
    borderTopColor: theme.colors.separator,
  },
  rowTop: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: theme.space.sm,
  },
  rowTitle: {
    ...theme.type.bodyStrong,
    flexShrink: 1,
    flexGrow: 1,
    color: theme.colors.text,
  },
  badge: (badge: ResultBadge) => ({
    paddingHorizontal: theme.space.md,
    paddingVertical: theme.space.xxs,
    borderRadius: theme.radii.pill,
    borderWidth: 2,
    borderStyle: badge === 'unfinished' ? ('dashed' as const) : ('solid' as const),
    borderColor: badge === 'unfinished' ? theme.colors.border : theme.colors.accent,
    backgroundColor: badge === 'won' ? theme.colors.accent : 'transparent',
  }),
  badgeText: (badge: ResultBadge) => ({
    ...theme.type.caption,
    fontWeight: '600' as const,
    color:
      badge === 'won'
        ? theme.colors.onAccent
        : badge === 'unfinished'
          ? theme.colors.textDim
          : theme.colors.text,
  }),
  rowScore: {
    ...theme.type.body,
    color: theme.colors.text,
  },
  rowDate: {
    ...theme.type.caption,
    color: theme.colors.textDim,
  },
}));

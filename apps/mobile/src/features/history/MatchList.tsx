/**
 * The rows of History (#142): one `SectionCard`, one row per match, each
 * read as one item. The local matches and the online ones (#313) share it.
 * In the Home style (#359): the result chip first (Won brass, Lost dark,
 * Not finished outlined), then the match line, the score and the date.
 * An online row may end with a small icon button (Report or block, #435):
 * it sits outside the row's one screen reader item, so it is its own.
 */
import { Pressable, Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { Icon } from '@/components/Icon';
import type { IconName } from '@/components/icons';
import { SectionCard } from '@/components/SectionCard';

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
  /** An icon button at the end of the row. */
  readonly action?: MatchListAction;
}

export interface MatchListAction {
  readonly icon: IconName;
  /** What screen readers say: a whole phrase, for example "Report or block Guest 4821". */
  readonly label: string;
  readonly onPress: () => void;
  readonly testID: string;
}

export interface MatchListProps {
  rows: readonly MatchListRow[];
  /** The small caps title above the card. */
  title?: string;
}

export function MatchList({ rows, title }: MatchListProps) {
  return (
    <SectionCard title={title}>
      {rows.map((row) =>
        row.action === undefined ? (
          <MatchRow key={row.key} row={row} />
        ) : (
          <View key={row.key} style={styles.withAction}>
            <MatchRow row={row} grow />
            <RowAction action={row.action} />
          </View>
        ),
      )}
    </SectionCard>
  );
}

function RowAction({ action }: { action: MatchListAction }) {
  const { theme } = useUnistyles();
  return (
    <Pressable
      testID={action.testID}
      accessibilityRole="button"
      accessibilityLabel={action.label}
      hitSlop={4}
      onPress={action.onPress}
      style={({ pressed }) => [styles.action, pressed && styles.pressed]}>
      <Icon name={action.icon} size={20} color={theme.colors.textDim} />
    </Pressable>
  );
}

function MatchRow({ row, grow = false }: { row: MatchListRow; grow?: boolean }) {
  return (
    <View
      testID={row.testID}
      style={[styles.row, grow && styles.grow]}
      accessible
      accessibilityLabel={row.label}>
      {row.badge !== null && row.result !== null ? (
        <View style={styles.chip(row.badge)}>
          <Text style={styles.chipText(row.badge)}>{row.result}</Text>
        </View>
      ) : null}
      <View style={styles.texts}>
        <Text style={styles.title}>{row.title}</Text>
        <Text style={styles.score(row.badge)}>{row.score}</Text>
        {row.date ? <Text style={styles.date}>{row.date}</Text> : null}
      </View>
    </View>
  );
}

/** A pass-and-play winner shows as a win: someone won the match. */
function chipLook(badge: ResultBadge): 'won' | 'lost' | 'unfinished' {
  return badge === 'winner' ? 'won' : badge;
}

const styles = StyleSheet.create((theme) => ({
  withAction: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: theme.space.sm,
  },
  grow: {
    flex: 1,
  },
  action: {
    width: theme.touch.minTarget,
    height: theme.touch.minTarget,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radii.pill,
  },
  pressed: {
    opacity: 0.7,
  },
  // The chip and the texts share a line; with a large font or a long
  // result the texts wrap under the chip.
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: theme.space.md,
    minHeight: theme.touch.row,
    paddingHorizontal: theme.space.lg,
    paddingVertical: theme.space.md,
  },
  chip: (badge: ResultBadge) => {
    const look = chipLook(badge);
    return {
      flexShrink: 1,
      minWidth: 52,
      paddingHorizontal: theme.space.sm,
      paddingVertical: theme.space.xxs,
      borderRadius: theme.radii.pill,
      borderWidth: 1,
      alignItems: 'center' as const,
      borderColor:
        look === 'won'
          ? theme.colors.accent
          : look === 'lost'
            ? theme.colors.separator
            : theme.colors.border,
      backgroundColor:
        look === 'won'
          ? theme.colors.accent
          : look === 'lost'
            ? theme.colors.separator
            : theme.colors.backgroundDeep,
    };
  },
  chipText: (badge: ResultBadge) => {
    const look = chipLook(badge);
    return {
      ...theme.type.caption,
      fontWeight: '700' as const,
      textAlign: 'center' as const,
      color:
        look === 'won'
          ? theme.colors.onAccent
          : look === 'lost'
            ? theme.colors.text
            : theme.colors.textDim,
    };
  },
  texts: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 180,
    gap: theme.space.xxs,
  },
  title: {
    ...theme.type.bodyStrong,
    color: theme.colors.text,
  },
  score: (badge: ResultBadge | null) => ({
    ...theme.type.body,
    fontVariant: ['tabular-nums' as const],
    color: badge === 'unfinished' ? theme.colors.textDim : theme.colors.text,
  }),
  date: {
    ...theme.type.caption,
    color: theme.colors.textDim,
  },
}));

/**
 * History (#142): stats per game and bot level, then the past matches,
 * newest first. Offline: the records live on the phone (`records.ts`).
 *
 * It only shows what it is given. The route (`app/history.tsx`) reads the
 * store and navigates.
 */
import { displayCaps } from '@tavli/ui';
import { useLocales } from 'expo-localization';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { ActionButton } from '@/components/ActionButton';

import { dateLocale, historyRow, statParts, type ResultBadge } from './format';
import { MAX_HISTORY_RECORDS, type HistoryRecord } from './records';
import { historyStats, type StatLine } from './stats';

export interface HistoryScreenProps {
  /** Newest first. */
  records: readonly HistoryRecord[];
  /** The empty state's Play button. */
  onPlay: () => void;
}

export function HistoryScreen({ records, onPlay }: HistoryScreenProps) {
  const { t, i18n } = useTranslation();
  const locale = dateLocale(i18n.resolvedLanguage ?? i18n.language, useLocales());

  if (records.length === 0) {
    return (
      <View testID="history-screen" style={styles.screen}>
        <ScrollView contentContainerStyle={[styles.content, styles.emptyContent]}>
          <Text style={styles.emptyTitle} accessibilityRole="header">
            {t('history.emptyTitle')}
          </Text>
          <Text style={styles.emptyText}>{t('history.empty')}</Text>
          <ActionButton testID="history-play" label={t('history.play')} onPress={onPlay} />
        </ScrollView>
      </View>
    );
  }

  const stats = historyStats(records);

  return (
    <View testID="history-screen" style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <Section title={t('history.stats')} />
        {stats.map(({ game, byLevel, local }) => (
          <View key={game} testID={`history-stats-${game}`} style={styles.card}>
            <Text style={styles.cardTitle} accessibilityRole="header">
              {t(`games.${game}`)}
            </Text>
            {byLevel.map(({ level, line }) => (
              <StatRow
                key={level}
                testID={`history-stats-${game}-${level}`}
                title={t('history.vsBot', { level: t(`bot.levels.${level}`) })}
                line={line}
                mode="bot"
              />
            ))}
            {local ? (
              <StatRow
                testID={`history-stats-${game}-local`}
                title={t('history.local')}
                line={local}
                mode="local"
              />
            ) : null}
          </View>
        ))}

        <Section title={t('history.matches')} />
        <View style={styles.list}>
          {records.map((record, i) => {
            const row = historyRow(record, t, locale);
            return (
              <View
                key={record.id}
                testID={`history-row-${i}`}
                style={[styles.row, i > 0 && styles.rowLine]}
                accessible
                accessibilityLabel={row.label}>
                <View style={styles.rowTop}>
                  <Text style={styles.rowTitle}>{row.title}</Text>
                  <View style={styles.badge(row.badge)}>
                    <Text style={styles.badgeText(row.badge)}>{row.result}</Text>
                  </View>
                </View>
                <Text style={styles.rowScore}>{row.score}</Text>
                {row.date ? <Text style={styles.rowDate}>{row.date}</Text> : null}
              </View>
            );
          })}
        </View>
        <Text style={styles.note}>{t('history.onPhone', { max: MAX_HISTORY_RECORDS })}</Text>
      </ScrollView>
    </View>
  );
}

function Section({ title }: { title: string }) {
  return (
    <Text style={styles.section} accessibilityRole="header" accessibilityLabel={title}>
      {displayCaps(title)}
    </Text>
  );
}

interface StatRowProps {
  title: string;
  line: StatLine;
  mode: 'bot' | 'local';
  testID: string;
}

/** One line of stats, read as one element: "Bot · Easy, Played 5, Won 3, …". */
function StatRow({ title, line, mode, testID }: StatRowProps) {
  const { t } = useTranslation();
  const parts = statParts(line, mode, t);
  return (
    <View
      testID={testID}
      style={styles.statRow}
      accessible
      accessibilityLabel={[title, ...parts].join(', ')}>
      <Text style={styles.statTitle}>{title}</Text>
      <Text style={styles.statText}>{parts.join(' · ')}</Text>
    </View>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  screen: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    gap: theme.space.sm,
    paddingHorizontal: theme.space.xl,
    paddingTop: theme.space.md,
    paddingBottom: rt.insets.bottom + theme.space.xxl,
  },
  emptyContent: {
    flexGrow: 1,
    justifyContent: 'center',
    gap: theme.space.md,
  },
  emptyTitle: {
    ...theme.type.title,
    color: theme.colors.text,
    textAlign: 'center',
  },
  emptyText: {
    ...theme.type.body,
    color: theme.colors.textDim,
    textAlign: 'center',
    paddingBottom: theme.space.md,
  },
  section: {
    ...theme.type.section,
    color: theme.colors.textDim,
    paddingTop: theme.space.lg,
  },
  card: {
    gap: theme.space.xs,
    padding: theme.space.lg,
    borderRadius: theme.radii.lg,
    backgroundColor: theme.colors.surface,
  },
  cardTitle: {
    ...theme.type.bodyStrong,
    color: theme.colors.text,
  },
  statRow: {
    paddingTop: theme.space.xs,
  },
  statTitle: {
    ...theme.type.caption,
    fontWeight: '600',
    color: theme.colors.text,
  },
  statText: {
    ...theme.type.caption,
    color: theme.colors.textDim,
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
  note: {
    ...theme.type.caption,
    color: theme.colors.textDim,
    textAlign: 'center',
    paddingTop: theme.space.md,
  },
}));

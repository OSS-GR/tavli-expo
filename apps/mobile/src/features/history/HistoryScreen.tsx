/**
 * History (#142): stats per game and bot level, then the past matches,
 * newest first. Offline: the records live on the phone (`records.ts`).
 * Finished online matches (#313) come last, in their own section
 * (`online`); they never count in the stats. "No matches yet" shows only
 * when the phone has no record and the online section has no match.
 *
 * It only shows what it is given. The route (`app/history.tsx`) reads the
 * store and navigates.
 */
import { useLocales } from 'expo-localization';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { ActionButton } from '@/components/ActionButton';

import { dateLocale, historyRow, statParts } from './format';
import { MatchList, SectionTitle } from './MatchList';
import { MAX_HISTORY_RECORDS, type HistoryRecord } from './records';
import { historyStats, type StatLine } from './stats';

export interface HistoryScreenProps {
  /** Newest first. */
  records: readonly HistoryRecord[];
  /** The empty state's Play button. */
  onPlay: () => void;
  /**
   * The finished online matches (#313), under the local ones. It calls
   * `onMatches(true)` while it loads or lists a match, so the screen hides
   * its empty state.
   */
  online?: (onMatches: (has: boolean) => void) => ReactNode;
}

export function HistoryScreen({ records, onPlay, online }: HistoryScreenProps) {
  const { t, i18n } = useTranslation();
  const locale = dateLocale(i18n.resolvedLanguage ?? i18n.language, useLocales());
  const [onlineMatches, setOnlineMatches] = useState(false);
  const empty = records.length === 0 && !onlineMatches;

  // One tree for every state: the online section keeps its place, so it
  // never mounts again (and never watches again) when the empty state goes.
  return (
    <View testID="history-screen" style={styles.screen}>
      <ScrollView contentContainerStyle={[styles.content, empty && styles.emptyContent]}>
        {empty ? (
          <>
            <Text style={styles.emptyTitle} accessibilityRole="header">
              {t('history.emptyTitle')}
            </Text>
            <Text style={styles.emptyText}>{t('history.empty')}</Text>
            <ActionButton testID="history-play" label={t('history.play')} onPress={onPlay} />
          </>
        ) : null}
        {records.length > 0 ? <LocalHistory records={records} locale={locale} /> : null}
        {online?.(setOnlineMatches)}
      </ScrollView>
    </View>
  );
}

/** Stats, then the local matches, newest first. */
function LocalHistory({ records, locale }: { records: readonly HistoryRecord[]; locale: string }) {
  const { t } = useTranslation();
  const stats = historyStats(records);
  return (
    <>
      <SectionTitle title={t('history.stats')} />
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

      <SectionTitle title={t('history.matches')} />
      <MatchList
        rows={records.map((record, i) => ({
          ...historyRow(record, t, locale),
          key: record.id,
          testID: `history-row-${i}`,
        }))}
      />
      <Text style={styles.note}>{t('history.onPhone', { max: MAX_HISTORY_RECORDS })}</Text>
    </>
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
  note: {
    ...theme.type.caption,
    color: theme.colors.textDim,
    textAlign: 'center',
    paddingTop: theme.space.md,
  },
}));

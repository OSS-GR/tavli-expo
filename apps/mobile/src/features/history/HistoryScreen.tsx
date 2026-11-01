/**
 * History (#142): stats per game and bot level, then the past matches,
 * newest first. Offline: the records live on the phone (`records.ts`).
 * Finished online matches (#313) come last, in their own section
 * (`online`); they never count in the stats. "No matches yet" shows only
 * when the phone has no record and the online section has no match.
 *
 * In the Home style (#359): the shared `Screen` and `ScreenHeader`, each
 * stat line as tiles (Played, Won, Win rate) with the other numbers in one
 * line under them, and the matches in a `SectionCard`.
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
import { Screen } from '@/components/Screen';
import { ScreenHeader } from '@/components/ScreenHeader';
import { SectionTitle } from '@/components/SectionCard';

import { dateLocale, historyRow, statParts, statTiles, type StatTile } from './format';
import { MatchList } from './MatchList';
import { MAX_HISTORY_RECORDS, type HistoryRecord } from './records';
import { historyStats, type StatLine } from './stats';

/** Above this font scale the stat tiles stand one a row. */
const ONE_TILE_FONT_SCALE = 1.3;

export interface HistoryScreenProps {
  /** Newest first. */
  records: readonly HistoryRecord[];
  /** The empty state's Play button. */
  onPlay: () => void;
  /** The header's back button. No back button without it. */
  onBack?: () => void;
  /**
   * The finished online matches (#313), under the local ones. It calls
   * `onMatches(true)` while it loads or lists a match, so the screen hides
   * its empty state.
   */
  online?: (onMatches: (has: boolean) => void) => ReactNode;
}

export function HistoryScreen({ records, onPlay, onBack, online }: HistoryScreenProps) {
  const { t, i18n } = useTranslation();
  const locale = dateLocale(i18n.resolvedLanguage ?? i18n.language, useLocales());
  const [onlineMatches, setOnlineMatches] = useState(false);
  const empty = records.length === 0 && !onlineMatches;

  // One tree for every state: the online section keeps its place, so it
  // never mounts again (and never watches again) when the empty state goes.
  return (
    <Screen testID="history-screen">
      <ScreenHeader
        title={t('history.title')}
        onBack={onBack}
        backLabel={t('history.back')}
        testID="history-back"
      />
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
    </Screen>
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
        <View key={game} testID={`history-stats-${game}`} style={styles.game}>
          <Text style={styles.gameTitle} accessibilityRole="header">
            {t(`games.${game}`)}
          </Text>
          {byLevel.map(({ level, line }) => (
            <StatBlock
              key={level}
              testID={`history-stats-${game}-${level}`}
              title={t('history.vsBot', { level: t(`bot.levels.${level}`) })}
              line={line}
              mode="bot"
            />
          ))}
          {local ? (
            <StatBlock
              testID={`history-stats-${game}-local`}
              title={t('history.local')}
              line={local}
              mode="local"
            />
          ) : null}
        </View>
      ))}

      <MatchList
        title={t('history.matches')}
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

interface StatBlockProps {
  title: string;
  line: StatLine;
  mode: 'bot' | 'local';
  testID: string;
}

/**
 * One line of stats: its title, the tiles, then the other numbers. Read as
 * one element: "Bot · Easy, Played 5, Won 3, …".
 */
function StatBlock({ title, line, mode, testID }: StatBlockProps) {
  const { t } = useTranslation();
  const { tiles, rest } = statTiles(line, mode, t);
  return (
    <View
      testID={testID}
      style={styles.block}
      accessible
      accessibilityLabel={[title, ...statParts(line, mode, t)].join(', ')}>
      <Text style={styles.blockTitle}>{title}</Text>
      <View style={styles.tiles}>
        {tiles.map((tile) => (
          <Tile key={tile.key} tile={tile} />
        ))}
      </View>
      {rest.length > 0 ? <Text style={styles.rest}>{rest.join(' · ')}</Text> : null}
    </View>
  );
}

/** A big number over its label. The win rate has a brass edge. */
function Tile({ tile }: { tile: StatTile }) {
  const strong = tile.key === 'winRate';
  return (
    <View style={styles.tile(strong)}>
      <Text style={styles.tileValue(strong)}>{tile.value}</Text>
      <Text style={styles.tileLabel}>{tile.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  content: {
    gap: theme.space.md,
    paddingHorizontal: theme.space.lg,
    paddingTop: theme.space.sm,
    paddingBottom: rt.insets.bottom + theme.space.xxl,
  },
  emptyContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: theme.space.xl,
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
  game: {
    gap: theme.space.md,
  },
  gameTitle: {
    ...theme.type.bodyStrong,
    color: theme.colors.text,
  },
  block: {
    gap: theme.space.sm,
  },
  blockTitle: {
    ...theme.type.caption,
    fontWeight: '600',
    color: theme.colors.textDim,
  },
  // Three tiles a row; one a row with a large font.
  tiles: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.space.sm,
  },
  tile: (strong: boolean) => ({
    flexGrow: 1,
    flexBasis: rt.fontScale > ONE_TILE_FONT_SCALE ? ('100%' as const) : 0,
    gap: theme.space.xxs,
    padding: theme.space.md,
    borderRadius: theme.radii.xl,
    borderWidth: 1,
    borderColor: strong ? theme.colors.accent : theme.colors.border,
    backgroundColor: theme.colors.surface,
    backgroundImage: `linear-gradient(160deg, ${theme.colors.surfaceSelected} 0%, ${theme.colors.surface} 70%)`,
    boxShadow: '0px 8px 20px rgba(0, 0, 0, 0.3)',
  }),
  tileValue: (strong: boolean) => ({
    fontSize: 26,
    lineHeight: 32,
    fontWeight: '800' as const,
    fontVariant: ['tabular-nums' as const],
    color: strong ? theme.colors.accentLight : theme.colors.text,
  }),
  tileLabel: {
    ...theme.type.caption,
    fontWeight: '600',
    color: theme.colors.textDim,
  },
  rest: {
    ...theme.type.caption,
    color: theme.colors.textDim,
  },
  note: {
    ...theme.type.caption,
    color: theme.colors.textDim,
    textAlign: 'center',
    paddingTop: theme.space.sm,
  },
}));

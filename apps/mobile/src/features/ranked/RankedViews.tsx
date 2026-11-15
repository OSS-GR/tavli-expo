/**
 * The parts of Play ranked (#532, Figma 81:2) a saved account sees:
 * the setup, the search, "Nobody yet" and the match found. They only show
 * what they get and call back: the state and the calls are in
 * `RankedScreen.tsx` and `useRankedSearch.ts`.
 *
 * No text has a line limit, so a large font wraps and the screen scrolls.
 */
import {
  RANKED_GAMES,
  RANKED_TARGET_POINTS,
  RANKED_TURN_TIME_MINUTES,
  type RankedGame,
  type SeekPlayer,
} from '@tavli/contracts';
import type { MatchStakes } from '@tavli/online';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { CheckerAvatar } from '@/components/CheckerAvatar';
import { SectionCard, SectionRow } from '@/components/SectionCard';
import { SectionHeader } from '@/components/SectionHeader';
import { SegmentedControl, type SegmentOption } from '@/components/settings/SegmentedControl';
import { playerNameText } from '@/features/online/playerName';

import { RankedTable, type TablePlayer } from './RankedTable';

/** "2:00": the turn time as the clock shows it. */
export const TURN_CLOCK = `${RANKED_TURN_TIME_MINUTES}:00`;

/** "0:18": a wait in whole seconds. */
export function waitText(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

/** The table, its width taken from the screen. */
function Table({ width, opponent }: { width: number; opponent: TablePlayer | null }) {
  return (
    <View style={styles.table}>
      <RankedTable testID="ranked-table" width={width} opponent={opponent} />
    </View>
  );
}

export interface RankedSetupProps {
  game: RankedGame;
  onGame: (game: RankedGame) => void;
  /** Your rating, or `null` while it loads. */
  rating: number | null;
  tableWidth: number;
}

export function RankedSetup({ game, onGame, rating, tableWidth }: RankedSetupProps) {
  const { t } = useTranslation();
  const options: readonly SegmentOption<RankedGame>[] = RANKED_GAMES.map((value) => ({
    value,
    label: t(`games.${value}`),
  }));
  return (
    <>
      <View testID="ranked-setup" style={styles.hero}>
        <Table width={tableWidth} opponent={null} />
        <Text style={styles.heroTitle} accessibilityRole="header">
          {t('ranked.setup.title')}
        </Text>
        <Text style={styles.heroText}>{t('ranked.setup.text')}</Text>
      </View>
      <SectionHeader title={t('ranked.setup.game')} />
      <SegmentedControl
        testID="ranked-game"
        label={t('ranked.setup.game')}
        options={options}
        value={game}
        onChange={onGame}
      />
      <SectionCard>
        <SectionRow
          testID="ranked-clock"
          icon="clock"
          label={t('ranked.setup.clock', { count: RANKED_TURN_TIME_MINUTES })}
          hint={t('ranked.setup.clockHint')}
          right={<Text style={styles.clock}>{TURN_CLOCK}</Text>}
          accessibilityLabel={[
            t('ranked.setup.clock', { count: RANKED_TURN_TIME_MINUTES }),
            t('ranked.setup.clockHint'),
          ].join(', ')}
        />
        <SectionRow
          testID="ranked-rating"
          icon="trophy"
          label={t('ranked.setup.ranked')}
          hint={rating === null ? t('ranked.setup.noHints') : t('ranked.setup.rating', { rating })}
        />
      </SectionCard>
    </>
  );
}

/** The rating range of a search now: "1440 – 1540". */
export interface RatingRange {
  readonly low: number;
  readonly high: number;
}

export interface RankedSearchingProps {
  game: RankedGame;
  waitedMs: number;
  range: RatingRange;
  tableWidth: number;
}

export function RankedSearching({ game, waitedMs, range, tableWidth }: RankedSearchingProps) {
  const { t } = useTranslation();
  return (
    <View testID="ranked-searching" style={styles.stack}>
      <Table width={tableWidth} opponent={null} />
      <View style={styles.centered}>
        <Text style={styles.title} accessibilityRole="header">
          {t('ranked.searching.title')}
        </Text>
        <Text style={styles.dim}>
          {t('ranked.searching.about', {
            game: t(`games.${game}`),
            count: RANKED_TURN_TIME_MINUTES,
          })}
        </Text>
      </View>
      <SectionCard>
        <SectionRow
          testID="ranked-wait"
          icon="clock"
          label={t('ranked.searching.waiting', { time: waitText(waitedMs) })}
          hint={t('ranked.searching.waitingHint')}
        />
        <SectionRow
          testID="ranked-range"
          icon="trophy"
          label={t('ranked.searching.range', { low: range.low, high: range.high })}
          hint={t('ranked.searching.rangeHint')}
        />
      </SectionCard>
    </View>
  );
}

/** The game to suggest on "Try another game", and how many look for it. */
export interface OtherGame {
  readonly game: RankedGame;
  readonly looking: number;
}

export interface RankedNobodyProps {
  game: RankedGame;
  range: RatingRange;
  /** `null` while the counts load. */
  other: OtherGame | null;
  busy: boolean;
  onKeepLooking: () => void;
  onOtherGame: (game: RankedGame) => void;
  onBot: () => void;
}

/** "Nobody yet" (#532): never a dead end. */
export function RankedNobody({
  game,
  range,
  other,
  busy,
  onKeepLooking,
  onOtherGame,
  onBot,
}: RankedNobodyProps) {
  const { t } = useTranslation();
  const otherHint =
    other === null
      ? t('ranked.nobody.otherLoading')
      : other.looking > 0
        ? t('ranked.nobody.otherHint', { game: t(`games.${other.game}`), count: other.looking })
        : t('ranked.nobody.otherNone', { game: t(`games.${other.game}`) });
  return (
    <View testID="ranked-nobody" style={styles.stack}>
      <View style={styles.centered}>
        <Text style={styles.title} accessibilityRole="header">
          {t('ranked.nobody.title')}
        </Text>
        <Text style={styles.dim}>{t('ranked.nobody.text', { game: t(`games.${game}`) })}</Text>
      </View>
      <SectionCard>
        <SectionRow
          testID="ranked-keep-looking"
          icon="search"
          label={t('ranked.nobody.keep')}
          hint={t('ranked.nobody.keepHint', { low: range.low, high: range.high })}
          disabled={busy}
          onPress={onKeepLooking}
        />
        <SectionRow
          testID="ranked-other-game"
          icon="dices"
          label={t('ranked.nobody.other')}
          hint={otherHint}
          disabled={busy || other === null}
          onPress={() => {
            if (other !== null) onOtherGame(other.game);
          }}
        />
        <SectionRow
          testID="ranked-bot"
          icon="bot"
          label={t('ranked.nobody.bot')}
          hint={t('ranked.nobody.botHint')}
          disabled={busy}
          onPress={onBot}
        />
      </SectionCard>
    </View>
  );
}

export interface RankedMatchedProps {
  game: RankedGame;
  me: SeekPlayer;
  meKey: string;
  opponent: SeekPlayer;
  /** What the match is worth to you, or `null` when your rating did not load. */
  stakes: MatchStakes | null;
  tableWidth: number;
}

/** A player sat down (#532): the chair fills. The match starts by itself. */
export function RankedMatched({
  game,
  me,
  meKey,
  opponent,
  stakes,
  tableWidth,
}: RankedMatchedProps) {
  const { t } = useTranslation();
  const name = playerNameText(opponent.name, t) ?? t('online.opponent');
  const myName = playerNameText(me.name, t);
  const opponentKey = `opponent:${name}`;
  return (
    <View testID="ranked-matched" style={styles.stack}>
      <Table width={tableWidth} opponent={{ key: opponentKey }} />
      <View style={styles.centered}>
        <Text style={styles.kicker}>{t('ranked.matched.kicker')}</Text>
        <Text testID="ranked-opponent-name" style={styles.title} accessibilityRole="header">
          {name}
        </Text>
      </View>
      <SectionCard padded>
        <View style={styles.players}>
          <View
            style={styles.player}
            accessible
            accessibilityLabel={t('ranked.matched.playerLabel', { name, rating: opponent.rating })}>
            <CheckerAvatar playerKey={opponentKey} name={name} size={56} />
            <Text style={styles.playerName}>{name}</Text>
            <Text testID="ranked-opponent-rating" style={styles.dim}>
              {opponent.rating}
            </Text>
          </View>
          <View style={styles.middle}>
            <Text style={styles.playerName}>{t(`games.${game}`)}</Text>
            <Text style={styles.dim}>
              {t('ranked.matched.clock', { count: RANKED_TURN_TIME_MINUTES })}
            </Text>
          </View>
          <View
            style={styles.player}
            accessible
            accessibilityLabel={t('ranked.matched.youLabel', { rating: me.rating })}>
            <CheckerAvatar playerKey={meKey} name={myName} size={56} you />
            <Text style={styles.playerName}>{t('ranked.matched.you')}</Text>
            <Text testID="ranked-my-rating" style={styles.dim}>
              {me.rating}
            </Text>
          </View>
        </View>
      </SectionCard>
      {stakes !== null ? (
        <SectionCard>
          <SectionRow
            testID="ranked-stakes"
            icon="trophy"
            label={t('ranked.matched.stakes', { win: stakes.win, lose: stakes.lose })}
            hint={t('ranked.matched.stakesHint', { count: RANKED_TARGET_POINTS })}
          />
        </SectionCard>
      ) : null}
    </View>
  );
}

/** The main button and the lines under it, kept at the bottom. */
export function RankedFooterNote({ text }: { text: string }) {
  return <Text style={styles.footnote}>{text}</Text>;
}

const styles = StyleSheet.create((theme) => ({
  hero: {
    alignItems: 'center',
    gap: theme.space.sm,
    padding: theme.space.lg,
    borderRadius: theme.radii.xl,
    borderWidth: 1,
    borderColor: theme.colors.accentLine,
    backgroundColor: theme.colors.surface,
    backgroundImage: `linear-gradient(160deg, ${theme.colors.surfaceSelected} 0%, ${theme.colors.surface} 70%)`,
  },
  heroTitle: {
    ...theme.type.title2,
    color: theme.colors.text,
    textAlign: 'center',
  },
  heroText: {
    ...theme.type.callout,
    color: theme.colors.textDim,
    textAlign: 'center',
  },
  table: {
    alignItems: 'center',
  },
  stack: {
    gap: theme.space.lg,
  },
  centered: {
    alignItems: 'center',
    gap: theme.space.xs,
  },
  title: {
    ...theme.type.title1,
    color: theme.colors.text,
    textAlign: 'center',
  },
  kicker: {
    ...theme.type.section,
    color: theme.colors.accent,
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  dim: {
    ...theme.type.callout,
    color: theme.colors.textDim,
    textAlign: 'center',
  },
  clock: {
    ...theme.type.title2,
    color: theme.colors.turn,
  },
  players: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.sm,
  },
  player: {
    flex: 1,
    alignItems: 'center',
    gap: theme.space.xs,
  },
  middle: {
    flex: 1,
    alignItems: 'center',
    gap: theme.space.xxs,
  },
  playerName: {
    ...theme.type.headline,
    color: theme.colors.text,
    textAlign: 'center',
  },
  footnote: {
    ...theme.type.footnote,
    color: theme.colors.textDim,
    textAlign: 'center',
  },
}));

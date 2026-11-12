/**
 * Leaderboards (#407, ADR-0008 item 9; the Figma pass #502), from Home's
 * Leaderboards tile, Settings → Online and the Friends screen: your
 * rating, the friends board and the global board.
 *
 * - Ratings need a saved account. A guest reads that, sees what a saved
 *   account gives (`AccountBenefits`) and gets a button to Settings →
 *   Account; nobody signed in reads that too. The screen makes no account.
 * - The rating hero (a raised surface): your checker, the rating as a big
 *   numeral ("—" before the first rated match, never a number you do not
 *   have yet), your rated matches as a chip, and the way to the global
 *   board: a bar to `MIN_BOARD_MATCHES`, or why the board does or does not
 *   show you (hidden, no username with a button to Settings → Username,
 *   or listed).
 * - Friends | Everyone picks the board. Each row reads its place, name and
 *   rating as one element. Your row has a brass edge and a "You" chip, so
 *   color is not the only cue; screen readers hear "(you)". Everyone rows
 *   show the match count, and your row pins under the board when the board
 *   does not hold you.
 * - Everyone has "Show me on the global board" (`ratings.setShown`). Until
 *   you can show there it has a lock and says why, but it still works: a
 *   player may hide before the board would list them. One call at a time;
 *   a failed call keeps the switch and opens the problem popup
 *   (`ProblemDialog`, #462).
 * - "How ratings work" opens a sheet with the rules in five short rows.
 * - Loads through `useFriendsData`: a new visit loads again, a quiet
 *   reload that fails keeps what shows and says so.
 * - Focus moves to the title. Large fonts scroll: no text has a line limit.
 *
 * Navigation stays in the route (`app/ratings.tsx`).
 */
import {
  MIN_BOARD_MATCHES,
  RATED_MATCHES_PER_PAIR_PER_DAY,
  START_RATING,
  type AuthProvider,
  type BoardRow,
  type MyRating,
  type Ratings,
} from '@tavli/contracts';
import type { TFunction } from 'i18next';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { ActionButton } from '@/components/ActionButton';
import { CheckerAvatar } from '@/components/CheckerAvatar';
import { Icon } from '@/components/Icon';
import type { IconName } from '@/components/icons';
import { ProblemDialog } from '@/components/Problem';
import { Screen } from '@/components/Screen';
import { ScreenHeader } from '@/components/ScreenHeader';
import { SectionCard, SectionRow } from '@/components/SectionCard';
import { SegmentedControl } from '@/components/settings/SegmentedControl';
import { ToggleRow } from '@/components/settings/ToggleRow';
import { Sheet } from '@/components/Sheet';
import { Surface } from '@/components/Surface';
import { useFocusOnShow } from '@/features/accessibility/focus';
import { useFriendsData } from '@/features/friends/friendsData';
import { NotReady, RefreshFailed } from '@/features/friends/FriendsParts';
import { playerNameText } from '@/features/online/playerName';

export interface RatingsScreenProps {
  /** Counts the times the screen shows (the route): each new one loads again. */
  visit?: number;
  auth: AuthProvider;
  ratings: Ratings;
  onBack: () => void;
  /** Opens Settings → Account (a guest saves the account there). */
  onAccount: () => void;
  /** Opens Settings → Username (the global board needs one). */
  onUsername: () => void;
}

export type BoardKind = 'friends' | 'everyone';

interface RatingsData {
  readonly mine: MyRating;
  readonly friends: readonly BoardRow[];
  readonly everyone: readonly BoardRow[];
}

/** Why the global board does or does not show the player. */
export type BoardStatus = 'hidden' | 'fewMatches' | 'noUsername' | 'listed';

export function boardStatus(mine: MyRating): BoardStatus {
  if (!mine.shown) return 'hidden';
  if (mine.matches < MIN_BOARD_MATCHES) return 'fewMatches';
  return mine.listed ? 'listed' : 'noUsername';
}

/** A rating as shown: a dash before the first rated match. */
export function ratingText(rating: number, matches: number): string {
  return matches === 0 ? NO_RATING : String(rating);
}

const NO_RATING = '—';
/** The place of a row that is not on the board (your pinned row). */
const NO_RANK = '–';

export function RatingsScreen({
  auth,
  ratings,
  onBack,
  onAccount,
  onUsername,
  visit = 0,
}: RatingsScreenProps) {
  const { t } = useTranslation();
  const titleRef = useFocusOnShow();
  const load = useCallback(async (): Promise<RatingsData> => {
    const [mine, friends, everyone] = await Promise.all([
      ratings.mine(),
      ratings.friendsBoard(),
      ratings.globalBoard(),
    ]);
    return { mine, friends, everyone };
  }, [ratings]);
  const { state, reload, retry, sessionLost } = useFriendsData(auth, load, visit);
  const [board, setBoard] = useState<BoardKind>('friends');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [howOpen, setHowOpen] = useState(false);

  const setShown = (shown: boolean) => {
    if (busy) return;
    setBusy(true);
    ratings.setShown(shown).then(
      () => {
        setBusy(false);
        reload();
      },
      (error: unknown) => {
        setBusy(false);
        if (sessionLost(error)) return;
        setFailed(true);
      },
    );
  };

  return (
    <Screen testID="ratings-screen">
      <ScreenHeader
        title={t('ratings.title')}
        titleRef={titleRef}
        onBack={onBack}
        backLabel={t('common.back')}
        testID="ratings-back"
      />
      <ScrollView style={styles.body} contentContainerStyle={styles.content}>
        {state.kind !== 'ready' ? (
          <NotReady
            state={state}
            onRetry={retry}
            onAccount={onAccount}
            testID="ratings"
            texts="ratings"
          />
        ) : (
          <Ready
            data={state.data}
            refreshFailed={state.refreshFailed === true}
            board={board}
            onBoard={setBoard}
            onReload={reload}
            onShown={setShown}
            onUsername={onUsername}
            onHow={() => setHowOpen(true)}
          />
        )}
      </ScrollView>
      <Sheet
        testID="ratings-how-sheet"
        visible={howOpen}
        onClose={() => setHowOpen(false)}
        closeLabel={t('ratings.how.ok')}>
        {howOpen ? <HowRatingsWork onClose={() => setHowOpen(false)} /> : null}
      </Sheet>
      <ProblemDialog
        testID="ratings-problem"
        problem={
          failed ? { title: t('ratings.problem.title'), text: t('ratings.problem.text') } : null
        }
        okLabel={t('problem.ok')}
        onOk={() => setFailed(false)}
      />
    </Screen>
  );
}

interface ReadyProps {
  data: RatingsData;
  refreshFailed: boolean;
  board: BoardKind;
  onBoard: (board: BoardKind) => void;
  onReload: () => void;
  onShown: (shown: boolean) => void;
  onUsername: () => void;
  onHow: () => void;
}

function Ready({
  data,
  refreshFailed,
  board,
  onBoard,
  onReload,
  onShown,
  onUsername,
  onHow,
}: ReadyProps) {
  const { t } = useTranslation();
  const { mine } = data;
  // The friends board always holds the caller: their id and name.
  const me = data.friends.find((row) => row.me) ?? null;
  const meName = me === null ? null : (playerNameText(me.name, t) ?? t('ratings.unnamed'));
  const status = boardStatus(mine);
  const onBoardNow = data.everyone.some((row) => row.me);
  return (
    <>
      {refreshFailed ? <RefreshFailed onRetry={onReload} testID="ratings" /> : null}
      <RatingHero
        mine={mine}
        playerKey={me?.playerId ?? 'me'}
        name={meName}
        onUsername={onUsername}
      />
      <SegmentedControl<BoardKind>
        testID="ratings-board"
        label={t('ratings.board.label')}
        options={[
          { value: 'friends', label: t('ratings.board.friends') },
          { value: 'everyone', label: t('ratings.board.everyone') },
        ]}
        value={board}
        onChange={onBoard}
      />
      {board === 'friends' ? (
        <Board testID="ratings-friends" rows={data.friends} empty={t('ratings.friends.empty')} />
      ) : (
        <>
          <SectionCard>
            <ToggleRow
              testID="ratings-show-me"
              icon={status === 'fewMatches' || status === 'noUsername' ? 'lock' : 'trophy'}
              label={t('ratings.showMe.label')}
              hint={showMeHint(status, mine, t)}
              value={mine.shown}
              onValueChange={onShown}
            />
          </SectionCard>
          <Board
            testID="ratings-everyone"
            rows={data.everyone}
            empty={t('ratings.everyone.empty')}
            withMatches
          />
          {!onBoardNow && meName !== null ? (
            <SectionCard testID="ratings-pinned">
              <RankedRow
                testID="ratings-pinned-row"
                rank={NO_RANK}
                playerKey={me?.playerId ?? 'me'}
                name={meName}
                me
                line={t('ratings.row.pinned')}
                rating={ratingText(mine.rating, mine.matches)}
                label={
                  mine.matches === 0
                    ? `${t('ratings.row.me', { name: meName })}, ${t('ratings.row.pinned')}`
                    : t('ratings.row.pinnedLabel', {
                        name: t('ratings.row.me', { name: meName }),
                        rating: mine.rating,
                      })
                }
              />
            </SectionCard>
          ) : null}
        </>
      )}
      <SectionCard>
        <SectionRow
          testID="ratings-how"
          icon="circleHelp"
          label={t('ratings.how.title')}
          accessibilityHint={t('ratings.how.hint')}
          onPress={onHow}
        />
      </SectionCard>
    </>
  );
}

/** The switch's hint: why it is locked, or what it shows. */
function showMeHint(status: BoardStatus, mine: MyRating, t: TFunction): string {
  if (status === 'fewMatches') {
    return t('ratings.showMe.locked', { min: MIN_BOARD_MATCHES, have: mine.matches });
  }
  if (status === 'noUsername') return t('ratings.status.noUsername');
  return t('ratings.showMe.hint', { count: MIN_BOARD_MATCHES });
}

interface RatingHeroProps {
  mine: MyRating;
  playerKey: string;
  name: string | null;
  onUsername: () => void;
}

function RatingHero({ mine, playerKey, name, onUsername }: RatingHeroProps) {
  const { t } = useTranslation();
  const status = boardStatus(mine);
  const left = Math.max(0, MIN_BOARD_MATCHES - mine.matches);
  const label =
    mine.matches === 0
      ? t('ratings.mine.none')
      : t('ratings.mine.label', { rating: mine.rating, count: mine.matches });
  return (
    <Surface tier="raised" testID="ratings-mine" style={styles.hero}>
      <View style={styles.heroTop} accessible accessibilityLabel={label}>
        <CheckerAvatar playerKey={playerKey} name={name ?? undefined} size={56} />
        <View style={styles.heroTexts}>
          <Text style={styles.heroCaption}>{t('ratings.mine.title')}</Text>
          <Text testID="ratings-mine-rating" style={styles.heroRating}>
            {ratingText(mine.rating, mine.matches)}
          </Text>
        </View>
        <Chip text={t('ratings.mine.matches', { count: mine.matches })} />
      </View>
      {status === 'fewMatches' ? (
        <View style={styles.progress}>
          <View style={styles.track} importantForAccessibility="no-hide-descendants">
            <View
              style={[styles.fill, { width: `${(100 * mine.matches) / MIN_BOARD_MATCHES}%` }]}
            />
          </View>
          <Text testID="ratings-status-fewMatches" style={styles.heroNote}>
            {t('ratings.status.fewMatches', { count: left })}
          </Text>
        </View>
      ) : (
        <Text testID={`ratings-status-${status}`} style={styles.heroNote}>
          {t(`ratings.status.${status}`)}
        </Text>
      )}
      {status === 'noUsername' ? (
        <ActionButton
          testID="ratings-username"
          kind="secondary"
          compact
          label={t('ratings.status.pickUsername')}
          onPress={onUsername}
        />
      ) : null}
    </Surface>
  );
}

/** A small pill: the rated matches, or "You" (`me`). */
function Chip({ text, me = false }: { text: string; me?: boolean }) {
  return (
    <View style={styles.chip(me)}>
      <Text style={styles.chipText(me)}>{text}</Text>
    </View>
  );
}

function Board({
  rows,
  empty,
  testID,
  withMatches = false,
}: {
  rows: readonly BoardRow[];
  empty: string;
  testID: string;
  /** Each row says its rated matches (the global board). */
  withMatches?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <SectionCard testID={testID}>
      {rows.length === 0 ? (
        <View style={styles.emptyRow}>
          <Text testID={`${testID}-empty`} style={styles.emptyText}>
            {empty}
          </Text>
        </View>
      ) : (
        rows.map((row) => {
          const name = playerNameText(row.name, t) ?? t('ratings.unnamed');
          const spoken = row.me ? t('ratings.row.me', { name }) : name;
          return (
            <RankedRow
              key={row.playerId}
              testID={`${testID}-row-${row.playerId}`}
              rank={String(row.rank)}
              top={row.rank <= 3}
              playerKey={row.playerId}
              name={name}
              me={row.me}
              line={withMatches ? t('ratings.row.matches', { count: row.matches }) : undefined}
              rating={ratingText(row.rating, row.matches)}
              label={
                row.matches === 0
                  ? t('ratings.row.labelNone', { rank: row.rank, name: spoken })
                  : t('ratings.row.label', { rank: row.rank, name: spoken, rating: row.rating })
              }
            />
          );
        })
      )}
    </SectionCard>
  );
}

interface RankedRowProps {
  rank: string;
  /** One of the first three places: a gold number. */
  top?: boolean;
  playerKey: string;
  name: string;
  me: boolean;
  /** A short line under the name. */
  line?: string;
  rating: string;
  /** What screen readers say for the whole row. */
  label: string;
  testID: string;
}

function RankedRow({
  rank,
  top = false,
  playerKey,
  name,
  me,
  line,
  rating,
  label,
  testID,
}: RankedRowProps) {
  const { t } = useTranslation();
  return (
    <View testID={testID} style={styles.row(me)} accessible accessibilityLabel={label}>
      <Text style={styles.rank(top)}>{rank}</Text>
      <CheckerAvatar playerKey={playerKey} name={name} size={40} />
      <View style={styles.rowTexts}>
        <View style={styles.nameLine}>
          <Text style={styles.name}>{name}</Text>
          {me ? <Chip text={t('ratings.row.you')} me /> : null}
        </View>
        {line !== undefined ? <Text style={styles.rowLine}>{line}</Text> : null}
      </View>
      <Text style={styles.rowRating}>{rating}</Text>
    </View>
  );
}

/** The rules in five short rows (the sheet of "How ratings work"). */
function HowRatingsWork({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const titleRef = useFocusOnShow();
  const rules: readonly { icon: IconName; text: string; more?: string }[] = [
    { icon: 'trophy', text: t('ratings.how.start', { rating: START_RATING }) },
    { icon: 'swords', text: t('ratings.how.count'), more: t('ratings.how.countMore') },
    { icon: 'chart', text: t('ratings.how.gain'), more: t('ratings.how.gainMore') },
    { icon: 'clock', text: t('ratings.how.cap', { count: RATED_MATCHES_PER_PAIR_PER_DAY }) },
    { icon: 'bot', text: t('ratings.how.never') },
  ];
  return (
    <View style={styles.how}>
      <Text ref={titleRef} accessibilityRole="header" style={styles.howTitle}>
        {t('ratings.how.title')}
      </Text>
      <SectionCard testID="ratings-how-rules">
        {rules.map((rule) => (
          <HowRule key={rule.icon} {...rule} />
        ))}
      </SectionCard>
      <ActionButton
        testID="ratings-how-ok"
        kind="secondary"
        label={t('ratings.how.ok')}
        onPress={onClose}
      />
    </View>
  );
}

function HowRule({ icon, text, more }: { icon: IconName; text: string; more?: string }) {
  const { theme } = useUnistyles();
  return (
    <View style={styles.rule} accessible accessibilityLabel={more ? `${text}. ${more}` : text}>
      <Icon name={icon} size={24} color={theme.colors.accent} />
      <View style={styles.rowTexts}>
        <Text style={styles.ruleText}>{text}</Text>
        {more ? <Text style={styles.rowLine}>{more}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  body: {
    flex: 1,
  },
  content: {
    gap: theme.space.lg,
    paddingHorizontal: theme.space.lg,
    paddingTop: theme.space.sm,
    paddingBottom: theme.space.lg,
  },
  hero: {
    gap: 14,
    padding: 18,
  },
  heroTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  heroTexts: {
    flex: 1,
  },
  heroCaption: {
    ...theme.type.callout,
    color: theme.colors.textDim,
  },
  heroRating: {
    ...theme.type.numeral,
    fontSize: 52,
    lineHeight: 56,
    color: theme.colors.turnText,
  },
  heroNote: {
    ...theme.type.footnote,
    color: theme.colors.textDim,
  },
  progress: {
    gap: theme.space.sm,
  },
  track: {
    height: 10,
    borderRadius: 5,
    overflow: 'hidden',
    backgroundColor: theme.colors.surfaceSunken,
    boxShadow: 'inset 0px 2px 4px rgba(0, 0, 0, 0.55)',
  },
  fill: {
    height: '100%',
    borderRadius: 5,
    backgroundImage: `linear-gradient(90deg, ${theme.colors.accent} 0%, ${theme.colors.accentLight} 100%)`,
  },
  chip: (me: boolean) => ({
    minHeight: 26,
    justifyContent: 'center',
    paddingHorizontal: 10,
    borderRadius: 13,
    ...(me
      ? {
          borderWidth: 1,
          borderColor: theme.colors.accentLine,
          backgroundColor: theme.colors.accentWash,
        }
      : { backgroundColor: theme.colors.surfaceSunken }),
  }),
  chipText: (me: boolean) => ({
    ...theme.type.footnote,
    fontWeight: '600',
    color: me ? theme.colors.turnText : theme.colors.textDim,
  }),
  row: (me: boolean) => ({
    minHeight: theme.touch.row,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.md,
    paddingHorizontal: theme.space.lg,
    paddingVertical: 10,
    ...(me
      ? {
          backgroundColor: theme.colors.surfaceSelected,
          boxShadow: `inset 3px 0px 0px ${theme.colors.accent}`,
        }
      : {}),
  }),
  rank: (top: boolean) => ({
    ...theme.type.title3,
    fontFamily: theme.type.numeral.fontFamily,
    minWidth: 26,
    color: top ? theme.colors.turnText : theme.colors.textDim,
  }),
  rowTexts: {
    flex: 1,
    gap: theme.space.xxs,
  },
  nameLine: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: theme.space.sm,
  },
  name: {
    ...theme.type.headline,
    flexShrink: 1,
    color: theme.colors.text,
  },
  rowLine: {
    ...theme.type.footnote,
    color: theme.colors.textDim,
  },
  rowRating: {
    ...theme.type.title3,
    fontFamily: theme.type.numeral.fontFamily,
    fontVariant: ['tabular-nums'],
    color: theme.colors.text,
  },
  emptyRow: {
    paddingHorizontal: theme.space.lg,
    paddingVertical: theme.space.md,
  },
  emptyText: {
    ...theme.type.body,
    color: theme.colors.textDim,
  },
  how: {
    gap: theme.space.lg,
  },
  howTitle: {
    ...theme.type.title2,
    color: theme.colors.text,
  },
  rule: {
    minHeight: theme.touch.row,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.lg,
    paddingHorizontal: theme.space.lg,
    paddingVertical: theme.space.md,
  },
  ruleText: {
    ...theme.type.headline,
    color: theme.colors.text,
  },
}));

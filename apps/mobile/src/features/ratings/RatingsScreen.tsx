/**
 * Leaderboards (#407, ADR-0008 item 9), from Settings → Online and the
 * Friends screen: your rating, the friends board and the global board.
 *
 * - Ratings need a saved account. A guest reads that, sees what a saved
 *   account gives (`AccountBenefits`) and gets a button to Settings →
 *   Account; nobody signed in reads that too. The screen makes no account.
 * - Your card: the rating, your rated matches, and why the global board
 *   does or does not show you (hidden, too few matches, or no username,
 *   with a button to Settings → Username).
 * - Friends | Everyone picks the board. Each row reads its place, name and
 *   rating as one element; your own row says "(you)" and is shaded, so
 *   color is not the only cue.
 * - Everyone has "Show me on the global board" (`ratings.setShown`). One
 *   call at a time; a failed call keeps the switch and opens the problem
 *   popup (`ProblemDialog`, #462).
 * - Loads through `useFriendsData`: a new visit loads again, a quiet
 *   reload that fails keeps what shows and says so.
 * - Focus moves to the title. Large fonts scroll: no text has a line limit.
 *
 * Navigation stays in the route (`app/ratings.tsx`).
 */
import {
  MIN_BOARD_MATCHES,
  type AuthProvider,
  type BoardRow,
  type MyRating,
  type Ratings,
} from '@tavli/contracts';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { ActionButton } from '@/components/ActionButton';
import { ProblemDialog } from '@/components/Problem';
import { Screen } from '@/components/Screen';
import { ScreenHeader } from '@/components/ScreenHeader';
import { RowDivider, SectionCard } from '@/components/SectionCard';
import { SegmentedControl } from '@/components/settings/SegmentedControl';
import { ToggleRow } from '@/components/settings/ToggleRow';
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
          <>
            {state.refreshFailed === true ? (
              <RefreshFailed onRetry={reload} testID="ratings" />
            ) : null}
            <MyCard mine={state.data.mine} onUsername={onUsername} />
            <SegmentedControl<BoardKind>
              testID="ratings-board"
              label={t('ratings.board.label')}
              options={[
                { value: 'friends', label: t('ratings.board.friends') },
                { value: 'everyone', label: t('ratings.board.everyone') },
              ]}
              value={board}
              onChange={setBoard}
            />
            {board === 'friends' ? (
              <Board
                testID="ratings-friends"
                rows={state.data.friends}
                empty={t('ratings.friends.empty')}
              />
            ) : (
              <>
                <SectionCard>
                  <ToggleRow
                    testID="ratings-show-me"
                    icon="trophy"
                    label={t('ratings.showMe.label')}
                    hint={t('ratings.showMe.hint', { count: MIN_BOARD_MATCHES })}
                    value={state.data.mine.shown}
                    onValueChange={setShown}
                  />
                </SectionCard>
                <Board
                  testID="ratings-everyone"
                  rows={state.data.everyone}
                  empty={t('ratings.everyone.empty')}
                />
              </>
            )}
            <Text style={styles.hint}>{t('ratings.note')}</Text>
          </>
        )}
      </ScrollView>
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

function MyCard({ mine, onUsername }: { mine: MyRating; onUsername: () => void }) {
  const { t } = useTranslation();
  const status = boardStatus(mine);
  const left = Math.max(0, MIN_BOARD_MATCHES - mine.matches);
  return (
    <SectionCard padded testID="ratings-mine">
      <View
        style={styles.mine}
        accessible
        accessibilityLabel={t('ratings.mine.label', {
          rating: mine.rating,
          count: mine.matches,
        })}>
        <Text style={styles.caption}>{t('ratings.mine.title')}</Text>
        <Text testID="ratings-mine-rating" style={styles.rating}>
          {mine.rating}
        </Text>
        <Text style={styles.caption}>{t('ratings.mine.matches', { count: mine.matches })}</Text>
      </View>
      <Text testID={`ratings-status-${status}`} style={styles.line}>
        {status === 'fewMatches'
          ? t('ratings.status.fewMatches', { count: left })
          : t(`ratings.status.${status}`)}
      </Text>
      {status === 'noUsername' ? (
        <ActionButton
          testID="ratings-username"
          kind="secondary"
          compact
          label={t('ratings.status.pickUsername')}
          onPress={onUsername}
        />
      ) : null}
    </SectionCard>
  );
}

function Board({
  rows,
  empty,
  testID,
}: {
  rows: readonly BoardRow[];
  empty: string;
  testID: string;
}) {
  const { t } = useTranslation();
  return (
    <SectionCard testID={testID}>
      {rows.length === 0 ? (
        <View style={styles.row}>
          <Text testID={`${testID}-empty`} style={styles.line}>
            {empty}
          </Text>
        </View>
      ) : (
        rows.map((row, i) => {
          const name = playerNameText(row.name, t) ?? t('ratings.unnamed');
          const shown = row.me ? t('ratings.row.me', { name }) : name;
          return (
            <View key={row.playerId}>
              {i > 0 ? <RowDivider /> : null}
              <View
                testID={`${testID}-row-${row.playerId}`}
                style={[styles.row, styles.boardRow, row.me && styles.meRow]}
                accessible
                accessibilityLabel={t('ratings.row.label', {
                  rank: row.rank,
                  name: shown,
                  rating: row.rating,
                })}>
                <Text style={styles.rank}>{row.rank}</Text>
                <Text style={[styles.name, row.me && styles.meName]}>{shown}</Text>
                <Text style={styles.rowRating}>{row.rating}</Text>
              </View>
            </View>
          );
        })
      )}
    </SectionCard>
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
  line: {
    ...theme.type.body,
    color: theme.colors.text,
  },
  hint: {
    ...theme.type.caption,
    color: theme.colors.textDim,
  },
  caption: {
    ...theme.type.caption,
    color: theme.colors.textDim,
  },
  mine: {
    alignItems: 'center',
    gap: theme.space.xxs,
  },
  rating: {
    ...theme.type.numeral,
    color: theme.colors.accentLight,
  },
  row: {
    paddingHorizontal: theme.space.lg,
    paddingVertical: theme.space.md,
  },
  boardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.md,
  },
  meRow: {
    backgroundColor: theme.colors.accentWash,
  },
  rank: {
    ...theme.type.bodyStrong,
    color: theme.colors.textDim,
    minWidth: 28,
  },
  name: {
    ...theme.type.body,
    color: theme.colors.text,
    flex: 1,
  },
  meName: {
    fontWeight: '600',
  },
  rowRating: {
    ...theme.type.bodyStrong,
    color: theme.colors.text,
  },
}));

/**
 * The friend page (#644, Figma Screens → 34 Friend page v3): a tap on a
 * friend in Friends opens it. It shows the friend, your record and the
 * matches with them:
 *
 * - The name is the heading. Under it: their rating once they have a rated
 *   match (`ratings.friendsBoard()`, quietly: a failed call shows none)
 *   and the day of your last match, or "Friends since" before the first.
 * - The record ("12–9", "You lead · 21 matches") from `Friend.record`,
 *   hidden before the first finished match.
 * - Matches in play: your turn first, then theirs, then the friend's open
 *   invites to you. A tap opens the game or the invite. Hidden when empty.
 * - Rematch sends an invite with the newest finished friend match's setup
 *   (`rematchSetup`), and says so ("Same settings: …"); Change opens the
 *   full setup. With no such match the button is Invite to a game, which
 *   opens the full setup. The screen stays and shows "Invite sent".
 * - Recent matches: the 5 newest finished ones (the server lists the last
 *   `MAX_LISTED_GAMES`). A tap opens the game; History lists them all.
 * - The "…" button opens Report or block and Remove friend (asks first).
 *   After a remove the page goes back. After a block the friend is gone
 *   and the page says so.
 * - No match and no invite: one card ("No matches yet") and Invite.
 * - One call at a time; a failed call says so, also to screen readers.
 *   Focus moves to the name. Large fonts scroll: no text has a line limit.
 *
 * Games come from `GameTransport.watchMyGames` (live), the rest from
 * `Friends`. Navigation stays in the route (`app/friends/[id].tsx`).
 * Never send the friend's id, name or rating to analytics or the logs.
 */
import type {
  AuthProvider,
  Friend,
  Friends,
  GameSummary,
  GameTransport,
  InviteView,
  NewInvite,
  Ratings,
  Safety,
  Usernames,
} from '@tavli/contracts';
import { fonts } from '@tavli/ui';
import { useLocales } from 'expo-localization';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { ActionButton } from '@/components/ActionButton';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Icon } from '@/components/Icon';
import { RoundButton } from '@/components/RoundButton';
import { Screen } from '@/components/Screen';
import { CardFrame, RowDivider } from '@/components/SectionCard';
import { SectionHeader } from '@/components/SectionHeader';
import { Sheet } from '@/components/Sheet';
import { surfaceStyle } from '@/components/Surface';
import { Toast, useToast } from '@/components/Toast';
import { useFocusOnShow } from '@/features/accessibility/focus';
import { useAnnouncement } from '@/features/game/useAnnouncement';
import { dateLocale, formatDate } from '@/features/history/format';
import { saveFriendInviteSetup } from '@/features/invites/friendInviteSetup';
import { sendInviteCreated } from '@/features/invites/inviteAnalytics';
import { gameScore } from '@/features/online/gameText';
import { listTickMs, useMyOnlineGames, usePhoneClock } from '@/features/online/myGames';
import { playerNameText } from '@/features/online/playerName';
import { ReportOrBlock } from '@/features/safety/ReportOrBlock';

import {
  activeGameText,
  FRIEND_RECENT_ROWS,
  gameLine,
  gamesWith,
  inviteText,
  invitesFrom,
  lastMatchAt,
  rematchSetup,
  type ActiveRowText,
} from './friendPage';
import { friendsProblem, useFriendsData, type FriendsProblem } from './friendsData';
import { friendsStyles, NotReady, RefreshFailed, useProblemText } from './FriendsParts';
import { SheetRow } from './FriendsScreen';

export interface FriendPageScreenProps {
  /** The friend's player id (from the route). */
  playerId: string;
  /** Counts the times the screen shows (the route): each new one loads again. */
  visit?: number;
  auth: AuthProvider;
  /** For the username gate (#599). */
  usernames: Usernames;
  friends: Friends;
  /** The online games. `undefined`: no game rows. */
  games?: GameTransport;
  /** The friend's rating. `undefined`: no rating. */
  ratings?: Ratings;
  /** Report or block. `undefined`: the menu has no such row. */
  safety?: Safety;
  onBack: () => void;
  /** Opens an online game (in play or finished). */
  onOpenGame: (gameId: string) => void;
  /** Opens a friend invite to you (the invite screen). */
  onOpenInvite: (code: string) => void;
  /** Opens the full game setup for a friend invite. */
  onInvite: (playerId: string) => void;
  /** Rematch sent a friend invite. The screen stays. */
  onInvited: (code: string) => void;
  /** Opens History. */
  onHistory: () => void;
  /** Opens Settings → Account (a guest saves the account there). */
  onAccount: () => void;
}

interface PageData {
  /** `null`: not friends (any more). */
  readonly friend: Friend | null;
  readonly invites: readonly InviteView[];
  /** Their rating once they have a rated match, else `null`. */
  readonly rating: number | null;
}

type Panel = 'menu' | 'remove' | 'report';

export function FriendPageScreen({
  playerId,
  visit = 0,
  auth,
  usernames,
  friends,
  games,
  ratings,
  safety,
  onBack,
  onOpenGame,
  onOpenInvite,
  onInvite,
  onInvited,
  onHistory,
  onAccount,
}: FriendPageScreenProps) {
  const { t, i18n } = useTranslation();
  const locale = dateLocale(i18n.resolvedLanguage ?? i18n.language, useLocales());
  const load = useCallback(async (): Promise<PageData> => {
    const [list, invites, board] = await Promise.all([
      friends.listFriends(),
      friends.listFriendInvites(),
      ratings === undefined ? [] : ratings.friendsBoard().catch(() => []),
    ]);
    const row = board.find((r) => r.playerId === playerId);
    return {
      friend: list.find((f) => f.playerId === playerId) ?? null,
      invites: invitesFrom(invites, playerId),
      rating: row === undefined || row.matches === 0 ? null : row.rating,
    };
  }, [friends, ratings, playerId]);
  const { state, reload, retry, sessionLost } = useFriendsData(auth, load, visit, usernames);
  const ready = state.kind === 'ready' && state.data.friend !== null;
  const active = useMyOnlineGames(ready ? auth : undefined, games, 'active');
  const finished = useMyOnlineGames(ready ? auth : undefined, games, 'finished');
  const activeGames =
    active.state.status === 'loaded' ? gamesWith(active.state.games, playerId) : [];
  const offset = active.state.status === 'loaded' ? active.state.offset : 0;
  const pastGames =
    finished.state.status === 'loaded'
      ? gamesWith(finished.state.games, playerId).sort((a, b) => b.updatedAt - a.updatedAt)
      : [];
  const now = usePhoneClock(listTickMs(activeGames), true);

  const [panel, setPanel] = useState<Panel | null>(null);
  const [busy, setBusy] = useState(false);
  // Report or block holds the sheet open while it sends.
  const [held, setHeld] = useState(false);
  const [problem, setProblem] = useState<{ kind: FriendsProblem; n: number } | null>(null);
  // Names each problem, so the same problem twice is read twice.
  const problemCount = useRef(0);
  const problemText = useProblemText(problem?.kind ?? null);
  useAnnouncement(problemText, problem === null ? undefined : `friend-page-problem:${problem.n}`);
  const [toast, showToast] = useToast();
  const [sentCode, setSentCode] = useState<string | null>(null);
  useAnnouncement(toast, sentCode === null ? undefined : `friend-page-sent:${sentCode}`);
  // False once the screen is gone (the server answers later).
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const nameOf = (friend: Friend) => playerNameText(friend.name, t) ?? t('friends.unnamed');

  const fail = (error: unknown) => {
    if (sessionLost(error)) return;
    problemCount.current += 1;
    setProblem({ kind: friendsProblem(error), n: problemCount.current });
    reload();
  };

  const rematch = (friend: Friend, setup: NewInvite) => {
    if (busy) return;
    setBusy(true);
    setProblem(null);
    friends.inviteFriend(friend.playerId, setup).then(
      (code) => {
        saveFriendInviteSetup(setup);
        sendInviteCreated(setup);
        if (!mounted.current) return;
        setBusy(false);
        setSentCode(code);
        showToast(t('friends.sent', { name: nameOf(friend) }));
        onInvited(code);
      },
      (error: unknown) => {
        if (!mounted.current) return;
        setBusy(false);
        fail(error);
      },
    );
  };

  const remove = (friend: Friend) => {
    setPanel(null);
    if (busy) return;
    setBusy(true);
    setProblem(null);
    friends.removeFriend(friend.playerId).then(
      () => {
        if (!mounted.current) return;
        setBusy(false);
        onBack();
      },
      (error: unknown) => {
        if (!mounted.current) return;
        setBusy(false);
        fail(error);
      },
    );
  };

  const closePanel = () => {
    if (held) return;
    const wasReport = panel === 'report';
    setPanel(null);
    // A block ends the friendship: load again.
    if (wasReport) reload();
  };

  let body: ReactNode;
  if (state.kind !== 'ready') {
    body = (
      <NotReady
        state={state}
        onRetry={retry}
        onAccount={onAccount}
        usernames={usernames}
        testID="friend-page"
      />
    );
  } else if (state.data.friend === null) {
    body = (
      <Text testID="friend-page-gone" style={friendsStyles.line}>
        {t('friends.problem.notFriends')}
      </Text>
    );
  } else {
    const { friend, invites, rating } = state.data;
    const setup = rematchSetup(pastGames);
    const rows: { key: string; text: ActiveRowText; onPress: () => void }[] = [
      ...activeGames.map((game) => ({
        key: game.gameId,
        text: activeGameText(game, t, now, offset),
        onPress: () => onOpenGame(game.gameId),
      })),
      ...invites.map((invite) => ({
        key: invite.code,
        text: inviteText(invite, t, now),
        onPress: () => onOpenInvite(invite.code),
      })),
    ];
    const recent = pastGames.slice(0, FRIEND_RECENT_ROWS);
    const nothing = rows.length === 0 && pastGames.length === 0;
    body = (
      <>
        <Heading
          friend={friend}
          name={nameOf(friend)}
          rating={rating}
          lastAt={lastMatchAt(pastGames)}
          locale={locale}
        />
        {state.refreshFailed === true ? (
          <RefreshFailed onRetry={reload} testID="friend-page" />
        ) : null}
        {problemText !== null ? (
          <Text testID="friend-page-problem" style={friendsStyles.line}>
            {problemText}
          </Text>
        ) : null}
        {nothing ? (
          <View testID="friend-page-empty" style={styles.emptyCard}>
            <Text style={styles.rowTitle}>{t('friends.page.emptyTitle')}</Text>
            <Text style={styles.rowLine}>{t('friends.page.emptyBody')}</Text>
          </View>
        ) : null}
        {rows.length > 0 ? (
          <View style={styles.section}>
            <SectionHeader title={t('friends.page.activeTitle')} count={rows.length} />
            <CardFrame testID="friend-page-active">
              {rows.map((row, i) => (
                <View key={row.key}>
                  {i > 0 ? <RowDivider /> : null}
                  <LinkRow
                    testID={`friend-page-active-${row.key}`}
                    label={row.text.label}
                    title={row.text.title}
                    titleAccent={row.text.yours}
                    line={row.text.line}
                    onPress={row.onPress}
                  />
                </View>
              ))}
            </CardFrame>
          </View>
        ) : null}
        {setup === null ? (
          <ActionButton
            testID="friend-page-invite"
            icon="send"
            disabled={busy}
            label={t('friends.sheet.invite')}
            accessibilityLabel={t('friends.list.inviteLabel', { name: nameOf(friend) })}
            onPress={() => onInvite(friend.playerId)}
          />
        ) : (
          <View style={styles.rematch}>
            <ActionButton
              testID="friend-page-rematch"
              icon="send"
              disabled={busy}
              label={busy ? t('friends.quick.sending') : t('friends.page.rematch')}
              onPress={() => rematch(friend, setup)}
            />
            <Text style={styles.rematchNote}>
              {t('friends.page.sameSettings', {
                game: gameLine(setup.choice, setup.targetPoints, t),
              })}
            </Text>
            <ActionButton
              testID="friend-page-change"
              kind="text"
              size="small"
              disabled={busy}
              label={t('friends.quick.change')}
              accessibilityLabel={t('friends.page.changeLabel')}
              onPress={() => onInvite(friend.playerId)}
            />
          </View>
        )}
        {recent.length > 0 ? (
          <View style={styles.section}>
            <SectionHeader
              title={t('friends.page.recentTitle')}
              action={{
                label: t('friends.page.history'),
                onPress: onHistory,
                testID: 'friend-page-history',
              }}
            />
            <CardFrame testID="friend-page-recent">
              {recent.map((game, i) => (
                <View key={game.gameId}>
                  {i > 0 ? <RowDivider /> : null}
                  <RecentRow game={game} locale={locale} onPress={() => onOpenGame(game.gameId)} />
                </View>
              ))}
            </CardFrame>
          </View>
        ) : null}
      </>
    );
  }

  const friend = state.kind === 'ready' ? state.data.friend : null;
  return (
    <Screen testID="friend-page-screen">
      <View style={styles.header}>
        <RoundButton
          testID="friend-page-back"
          icon="chevronLeft"
          accessibilityLabel={t('common.back')}
          onPress={onBack}
        />
        {friend !== null ? (
          <RoundButton
            testID="friend-page-more"
            icon="ellipsis"
            accessibilityLabel={t('friends.list.more', { name: nameOf(friend) })}
            onPress={() => setPanel('menu')}
          />
        ) : null}
      </View>
      <ScrollView style={friendsStyles.body} contentContainerStyle={friendsStyles.content}>
        {body}
      </ScrollView>
      <Sheet
        visible={panel !== null && friend !== null}
        onClose={closePanel}
        closeLabel={panel === 'report' ? t('safety.close') : t('common.cancel')}
        look={panel === 'menu' ? 'sheet' : 'dialog'}>
        {panel === 'menu' && friend !== null ? (
          <View testID="friend-page-menu" style={styles.menu}>
            {safety ? (
              <>
                <SheetRow
                  testID="friend-page-report"
                  icon="flag"
                  label={t('friends.list.report')}
                  accessibilityLabel={t('safety.actionLabel', { name: nameOf(friend) })}
                  disabled={busy}
                  problem
                  onPress={() => setPanel('report')}
                />
                <RowDivider />
              </>
            ) : null}
            <SheetRow
              testID="friend-page-remove"
              icon="userX"
              label={t('friends.sheet.remove')}
              accessibilityLabel={t('friends.sheet.removeLabel', { name: nameOf(friend) })}
              disabled={busy}
              onPress={() => setPanel('remove')}
            />
          </View>
        ) : null}
        {panel === 'remove' && friend !== null ? (
          <ConfirmDialog
            testID="friend-page-remove-dialog"
            title={t('friends.remove.title', { name: nameOf(friend) })}
            lines={[t('friends.remove.body')]}
            confirmLabel={t('friends.remove.confirm')}
            cancelLabel={t('common.cancel')}
            onConfirm={() => remove(friend)}
            onCancel={() => setPanel(null)}
          />
        ) : null}
        {panel === 'report' && friend !== null && safety ? (
          <ReportOrBlock
            player={{ id: friend.playerId, name: friend.name }}
            safety={safety}
            onClose={closePanel}
            onHold={setHeld}
          />
        ) : null}
      </Sheet>
      <Toast text={toast} testID="friend-page-sent" announced />
    </Screen>
  );
}

/** The name (the screen's heading), the rating and last match, and the record. */
function Heading({
  friend,
  name,
  rating,
  lastAt,
  locale,
}: {
  friend: Friend;
  name: string;
  rating: number | null;
  lastAt: number | null;
  locale: string;
}) {
  const { t } = useTranslation();
  const titleRef = useFocusOnShow();
  const { wins, losses } = friend.record;
  const played = wins + losses;
  const sub =
    lastAt === null
      ? rating === null
        ? t('friends.sheet.since', { date: formatDate(friend.since, locale) })
        : t('friends.page.rating', { rating })
      : rating === null
        ? t('friends.page.last', { date: formatDate(lastAt, locale) })
        : t('friends.page.ratingLast', { rating, date: formatDate(lastAt, locale) });
  const lead =
    wins > losses
      ? t('friends.page.lead')
      : losses > wins
        ? t('friends.page.behind')
        : t('friends.page.even');
  const matches = t('friends.page.matches', { count: played });
  return (
    <View style={styles.heading}>
      <Text ref={titleRef} accessibilityRole="header" style={styles.name}>
        {name}
      </Text>
      <Text testID="friend-page-sub" style={styles.sub}>
        {sub}
      </Text>
      {played === 0 ? null : (
        <View
          testID="friend-page-record"
          accessible
          accessibilityLabel={t('friends.page.recordLabel', { lead, wins, losses, matches })}
          style={styles.record}>
          <Text style={styles.recordScore}>
            {t('home.online.score', { me: wins, friend: losses })}
          </Text>
          <Text style={styles.sub}>{`${lead} · ${matches}`}</Text>
        </View>
      )}
    </View>
  );
}

/** A row that opens something: two lines and a chevron. */
function LinkRow({
  testID,
  label,
  title,
  titleAccent,
  line,
  onPress,
}: {
  testID: string;
  label: string;
  title: string;
  titleAccent: boolean;
  line: string;
  onPress: () => void;
}) {
  const { theme } = useUnistyles();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      <View style={styles.texts}>
        <Text style={[styles.rowTitle, titleAccent && styles.accent]}>{title}</Text>
        <Text style={styles.rowLine}>{line}</Text>
      </View>
      <Icon name="chevronRight" size={18} color={theme.colors.textDim} />
    </Pressable>
  );
}

/** A finished match: the game and length, the day, Won or Lost and the score. */
function RecentRow({
  game,
  locale,
  onPress,
}: {
  game: GameSummary;
  locale: string;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const { theme } = useUnistyles();
  const what = gameLine(game.choice, game.targetPoints, t);
  const date = formatDate(game.updatedAt, locale);
  const won = game.winner !== null && game.winner === game.mySide;
  const result =
    game.winner === null ? null : t(won ? 'history.result.won' : 'history.result.lost');
  const score = gameScore(game, t);
  const label = [what, date, result, score.spoken].filter(Boolean).join(', ');
  return (
    <Pressable
      testID={`friend-page-recent-${game.gameId}`}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      <View style={styles.texts}>
        <Text style={styles.rowTitle}>{what}</Text>
        <Text style={styles.rowLine}>{date}</Text>
      </View>
      {result === null ? null : (
        <Text style={[styles.result, won ? styles.accent : styles.dim]}>{result}</Text>
      )}
      <Text style={styles.score}>{score.text}</Text>
      <Icon name="chevronRight" size={18} color={theme.colors.textDim} />
    </Pressable>
  );
}

const styles = StyleSheet.create((theme) => ({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.space.lg,
    paddingTop: theme.space.sm,
    paddingBottom: theme.space.xs,
  },
  heading: {
    gap: theme.space.xs,
  },
  name: {
    ...theme.type.title1,
    color: theme.colors.text,
  },
  sub: {
    ...theme.type.footnote,
    color: theme.colors.textDim,
  },
  record: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'baseline',
    columnGap: theme.space.md,
    paddingTop: theme.space.sm,
  },
  recordScore: {
    ...theme.type.title2,
    fontFamily: fonts.numerals,
    color: theme.colors.accentLight,
  },
  section: {
    gap: theme.space.sm,
  },
  row: {
    minHeight: theme.touch.row,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.md,
    paddingHorizontal: theme.space.md,
    paddingVertical: theme.space.md,
  },
  pressed: {
    opacity: 0.7,
  },
  texts: {
    flex: 1,
    gap: theme.space.xxs,
  },
  rowTitle: {
    ...theme.type.bodyStrong,
    color: theme.colors.text,
  },
  rowLine: {
    ...theme.type.footnote,
    color: theme.colors.textDim,
  },
  accent: {
    color: theme.colors.accentLight,
  },
  dim: {
    color: theme.colors.textDim,
  },
  result: {
    ...theme.type.footnote,
    fontWeight: '600',
  },
  score: {
    ...theme.type.callout,
    fontFamily: fonts.numerals,
    color: theme.colors.text,
  },
  rematch: {
    alignItems: 'stretch',
    gap: theme.space.xs,
  },
  rematchNote: {
    ...theme.type.footnote,
    textAlign: 'center',
    color: theme.colors.textDim,
  },
  emptyCard: {
    ...surfaceStyle(theme, 'tray'),
    gap: theme.space.xs,
    paddingHorizontal: theme.space.lg,
    paddingVertical: theme.space.lg,
  },
  menu: {
    borderRadius: theme.radii.tray,
    overflow: 'hidden',
    backgroundColor: theme.colors.surfaceRaised,
  },
}));

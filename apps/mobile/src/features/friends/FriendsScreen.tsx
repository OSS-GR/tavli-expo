/**
 * Friends (#406), from Settings → Online: friend invites to you, friend
 * requests both ways, and your friends with your record against each. The
 * look is the Figma polish pass (#503, Screens → 03 Friends).
 *
 * - Friends need a saved account (ADR-0008). A guest reads that and gets
 *   a button to Settings → Account; nobody signed in reads that too. The
 *   screen makes no account.
 * - A friend row has one action, Invite (a game invite with a push, no
 *   code), and a "more" button that opens the friend sheet: Invite to a
 *   game, Remove friend (asks first) and Report or block. A block ends the
 *   friendship on the server, so the list loads again when it closes.
 * - The record reads in words ("You lead 5–3", `record.ts`); with no
 *   finished match there is no line.
 * - One `Sheet` holds the friend sheet, the Remove confirm, the quick
 *   invite and Report or block: one step replaces the other in place, so
 *   iOS never needs a second `Modal`.
 * - Invite (#488): with the last setup of a friend invite saved on the
 *   phone (`friendInviteSetup.ts`), a short confirm shows it ("Invite
 *   NAME?", the game and the length, the timer only when there is one):
 *   Send sends it at once and opens the waiting screen (`onInvited`),
 *   Change opens the full setup (`onInvite`), Cancel closes. With no saved
 *   setup, Invite opens the full setup. The confirm stays open while it
 *   sends. A send whose screen is gone leaves the invite open (the friend
 *   has the push already; it shows on Home).
 * - Leaderboards (#407) is a row under Add a friend, with your rating as a
 *   chip once you have a rated match (`ratings.mine()`, quietly: a failed
 *   call shows no chip).
 * - With no friend, request or invite, the screen is the empty state: the
 *   medallion, one sentence, Add a friend and a Leaderboards link.
 * - A request to you has Accept and Decline; one you sent has Cancel.
 * - One call at a time. A call that fails keeps the list and says so,
 *   also to screen readers (`useAnnouncement`). A call that finds the
 *   player signed out or a guest shows that instead of the list.
 * - Focus moves to the title. Large fonts scroll: no text has a line limit.
 *
 * Navigation stays in the route (`app/friends/index.tsx`).
 */
import type {
  AuthProvider,
  Friend,
  FriendRequests,
  Friends,
  InviteView,
  NewInvite,
  Ratings,
  Safety,
} from '@tavli/contracts';
import { fonts } from '@tavli/ui';
import { useLocales } from 'expo-localization';
import {
  Children,
  isValidElement,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { ActionButton } from '@/components/ActionButton';
import { CheckerAvatar } from '@/components/CheckerAvatar';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Dialog } from '@/components/Dialog';
import { EmptyMedallion } from '@/components/EmptyMedallion';
import { Icon } from '@/components/Icon';
import type { IconName } from '@/components/icons';
import { Screen } from '@/components/Screen';
import { ScreenHeader } from '@/components/ScreenHeader';
import { CardFrame, RowDivider } from '@/components/SectionCard';
import { SectionHeader } from '@/components/SectionHeader';
import { Sheet } from '@/components/Sheet';
import { surfaceStyle } from '@/components/Surface';
import { useFocusOnShow } from '@/features/accessibility/focus';
import { useAnnouncement } from '@/features/game/useAnnouncement';
import { dateLocale, formatDate } from '@/features/history/format';
import { loadFriendInviteSetup, saveFriendInviteSetup } from '@/features/invites/friendInviteSetup';
import { sendInviteCreated } from '@/features/invites/inviteAnalytics';
import { playerNameText } from '@/features/online/playerName';
import { ReportOrBlock, type SafetyPlayer } from '@/features/safety/ReportOrBlock';

import { friendsProblem, useFriendsData, type FriendsProblem } from './friendsData';
import { Footnote, friendsStyles, NotReady, RefreshFailed, useProblemText } from './FriendsParts';
import { recordText } from './record';

export interface FriendsScreenProps {
  /** Counts the times the screen shows (the route): each new one loads again. */
  visit?: number;
  auth: AuthProvider;
  friends: Friends;
  /** Report or block. `undefined`: the friend sheet has no such row. */
  safety?: Safety;
  /** Your rating for the Leaderboards row. `undefined`: no chip. */
  ratings?: Ratings;
  onBack: () => void;
  /** Opens Add a friend. */
  onAdd: () => void;
  /** Opens Leaderboards (#407). `undefined`: no row. */
  onRatings?: () => void;
  /** Opens the full game setup for a friend invite (no saved setup yet, or Change). */
  onInvite: (playerId: string) => void;
  /** Invite → Send made a friend invite (#488): opens its waiting screen. */
  onInvited: (code: string) => void;
  /** Opens a friend invite to you (the invite screen). */
  onOpenInvite: (code: string) => void;
  /** Opens Settings → Account (a guest saves the account there). */
  onAccount: () => void;
}

interface FriendsData {
  readonly friends: readonly Friend[];
  readonly requests: FriendRequests;
  readonly invites: readonly InviteView[];
}

/** What the one sheet shows. */
type Panel =
  | { readonly kind: 'friend'; readonly friend: Friend }
  | { readonly kind: 'remove'; readonly friend: Friend }
  | { readonly kind: 'quick'; readonly friend: Friend; readonly game: NewInvite }
  | { readonly kind: 'report'; readonly player: SafetyPlayer };

/** Names each problem for this app run, so the same problem twice is read twice. */
let problemCount = 0;

export function FriendsScreen({
  auth,
  friends,
  safety,
  ratings,
  onBack,
  onAdd,
  onRatings,
  onInvite,
  onInvited,
  onOpenInvite,
  onAccount,
  visit = 0,
}: FriendsScreenProps) {
  const { t, i18n } = useTranslation();
  const locale = dateLocale(i18n.resolvedLanguage ?? i18n.language, useLocales());
  const titleRef = useFocusOnShow();
  const load = useCallback(async (): Promise<FriendsData> => {
    const [list, requests, invites] = await Promise.all([
      friends.listFriends(),
      friends.listRequests(),
      friends.listFriendInvites(),
    ]);
    return { friends: list, requests, invites: invites.filter((i) => i.status === 'open') };
  }, [friends]);
  const { state, reload, retry, sessionLost } = useFriendsData(auth, load, visit);
  // The player whose call is on its way.
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<{ kind: FriendsProblem; n: number } | null>(null);
  const [panel, setPanel] = useState<Panel | null>(null);
  // The quick invite's send is on its way.
  const [sending, setSending] = useState(false);
  // Report or block holds the sheet open while it sends.
  const [held, setHeld] = useState(false);
  const rating = useMyRating(ratings, state.kind === 'ready', visit);
  // False once the screen is gone (the server answers later).
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const problemText = useProblemText(problem?.kind ?? null);
  useAnnouncement(problemText, problem === null ? undefined : `friends-problem:${problem.n}`);

  const nameOf = (name: Friend['name']) => playerNameText(name, t) ?? t('friends.unnamed');

  const run = (playerId: string, call: () => Promise<unknown>) => {
    if (busy !== null) return;
    setBusy(playerId);
    setProblem(null);
    call().then(
      () => {
        setBusy(null);
        reload();
      },
      (error: unknown) => {
        setBusy(null);
        // Signed out or a guest: the screen says so, as after a load.
        if (sessionLost(error)) return;
        problemCount += 1;
        setProblem({ kind: friendsProblem(error), n: problemCount });
        reload();
      },
    );
  };

  /** Invite: the confirm with the last setup, or the full setup when there is none. */
  const invite = (friend: Friend) => {
    const game = loadFriendInviteSetup();
    if (game === null) {
      setPanel(null);
      onInvite(friend.playerId);
    } else setPanel({ kind: 'quick', friend, game });
  };

  const send = () => {
    if (panel?.kind !== 'quick' || sending) return;
    const { friend, game } = panel;
    setSending(true);
    setProblem(null);
    friends.inviteFriend(friend.playerId, game).then(
      (code) => {
        saveFriendInviteSetup(game);
        sendInviteCreated(game);
        if (!mounted.current) return;
        setSending(false);
        setPanel(null);
        onInvited(code);
      },
      (error: unknown) => {
        if (!mounted.current) return;
        setSending(false);
        setPanel(null);
        // Signed out or a guest: the screen says so, as after a load.
        if (sessionLost(error)) return;
        problemCount += 1;
        setProblem({ kind: friendsProblem(error), n: problemCount });
        reload();
      },
    );
  };

  const closeReport = () => {
    setPanel(null);
    setHeld(false);
    // A block ends the friendship: load the list again.
    reload();
  };

  const closePanel = () => {
    // The quick invite stays open while it sends; so does Report or block.
    if (sending || held) return;
    if (panel?.kind === 'report') closeReport();
    else setPanel(null);
  };

  const lines = (
    <>
      {state.kind === 'ready' && state.refreshFailed === true ? (
        <RefreshFailed onRetry={reload} testID="friends" />
      ) : null}
      {problemText !== null ? (
        <Text testID="friends-problem" style={friendsStyles.line}>
          {problemText}
        </Text>
      ) : null}
    </>
  );

  let body: ReactNode;
  if (state.kind !== 'ready') {
    body = <NotReady state={state} onRetry={retry} onAccount={onAccount} testID="friends" />;
  } else {
    const { invites, requests, friends: list } = state.data;
    const nothing =
      list.length === 0 &&
      invites.length === 0 &&
      requests.incoming.length === 0 &&
      requests.outgoing.length === 0;
    body = nothing ? (
      <>
        {lines}
        <EmptyFriends onAdd={onAdd} onRatings={onRatings} />
      </>
    ) : (
      <>
        <ActionButton
          testID="friends-add"
          icon="userPlus"
          label={t('friends.addButton')}
          onPress={onAdd}
        />
        {onRatings ? <RatingsRow rating={rating} onPress={onRatings} /> : null}
        {lines}
        {invites.length > 0 ? (
          <Section title={t('friends.invites.title')} testID="friends-invites">
            {invites.map((invite) => {
              const name = nameOf(invite.fromName);
              return (
                <PersonRow
                  key={invite.code}
                  testID={`friend-invite-${invite.code}`}
                  playerKey={invite.from}
                  name={name}
                  title={t('friends.invites.from', { name })}
                  hint={t('friends.invites.game', {
                    game: t(`games.${invite.choice}`),
                    count: invite.targetPoints,
                  })}>
                  <ActionButton
                    testID={`friend-invite-${invite.code}-open`}
                    size="small"
                    label={t('friends.invites.open')}
                    onPress={() => onOpenInvite(invite.code)}
                  />
                </PersonRow>
              );
            })}
          </Section>
        ) : null}
        {requests.incoming.length > 0 ? (
          <Section title={t('friends.incoming.title')} testID="friends-incoming">
            {requests.incoming.map((request) => {
              const name = nameOf(request.name);
              return (
                <PersonRow
                  key={request.playerId}
                  testID={`friend-incoming-${request.playerId}`}
                  playerKey={request.playerId}
                  name={name}
                  hint={t('friends.incoming.sent', { date: formatDate(request.sentAt, locale) })}
                  below>
                  <ActionButton
                    testID={`friend-incoming-${request.playerId}-accept`}
                    size="small"
                    disabled={busy !== null}
                    label={t('friends.incoming.accept')}
                    accessibilityLabel={t('friends.incoming.acceptLabel', { name })}
                    onPress={() =>
                      run(request.playerId, () => friends.acceptRequest(request.playerId))
                    }
                  />
                  <ActionButton
                    testID={`friend-incoming-${request.playerId}-decline`}
                    kind="secondary"
                    size="small"
                    disabled={busy !== null}
                    label={t('friends.incoming.decline')}
                    accessibilityLabel={t('friends.incoming.declineLabel', { name })}
                    onPress={() =>
                      run(request.playerId, () => friends.declineRequest(request.playerId))
                    }
                  />
                </PersonRow>
              );
            })}
          </Section>
        ) : null}
        <Section title={t('friends.list.title')} count={list.length} testID="friends-list">
          {list.length === 0 ? (
            <View style={friendsStyles.row}>
              <Text testID="friends-empty" style={friendsStyles.line}>
                {t('friends.list.empty')}
              </Text>
            </View>
          ) : (
            list.map((friend) => {
              const name = nameOf(friend.name);
              return (
                <PersonRow
                  key={friend.playerId}
                  testID={`friend-${friend.playerId}`}
                  playerKey={friend.playerId}
                  name={name}
                  hint={recordText(friend.record, t)}>
                  <ActionButton
                    testID={`friend-${friend.playerId}-invite`}
                    kind="secondary"
                    size="small"
                    icon="send"
                    disabled={busy !== null}
                    label={t('friends.list.invite')}
                    accessibilityLabel={t('friends.list.inviteLabel', { name })}
                    onPress={() => invite(friend)}
                  />
                  <MoreButton
                    testID={`friend-${friend.playerId}-more`}
                    label={t('friends.list.more', { name })}
                    onPress={() => setPanel({ kind: 'friend', friend })}
                  />
                </PersonRow>
              );
            })
          )}
        </Section>
        {requests.outgoing.length > 0 ? (
          <Section title={t('friends.outgoing.title')} testID="friends-outgoing">
            {requests.outgoing.map((request) => {
              const name = nameOf(request.name);
              return (
                <PersonRow
                  key={request.playerId}
                  testID={`friend-outgoing-${request.playerId}`}
                  playerKey={request.playerId}
                  name={name}
                  hint={t('friends.outgoing.sent', { date: formatDate(request.sentAt, locale) })}>
                  <ActionButton
                    testID={`friend-outgoing-${request.playerId}-cancel`}
                    kind="secondary"
                    size="small"
                    disabled={busy !== null}
                    label={t('friends.outgoing.cancel')}
                    accessibilityLabel={t('friends.outgoing.cancelLabel', { name })}
                    onPress={() =>
                      run(request.playerId, () => friends.cancelRequest(request.playerId))
                    }
                  />
                </PersonRow>
              );
            })}
          </Section>
        ) : null}
        <Footnote icon="info" text={t('friends.note')} />
      </>
    );
  }

  return (
    <Screen testID="friends-screen">
      <ScreenHeader
        title={t('friends.title')}
        titleRef={titleRef}
        onBack={onBack}
        backLabel={t('common.back')}
        testID="friends-back"
      />
      <ScrollView style={friendsStyles.body} contentContainerStyle={friendsStyles.content}>
        {body}
      </ScrollView>
      <Sheet
        visible={panel !== null}
        onClose={closePanel}
        closeLabel={t('common.cancel')}
        look={panel?.kind === 'friend' ? 'sheet' : 'dialog'}>
        {panel?.kind === 'friend' ? (
          <FriendSheet
            friend={panel.friend}
            name={nameOf(panel.friend.name)}
            since={formatDate(panel.friend.since, locale)}
            busy={busy !== null}
            canReport={safety !== undefined}
            onInvite={() => invite(panel.friend)}
            onRemove={() => setPanel({ kind: 'remove', friend: panel.friend })}
            onReport={() =>
              setPanel({
                kind: 'report',
                player: { id: panel.friend.playerId, name: panel.friend.name },
              })
            }
          />
        ) : null}
        {panel?.kind === 'remove' ? (
          <ConfirmDialog
            testID="friend-remove-dialog"
            title={t('friends.remove.title', { name: nameOf(panel.friend.name) })}
            lines={[t('friends.remove.body')]}
            confirmLabel={t('friends.remove.confirm')}
            cancelLabel={t('common.cancel')}
            onConfirm={() => {
              const { friend } = panel;
              setPanel(null);
              run(friend.playerId, () => friends.removeFriend(friend.playerId));
            }}
            onCancel={() => setPanel(null)}
          />
        ) : null}
        {panel?.kind === 'quick' ? (
          <QuickInvite
            name={nameOf(panel.friend.name)}
            game={panel.game}
            sending={sending}
            onSend={send}
            onChange={() => {
              setPanel(null);
              onInvite(panel.friend.playerId);
            }}
            onCancel={() => setPanel(null)}
          />
        ) : null}
        {panel?.kind === 'report' && safety ? (
          <ReportOrBlock
            player={panel.player}
            safety={safety}
            onClose={closeReport}
            onHold={setHeld}
          />
        ) : null}
      </Sheet>
    </Screen>
  );
}

/**
 * Your rating for the Leaderboards row, once you have a rated match. It
 * asks again on each visit; a failed call shows no chip.
 */
function useMyRating(ratings: Ratings | undefined, ready: boolean, visit: number): number | null {
  const [rating, setRating] = useState<number | null>(null);
  useEffect(() => {
    if (ratings === undefined || !ready) return;
    let live = true;
    ratings.mine().then(
      (mine) => {
        if (live) setRating(mine.matches > 0 ? mine.rating : null);
      },
      () => {},
    );
    return () => {
      live = false;
    };
  }, [ratings, ready, visit]);
  return rating;
}

/** A section: its header (with an optional count), then one tray of rows. */
function Section({
  title,
  count,
  testID,
  children,
}: {
  title: string;
  count?: number;
  testID: string;
  children: ReactNode;
}) {
  // `toArray` keeps each row's key.
  const rows = Children.toArray(children);
  return (
    <View style={styles.section}>
      <SectionHeader title={title} {...(count === undefined ? {} : { count })} />
      <CardFrame testID={testID}>
        {rows.map((row, i) => (
          <View key={isValidElement(row) ? row.key : i}>
            {i > 0 ? <RowDivider /> : null}
            {row}
          </View>
        ))}
      </CardFrame>
    </View>
  );
}

interface PersonRowProps {
  testID: string;
  playerKey: string;
  name: string;
  /** The first line. Default: the name. */
  title?: string;
  /** The second line, or none. */
  hint?: string | null;
  /** Buttons on the right, or under the texts with `below`. */
  children: ReactNode;
  /** Puts the buttons under the texts (two buttons that need the room). */
  below?: boolean;
}

/** One player in a list: a checker avatar, the name, a line, and the row's buttons. */
function PersonRow({ testID, playerKey, name, title, hint, children, below }: PersonRowProps) {
  const head = (
    <View style={styles.person}>
      <CheckerAvatar playerKey={playerKey} name={name} />
      <View style={styles.texts}>
        <Text style={styles.name}>{title ?? name}</Text>
        {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      </View>
      {below ? null : <View style={styles.trail}>{children}</View>}
    </View>
  );
  return (
    <View testID={testID} style={styles.personRow}>
      {head}
      {below ? <View style={styles.below}>{children}</View> : null}
    </View>
  );
}

/** The "…" button of a friend row: it opens the friend sheet. */
function MoreButton({
  testID,
  label,
  onPress,
}: {
  testID: string;
  label: string;
  onPress: () => void;
}) {
  const { theme } = useUnistyles();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.more, pressed && styles.pressed]}>
      <Icon name="ellipsis" size={20} color={theme.colors.textDim} />
    </Pressable>
  );
}

/** Leaderboards as a row (#503): your rating as a chip once you have one. */
function RatingsRow({ rating, onPress }: { rating: number | null; onPress: () => void }) {
  const { t } = useTranslation();
  const { theme } = useUnistyles();
  const label = t('friends.ratingsButton');
  return (
    <Pressable
      testID="friends-ratings"
      accessibilityRole="button"
      accessibilityLabel={rating === null ? label : t('friends.ratingsLabel', { rating })}
      accessibilityHint={t('friends.ratingsHint')}
      onPress={onPress}
      style={({ pressed }) => [styles.ratings, pressed && styles.pressed]}>
      <Icon name="trophy" size={22} color={theme.colors.accent} />
      <View style={styles.texts}>
        <Text style={styles.name}>{label}</Text>
        <Text style={styles.hint}>{t('friends.ratingsHint')}</Text>
      </View>
      {rating === null ? null : (
        <View testID="friends-rating-chip" style={styles.chip}>
          <Text style={styles.chipText}>{rating}</Text>
        </View>
      )}
      <Icon name="chevronRight" size={18} color={theme.colors.textDim} />
    </Pressable>
  );
}

/** The screen with no friend, request or invite (#503): one medallion, one sentence, one action. */
function EmptyFriends({ onAdd, onRatings }: { onAdd: () => void; onRatings?: () => void }) {
  const { t } = useTranslation();
  return (
    <View style={styles.empty}>
      <EmptyMedallion icon="handshake" testID="friends-medallion" />
      <View style={styles.emptyTexts}>
        <Text testID="friends-empty" style={styles.emptyTitle}>
          {t('friends.empty.title')}
        </Text>
        <Text style={styles.emptyBody}>{t('friends.empty.body')}</Text>
      </View>
      <View style={styles.emptyButtons}>
        <ActionButton
          testID="friends-add"
          icon="userPlus"
          label={t('friends.addButton')}
          onPress={onAdd}
        />
        {onRatings ? (
          <ActionButton
            testID="friends-ratings"
            kind="text"
            icon="trophy"
            label={t('friends.ratingsButton')}
            onPress={onRatings}
          />
        ) : null}
      </View>
    </View>
  );
}

interface FriendSheetProps {
  friend: Friend;
  name: string;
  since: string;
  busy: boolean;
  canReport: boolean;
  onInvite: () => void;
  onRemove: () => void;
  onReport: () => void;
}

/** The friend sheet (#503): who, since when and the record, then the actions. Focus moves to the name. */
function FriendSheet({
  friend,
  name,
  since,
  busy,
  canReport,
  onInvite,
  onRemove,
  onReport,
}: FriendSheetProps) {
  const { t } = useTranslation();
  const titleRef = useFocusOnShow();
  const record = recordText(friend.record, t);
  const line = [t('friends.sheet.since', { date: since }), record].filter(Boolean).join(' · ');
  return (
    <View testID="friend-sheet" style={styles.sheet}>
      <View style={styles.person}>
        <CheckerAvatar playerKey={friend.playerId} name={name} size={56} />
        <View style={styles.texts}>
          <Text ref={titleRef} accessibilityRole="header" style={styles.sheetTitle}>
            {name}
          </Text>
          <Text style={styles.hint}>{line}</Text>
        </View>
      </View>
      <ActionButton
        testID="friend-sheet-invite"
        icon="send"
        disabled={busy}
        label={t('friends.sheet.invite')}
        accessibilityLabel={t('friends.list.inviteLabel', { name })}
        onPress={onInvite}
      />
      <View style={styles.sheetCard}>
        <SheetRow
          testID="friend-sheet-remove"
          icon="userX"
          label={t('friends.sheet.remove')}
          accessibilityLabel={t('friends.sheet.removeLabel', { name })}
          disabled={busy}
          onPress={onRemove}
        />
        {canReport ? (
          <>
            <RowDivider />
            <SheetRow
              testID="friend-sheet-report"
              icon="flag"
              label={t('friends.list.report')}
              accessibilityLabel={t('safety.actionLabel', { name })}
              disabled={busy}
              problem
              onPress={onReport}
            />
          </>
        ) : null}
      </View>
    </View>
  );
}

interface SheetRowProps {
  testID: string;
  icon: IconName;
  label: string;
  accessibilityLabel: string;
  disabled: boolean;
  /** Coral, for Report or block. */
  problem?: boolean;
  onPress: () => void;
}

function SheetRow({
  testID,
  icon,
  label,
  accessibilityLabel,
  disabled,
  problem = false,
  onPress,
}: SheetRowProps) {
  const { theme } = useUnistyles();
  const color = disabled
    ? theme.colors.textDisabled
    : problem
      ? theme.colors.problem
      : theme.colors.text;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.sheetRow, pressed && styles.pressed]}>
      <Icon name={icon} size={20} color={problem && !disabled ? color : theme.colors.accent} />
      <Text style={[styles.sheetRowText, { color }]}>{label}</Text>
    </Pressable>
  );
}

interface QuickInviteProps {
  name: string;
  game: NewInvite;
  sending: boolean;
  onSend: () => void;
  onChange: () => void;
  onCancel: () => void;
}

/**
 * The short confirm of Invite (#488): the friend, the game and the length,
 * and the turn time limit only when there is one (the 24-hour default
 * says nothing). Focus moves to the title.
 */
function QuickInvite({ name, game, sending, onSend, onChange, onCancel }: QuickInviteProps) {
  const { t } = useTranslation();
  const titleRef = useFocusOnShow();
  const lines = [
    t('friends.quick.game', { game: t(`games.${game.choice}`), count: game.targetPoints }),
    ...(game.turnTimeMinutes === null
      ? []
      : [t('friend.timeLimitHint', { count: game.turnTimeMinutes })]),
    t('friends.quick.note'),
  ];
  return (
    <Dialog
      testID="friend-quick-dialog"
      title={t('friends.quick.title', { name })}
      lines={lines}
      titleRef={titleRef}>
      <ActionButton
        testID="friend-quick-send"
        label={sending ? t('friends.quick.sending') : t('friends.quick.send')}
        disabled={sending}
        onPress={onSend}
      />
      <ActionButton
        testID="friend-quick-change"
        kind="secondary"
        label={t('friends.quick.change')}
        disabled={sending}
        onPress={onChange}
      />
      <ActionButton
        testID="friend-quick-cancel"
        kind="text"
        label={t('common.cancel')}
        disabled={sending}
        onPress={onCancel}
      />
    </Dialog>
  );
}

const styles = StyleSheet.create((theme) => ({
  section: {
    gap: theme.space.sm,
  },
  personRow: {
    gap: theme.space.sm,
    paddingHorizontal: theme.space.md,
    paddingVertical: theme.space.md,
  },
  person: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.md,
  },
  texts: {
    flex: 1,
    gap: theme.space.xxs,
  },
  name: {
    ...theme.type.bodyStrong,
    color: theme.colors.text,
  },
  hint: {
    ...theme.type.footnote,
    color: theme.colors.textDim,
  },
  trail: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.xs,
  },
  below: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.space.sm,
    // Under the texts, past the 40 pt avatar.
    paddingLeft: 40 + theme.space.md,
  },
  more: {
    width: theme.touch.minTarget,
    height: theme.touch.minTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.7,
  },
  ratings: {
    ...surfaceStyle(theme, 'tray'),
    minHeight: theme.touch.row,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.md,
    paddingHorizontal: theme.space.lg,
    paddingVertical: theme.space.md,
  },
  chip: {
    paddingHorizontal: theme.space.md,
    paddingVertical: theme.space.xxs,
    borderRadius: theme.radii.pill,
    borderWidth: 1,
    borderColor: theme.colors.accentLine,
    backgroundColor: theme.colors.accentWash,
  },
  chipText: {
    ...theme.type.callout,
    fontFamily: fonts.numerals,
    color: theme.colors.accentLight,
  },
  empty: {
    alignItems: 'stretch',
    gap: theme.space.xl,
    paddingTop: theme.space.xxxl,
  },
  emptyTexts: {
    gap: theme.space.sm,
  },
  emptyTitle: {
    ...theme.type.title2,
    textAlign: 'center',
    color: theme.colors.text,
  },
  emptyBody: {
    ...theme.type.callout,
    textAlign: 'center',
    color: theme.colors.textDim,
  },
  emptyButtons: {
    gap: theme.space.md,
  },
  sheet: {
    gap: theme.space.lg,
  },
  sheetTitle: {
    ...theme.type.title3,
    color: theme.colors.text,
  },
  sheetCard: {
    borderRadius: theme.radii.tray,
    overflow: 'hidden',
    backgroundColor: theme.colors.surfaceRaised,
  },
  sheetRow: {
    minHeight: theme.touch.row,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.md,
    paddingHorizontal: theme.space.lg,
    paddingVertical: theme.space.md,
  },
  sheetRowText: {
    ...theme.type.bodyStrong,
    flex: 1,
  },
}));

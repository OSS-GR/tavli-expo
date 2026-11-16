/**
 * Play a friend online (#281): pick the game, the match length and a turn
 * time limit, then "Make an invite link". The route then opens the waiting
 * screen (`InviteWaitScreen`) with the code.
 *
 * - An online game needs an account on our server. A phone that never
 *   signed in (`hasOnlineAccount`) says so in one sentence. "Make an
 *   invite link" uses the saved session when there is one; else it
 *   opens the sign-in sheet (#401, `SignInSheet`: Apple, Continue as a
 *   guest, Not now), and makes the invite right after the sign-in. Not
 *   now closes the sheet, makes nothing and starts the reminders on Home
 *   (#404).
 * - It talks to the server only through the `Invites` port.
 * - A new invite sends `invite_created` (no code, no ids).
 * - Back while the invite is being made: the screen makes no invite, or
 *   cancels the one the server just made, so no invite is left open that
 *   nobody waits for (it would count toward `MAX_OPEN_INVITES`).
 * - A problem line is read to screen readers, each time it shows (iOS
 *   VoiceOver does not read `accessibilityRole="alert"`).
 * - Screen readers: focus moves to the title when the screen opens.
 * - Large fonts scroll: no text has a line limit.
 * - Look (#516, the Figma pass, node `17:17`): it fits one 874 pt screen
 *   with no scroll. The Who row, then the game list (`GameChoiceList`),
 *   Match length and Time limit as one-line rows (`SettingLine`, the
 *   `tray` look of `SegmentedControl`) and one summary line. No intro and
 *   no info card. The button stays at the bottom while the list fades out
 *   under it; it scrolls only with large text.
 *
 * - Friend invite (#406, `friend`): the same setup, but the invite goes
 *   to one friend (`Friends.inviteFriend`), who gets a push. The title,
 *   one plain intro sentence and the button ("Send the invite") say so.
 *   It needs a saved account, so it checks the account when it opens
 *   (and on each new `visit`, after Settings → Account) and again on
 *   Make an invite. Only the newest check counts. With no note of an
 *   online account on this phone (`hasOnlineAccount`) the open check
 *   asks no server: nobody is signed in. A failed check shows Make an
 *   invite, so the player can try again. A guest gets "Friends need a
 *   saved account…" and **Save my account**, nobody signed in "You are
 *   not signed in…" and **Open Account** (`onAccount`), in place of
 *   Make an invite; neither gets the sign-in sheet. `NOT_SAVED` from the
 *   server counts as a guest.
 *   It starts from the last setup of a friend invite (`friendInviteSetup.ts`,
 *   #488), and each friend invite the server makes saves its setup.
 *
 * - Your friends (#488, `friends`): a phone with a note of an online
 *   account (`hasOnlineAccount`) loads the saved account's friends when
 *   the screen opens. With friends, the Who row (`WhoRow`, #516) sits at
 *   the top: "Anyone" (it makes the open link, like the button), up to
 *   `FRIENDS_SHOWN` friends as checkers (`pickFriends`), and Add
 *   (`onAddFriend`); "All friends" opens Friends. A tap on a friend sends a friend invite at once
 *   with the picks on the screen (the owner's call: the picks are right
 *   above). The friend gets a push and needs no link, so the screen stays
 *   and says "Invite sent to NAME" (#507, `onFriendInvited`); no waiting
 *   screen opens. That friend's tile turns off for the visit, so a second
 *   tap sends no second invite. A guest, nobody signed in, no
 *   friends or a failed load: no list, and the screen is as before. The
 *   list never makes an account and never opens the sign-in sheet. A tap
 *   that finds the account gone drops the list and says so; a friend who
 *   is gone (`NOT_FRIENDS`, a block) says so and loads the list again.
 *
 * Navigation stays in the route (`app/friend/index.tsx`, and
 * `app/friends/invite/[id].tsx` for a friend invite).
 */
import {
  isFriendsErrorData,
  isInviteErrorData,
  ONLINE_GAME_CHOICES,
  type Analytics,
  type AppleSheet,
  type AuthProvider,
  type AuthUser,
  type Friend,
  type Friends,
  type Invites,
  type NewInvite,
  type OnlineGameChoice,
} from '@tavli/contracts';
import { MAX_OPEN_INVITES } from '@tavli/online';
import { withAlpha } from '@tavli/ui';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AccessibilityInfo, ScrollView, Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { ActionButton } from '@/components/ActionButton';
import { Icon } from '@/components/Icon';
import { Screen } from '@/components/Screen';
import { ScreenHeader } from '@/components/ScreenHeader';
import { SectionHeader } from '@/components/SectionHeader';
import { SegmentedControl, type SegmentOption } from '@/components/settings/SegmentedControl';
import { useFocusOnShow } from '@/features/accessibility/focus';
import { friendsProblem, type FriendsProblem } from '@/features/friends/friendsData';
import { pickFriends } from '@/features/friends/pickFriends';
import { MATCH_LENGTHS, type MatchLength } from '@/features/match/setup';
import { onlineAccountReady } from '@/features/online/account';
import { hasOnlineAccount } from '@/features/online/accountHint';
import { SignInSheet } from '@/features/online/SignInSheet';
import { formatTimeLimit } from '@/features/online/clock';
import { playerNameText } from '@/features/online/playerName';
import { reminders } from '@/features/reminders/reminders';

import {
  loadFriendInviteSetup,
  saveFriendInviteSetup,
  TURN_TIME_LIMITS,
} from './friendInviteSetup';
import { GameChoiceList, SettingLine, WhoRow } from './FriendSetupParts';
import { sendInviteCreated } from './inviteAnalytics';

export interface FriendSetupScreenProps {
  auth: AuthProvider;
  invites: Invites;
  /**
   * Make an invite made one: a code invite opens its waiting screen; a
   * friend invite (`friend`) goes back to Friends (#507). A tap on the
   * friends list calls `onFriendInvited` instead.
   */
  onCreated: (code: string) => void;
  /**
   * A friend from the list got an invite (#507): the screen stays and says
   * so. The route offers turn notifications.
   */
  onFriendInvited?: (code: string) => void;
  onBack: () => void;
  /** For tests. Default: the app's analytics. */
  analytics?: Analytics;
  /** For tests. Default: the app's. */
  appleSheet?: AppleSheet;
  /**
   * A friend invite (#406): makes the invite for one friend instead of
   * `invites.createInvite`. It resolves with the code.
   */
  friend?: { readonly invite: (game: NewInvite) => Promise<string> };
  /** A friend invite with no saved account: opens Settings → Account. */
  onAccount?: () => void;
  /** Counts the times the screen shows (the route): a friend invite checks the account again. */
  visit?: number;
  /**
   * Play a friend (#488): the friends port. A saved account with friends
   * sees a short list; a tap sends a friend invite with the picks.
   * Not used with `friend`.
   */
  friends?: Friends;
  /** Opens the Friends screen ("All friends" over the Who row). */
  onFriends?: () => void;
  /** Opens Add a friend (the Add tile of the Who row). */
  onAddFriend?: () => void;
}

/** Why a friend invite cannot be made from this account. */
type NotSaved = 'guest' | 'signedOut';

/** Why "Make an invite" (or a tap on a friend) did not work. */
type Problem =
  | { readonly kind: 'account' | 'make' | 'tooMany' }
  | { readonly kind: 'friends'; readonly problem: FriendsProblem };

/** The friends Play a friend shows (#488): up to `FRIENDS_SHOWN`. */
type FriendList = readonly Friend[];

export function FriendSetupScreen({
  auth,
  invites,
  onCreated,
  onBack,
  analytics,
  appleSheet,
  friend,
  onAccount,
  visit = 0,
  friends,
  onFriends,
  onAddFriend,
  onFriendInvited,
}: FriendSetupScreenProps) {
  const { t } = useTranslation();
  const { theme } = useUnistyles();
  // A friend invite starts from the last one's setup (#488).
  const [initial] = useState(() => (friend === undefined ? null : loadFriendInviteSetup()));
  const [choice, setChoice] = useState<OnlineGameChoice>(initial?.choice ?? 'portes');
  const [targetPoints, setTargetPoints] = useState<MatchLength>(
    (initial?.targetPoints ?? 1) as MatchLength,
  );
  const [turnTimeMinutes, setTurnTimeMinutes] = useState<number | null>(
    initial?.turnTimeMinutes ?? null,
  );
  const [busy, setBusy] = useState(false);
  // One invite per tap: a second tap before the render sees `busy` does nothing.
  const making = useRef(false);
  // A new object for each failure, so the same problem twice is read twice.
  const [problem, setProblem] = useState<Problem | null>(null);
  // The friend from the list who just got an invite (#507). A new object
  // for each send, so a second send is read again.
  const [sent, setSent] = useState<{ readonly name: string } | null>(null);
  // Friends from the list who got an invite on this visit: their rows turn
  // off, so a second tap sends no second invite.
  const [invited, setInvited] = useState<ReadonlySet<string>>(() => new Set());
  // No saved session: the sign-in sheet is open.
  const [signingIn, setSigningIn] = useState(false);
  const titleRef = useFocusOnShow();
  // A friend invite and an account that cannot make one.
  const [notSaved, setNotSaved] = useState<NotSaved | null>(null);
  // Each account check (on show and on Make an invite) gets a number: only
  // the newest one may set `notSaved`, so a slow older answer is dropped.
  const checks = useRef(0);
  const forFriend = friend !== undefined;
  useEffect(() => {
    if (!forFriend) return;
    checks.current += 1;
    const check = checks.current;
    let live = true;
    const settle = (next: NotSaved | null) => {
      if (live && check === checks.current) setNotSaved(next);
    };
    // No note of an account on this phone: nobody is signed in. Loading
    // the session would ask the server (#297), so do not.
    const answer = hasOnlineAccount() ? auth.ready() : Promise.resolve(null);
    answer.then(
      (user) => settle(user === null ? 'signedOut' : user.isGuest ? 'guest' : null),
      // A failed check (offline) shows Make an invite, which checks again.
      () => settle(null),
    );
    return () => {
      live = false;
    };
  }, [auth, forFriend, visit]);
  // Play a friend (#488): your friends, for a saved account. A new
  // `listLoads` loads the list again (after a friend is gone).
  const listFrom = friend === undefined ? friends : undefined;
  const [friendList, setFriendList] = useState<FriendList | null>(null);
  const [listLoads, setListLoads] = useState(0);
  useEffect(() => {
    // No note of an account on this phone: nobody is signed in, and
    // loading the session would ask the server (#297).
    if (listFrom === undefined || !hasOnlineAccount()) return;
    let live = true;
    auth
      .ready()
      .then((user) => (user === null || user.isGuest ? null : listFrom.listFriends()))
      .then(
        (list) => {
          if (!live) return;
          setFriendList(list === null ? null : pickFriends(list));
        },
        // A failed load shows no list: Make an invite still works.
        () => {
          if (live) setFriendList(null);
        },
      );
    return () => {
      live = false;
    };
  }, [auth, listFrom, listLoads]);
  // False once the screen is gone (the server answers later).
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  /**
   * `signedIn`: the sheet just signed in (and noted the account already).
   * `to`: a friend from the list (#488) gets a friend invite.
   */
  const make = async ({ signedIn = false, to }: { signedIn?: boolean; to?: Friend } = {}) => {
    if (making.current) return;
    making.current = true;
    setBusy(true);
    setProblem(null);
    setSent(null);
    const game: NewInvite = { choice, targetPoints, turnTimeMinutes };
    const target =
      to !== undefined && listFrom !== undefined
        ? { invite: (g: NewInvite) => listFrom.inviteFriend(to.playerId, g) }
        : friend;
    const failed = (next: Problem) => {
      making.current = false;
      if (!mounted.current) return;
      setBusy(false);
      setProblem(next);
    };
    /** A tap on a friend found no saved account: the list goes, and the screen says why. */
    const listGone = (why: FriendsProblem) => {
      if (mounted.current) setFriendList(null);
      failed({ kind: 'friends', problem: why });
    };
    checks.current += 1;
    const check = checks.current;
    const refused = (why: NotSaved) => {
      making.current = false;
      if (!mounted.current) return;
      setBusy(false);
      // A newer check (the player came back from Account) knows better.
      if (check === checks.current) setNotSaved(why);
    };
    let user: AuthUser | null;
    try {
      user = await auth.ready();
    } catch {
      failed({ kind: 'account' });
      return;
    }
    // Gone (Back) before the account was ready: make no invite.
    if (!mounted.current) return;
    if (to !== undefined && (user === null || user.isGuest)) {
      // The account changed since the list loaded: no sign-in sheet here.
      listGone(user === null ? 'signedOut' : 'notSaved');
      return;
    }
    if (friend !== undefined && (user === null || user.isGuest)) {
      // A friend invite needs a saved account (ADR-0008): no sign-in sheet,
      // since a guest made there could not invite a friend either.
      refused(user === null ? 'signedOut' : 'guest');
      return;
    }
    if (user === null) {
      // Nobody signed in: the sheet asks how. Its sign-in calls `make` again.
      making.current = false;
      setBusy(false);
      setSigningIn(true);
      return;
    }
    if (!signedIn) onlineAccountReady();
    let code: string;
    try {
      code = await (target === undefined ? invites.createInvite(game) : target.invite(game));
    } catch (error) {
      const tooMany =
        (isInviteErrorData(error) || isFriendsErrorData(error)) &&
        error.code === 'TOO_MANY_INVITES';
      if (isFriendsErrorData(error) && error.code === 'NOT_SAVED') {
        if (to !== undefined) listGone('notSaved');
        else refused('guest');
        return;
      }
      if (tooMany) {
        failed({ kind: 'tooMany' });
        return;
      }
      if (to !== undefined && isFriendsErrorData(error)) {
        // Not friends any more, a block, no session: say so, and load the
        // list again.
        setListLoads((n) => n + 1);
        failed({ kind: 'friends', problem: friendsProblem(error) });
        return;
      }
      failed({ kind: 'make' });
      return;
    }
    if (!mounted.current) {
      // Nobody will wait for it: take it back. A failed cancel only leaves
      // it to expire.
      invites.cancelInvite(code).catch(() => {});
      return;
    }
    // The next friend invite starts from this setup (#488).
    if (target !== undefined) saveFriendInviteSetup(game);
    sendInviteCreated(game, analytics);
    if (to !== undefined) {
      // A friend from the list gets a push and needs no link (#507): stay.
      making.current = false;
      setBusy(false);
      setSent({ name: playerNameText(to.name, t) ?? t('friends.unnamed') });
      setInvited((old) => new Set(old).add(to.playerId));
      onFriendInvited?.(code);
      return;
    }
    // The buttons stay off while the route opens the waiting screen.
    onCreated(code);
  };

  const lengthOptions: SegmentOption<`${MatchLength}`>[] = MATCH_LENGTHS.map((n) => ({
    value: `${n}`,
    label: String(n),
  }));
  const timeLimitOptions: SegmentOption<string>[] = TURN_TIME_LIMITS.map((value) => ({
    value: `${value}`,
    label: formatTimeLimit(value, t),
  }));
  const timeLimitHint =
    turnTimeMinutes === null
      ? t('friend.timeLimitHint_none')
      : t('friend.timeLimitHint', { count: turnTimeMinutes });
  const problemText =
    problem?.kind === 'account'
      ? t('friend.accountFailed')
      : problem?.kind === 'tooMany'
        ? t('friend.tooMany', { max: MAX_OPEN_INVITES })
        : problem?.kind === 'make'
          ? t('friend.makeFailed')
          : problem?.kind === 'friends'
            ? t(`friends.problem.${problem.problem}`)
            : null;
  const notSavedText =
    notSaved === 'guest'
      ? t('friends.guest')
      : notSaved === 'signedOut'
        ? t('friends.signedOut')
        : null;
  useEffect(() => {
    if (notSavedText !== null) AccessibilityInfo.announceForAccessibility(notSavedText);
  }, [notSavedText]);
  // iOS VoiceOver does not read `accessibilityRole="alert"`: read each problem.
  useEffect(() => {
    if (problemText !== null) AccessibilityInfo.announceForAccessibility(problemText);
  }, [problem, problemText]);
  const sentText = sent === null ? null : t('friends.sent', { name: sent.name });
  useEffect(() => {
    if (sentText !== null) AccessibilityInfo.announceForAccessibility(sentText);
  }, [sent, sentText]);

  // The account sentence is for a phone that never signed in: the sign-in
  // sheet comes on Make an invite. A friend invite needs a saved account
  // and says so itself.
  const [showAccount] = useState(() => friend === undefined && !hasOnlineAccount());
  const summary = t('friend.summary', {
    length: t('invite.open.lengthValue', { count: targetPoints }),
    time: timeLimitHint,
  });
  const whoFriends = friendList !== null && friendList.length > 0 ? friendList : null;

  return (
    <Screen testID="friend-setup">
      <ScreenHeader
        title={friend === undefined ? t('friend.title') : t('friends.invite.title')}
        titleRef={titleRef}
        onBack={onBack}
        backLabel={t('common.back')}
        testID="friend-back"
      />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {friend !== undefined ? (
          <Text style={styles.intro}>{t('friends.invite.intro')}</Text>
        ) : null}
        {whoFriends !== null ? (
          <View style={styles.section}>
            <SectionHeader
              title={t('friend.who')}
              {...(onFriends === undefined
                ? {}
                : {
                    action: {
                      label: t('friend.allFriends'),
                      onPress: onFriends,
                      testID: 'friend-all-friends',
                    },
                  })}
            />
            <WhoRow
              testID="friend-friends"
              friends={whoFriends}
              invited={invited}
              busy={busy}
              onAnyone={() => void make()}
              onFriend={(f) => void make({ to: f })}
              {...(onAddFriend === undefined ? {} : { onAdd: onAddFriend })}
            />
          </View>
        ) : null}
        <View style={styles.section}>
          <SectionHeader title={t('friend.game')} />
          <GameChoiceList
            testID="friend-game"
            label={t('friend.game')}
            options={ONLINE_GAME_CHOICES}
            value={choice}
            onChange={setChoice}
          />
        </View>
        <SettingLine label={t('friend.length')}>
          <SegmentedControl
            testID="friend-length"
            look="tray"
            label={t('friend.length')}
            options={lengthOptions}
            value={`${targetPoints}`}
            onChange={(value) => setTargetPoints(Number(value) as MatchLength)}
          />
        </SettingLine>
        <SettingLine label={t('friend.timeLimit')}>
          <SegmentedControl
            testID="friend-time-limit"
            look="tray"
            label={t('friend.timeLimit')}
            options={timeLimitOptions}
            value={`${turnTimeMinutes}`}
            onChange={(value) => setTurnTimeMinutes(value === 'null' ? null : Number(value))}
          />
        </SettingLine>
        <Text testID="friend-summary" style={styles.summary}>
          {summary}
        </Text>
        {showAccount ? (
          <Text testID="friend-account" style={styles.summary}>
            {t('friend.account')}
          </Text>
        ) : null}
      </ScrollView>
      <View style={styles.footer}>
        {/* The list fades out under the button. */}
        <View style={styles.fade} pointerEvents="none" />
        {problemText !== null ? (
          <Text testID="friend-problem" style={styles.problem}>
            {problemText}
          </Text>
        ) : null}
        {busy ? <Text style={styles.hint}>{t('friend.making')}</Text> : null}
        {sentText !== null ? (
          <View testID="friend-sent" style={styles.sent}>
            <Icon name="check" size={18} color={theme.colors.accent} />
            <Text style={styles.sentText}>{sentText}</Text>
          </View>
        ) : null}
        {notSavedText !== null ? (
          <>
            <Text testID="friend-not-saved" style={styles.problem}>
              {notSavedText}
            </Text>
            {onAccount !== undefined ? (
              <ActionButton
                testID="friend-account-open"
                label={notSaved === 'guest' ? t('friends.saveAccount') : t('friends.openAccount')}
                onPress={onAccount}
              />
            ) : null}
          </>
        ) : (
          <ActionButton
            testID="friend-make"
            icon={friend === undefined ? 'link' : 'send'}
            label={friend === undefined ? t('friend.make') : t('friends.invite.send')}
            disabled={busy}
            onPress={() => void make()}
          />
        )}
      </View>
      {signingIn ? (
        <SignInSheet
          auth={auth}
          onSignedIn={() => {
            setSigningIn(false);
            void make({ signedIn: true });
          }}
          onClose={() => {
            // Not now: the save reminders start (#404), as after a guest sign-in.
            reminders.start();
            setSigningIn(false);
          }}
          {...(appleSheet === undefined ? {} : { appleSheet })}
          {...(analytics === undefined ? {} : { analytics })}
        />
      ) : null}
    </Screen>
  );
}

/** How far the list fades out above the button. */
const FADE = 32;

const styles = StyleSheet.create((theme, rt) => ({
  scroll: {
    flex: 1,
  },
  content: {
    gap: 14,
    paddingHorizontal: theme.space.lg,
    paddingTop: theme.space.xs,
    // Room for the fade over the last line.
    paddingBottom: FADE,
  },
  section: {
    gap: 14,
  },
  intro: {
    ...theme.type.callout,
    color: theme.colors.textDim,
  },
  summary: {
    ...theme.type.footnote,
    paddingHorizontal: theme.space.xs,
    color: theme.colors.textDim,
  },
  hint: {
    ...theme.type.caption,
    color: theme.colors.textDim,
  },
  problem: {
    ...theme.type.body,
    color: theme.colors.text,
  },
  sent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.sm,
  },
  sentText: {
    ...theme.type.bodyStrong,
    flexShrink: 1,
    color: theme.colors.text,
  },
  footer: {
    gap: theme.space.sm,
    paddingHorizontal: theme.space.lg,
    paddingTop: theme.space.sm,
    paddingBottom: Math.max(rt.insets.bottom, theme.space.lg),
    backgroundColor: theme.colors.backgroundFloor,
  },
  fade: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: -FADE,
    height: FADE,
    backgroundImage: `linear-gradient(180deg, ${withAlpha(theme.colors.backgroundFloor, 0)} 0%, ${theme.colors.backgroundFloor} 100%)`,
  },
}));

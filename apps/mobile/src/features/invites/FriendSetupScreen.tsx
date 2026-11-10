/**
 * Play a friend online (#281): pick the game, the match length and a turn
 * time limit, then "Make an invite". The route then opens the waiting screen
 * (`InviteWaitScreen`) with the code and the link.
 *
 * - An online game needs an account on our server. The screen says so.
 *   "Make an invite" uses the saved session when there is one; else it
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
 * - Look (#358): the Home style. The intro sits on a brass-edged card,
 *   the pickers in `SectionCard`s, and "Make an invite" stays at the
 *   bottom while the list fades out under it.
 *
 * - Friend invite (#406, `friend`): the same setup, but the invite goes
 *   to one friend (`Friends.inviteFriend`), who gets a push. The title
 *   and the intro say so.
 *   It needs a saved account, so it checks the account when it opens
 *   (and on each new `visit`, after Settings → Account) and again on
 *   Make an invite. A guest gets "Friends need a saved account…" and
 *   **Save my account**, nobody signed in "You are not signed in…" and
 *   **Open Account** (`onAccount`), in place of Make an invite; neither
 *   gets the sign-in sheet. `NOT_SAVED` from the server counts as a guest.
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
import { RowIcon, SectionCard } from '@/components/SectionCard';
import { OptionList, type ListOption } from '@/components/settings/OptionList';
import { SegmentedControl, type SegmentOption } from '@/components/settings/SegmentedControl';
import { useFocusOnShow } from '@/features/accessibility/focus';
import { MATCH_LENGTHS, type MatchLength } from '@/features/match/setup';
import { onlineAccountReady } from '@/features/online/account';
import { SignInSheet } from '@/features/online/SignInSheet';
import { formatTimeLimit } from '@/features/online/clock';
import { reminders } from '@/features/reminders/reminders';

import { sendInviteCreated } from './inviteAnalytics';

export interface FriendSetupScreenProps {
  auth: AuthProvider;
  invites: Invites;
  /** The server made the invite (`game`): show its code. */
  onCreated: (code: string, game: NewInvite) => void;
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
}

/** Why a friend invite cannot be made from this account. */
type NotSaved = 'guest' | 'signedOut';

/** Why "Make an invite" did not work. */
type Problem = 'account' | 'make' | 'tooMany';

/** The turn time limit options: null is the 24-hour default, others are minutes. */
const TIME_LIMITS: readonly (number | null)[] = [null, 5, 1];

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
}: FriendSetupScreenProps) {
  const { t } = useTranslation();
  const { theme } = useUnistyles();
  const [choice, setChoice] = useState<OnlineGameChoice>('portes');
  const [targetPoints, setTargetPoints] = useState<MatchLength>(3);
  const [turnTimeMinutes, setTurnTimeMinutes] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  // One invite per tap: a second tap before the render sees `busy` does nothing.
  const making = useRef(false);
  // A new object for each failure, so the same problem twice is read twice.
  const [problem, setProblem] = useState<{ readonly kind: Problem } | null>(null);
  // No saved session: the sign-in sheet is open.
  const [signingIn, setSigningIn] = useState(false);
  const titleRef = useFocusOnShow();
  // A friend invite and an account that cannot make one.
  const [notSaved, setNotSaved] = useState<NotSaved | null>(null);
  const forFriend = friend !== undefined;
  useEffect(() => {
    if (!forFriend) return;
    let live = true;
    // A failed check says nothing: Make an invite checks again.
    auth.ready().then(
      (user) => {
        if (live) setNotSaved(user === null ? 'signedOut' : user.isGuest ? 'guest' : null);
      },
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [auth, forFriend, visit]);
  // False once the screen is gone (the server answers later).
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  /** `signedIn`: the sheet just signed in (and noted the account already). */
  const make = async (signedIn = false) => {
    if (making.current) return;
    making.current = true;
    setBusy(true);
    setProblem(null);
    const game: NewInvite = { choice, targetPoints, turnTimeMinutes };
    const failed = (next: Problem) => {
      making.current = false;
      if (!mounted.current) return;
      setBusy(false);
      setProblem({ kind: next });
    };
    const refused = (why: NotSaved) => {
      making.current = false;
      if (!mounted.current) return;
      setBusy(false);
      setNotSaved(why);
    };
    let user: AuthUser | null;
    try {
      user = await auth.ready();
    } catch {
      failed('account');
      return;
    }
    // Gone (Back) before the account was ready: make no invite.
    if (!mounted.current) return;
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
      code = await (friend === undefined ? invites.createInvite(game) : friend.invite(game));
    } catch (error) {
      const tooMany =
        (isInviteErrorData(error) || isFriendsErrorData(error)) &&
        error.code === 'TOO_MANY_INVITES';
      if (isFriendsErrorData(error) && error.code === 'NOT_SAVED') {
        refused('guest');
        return;
      }
      failed(tooMany ? 'tooMany' : 'make');
      return;
    }
    if (!mounted.current) {
      // Nobody will wait for it: take it back. A failed cancel only leaves
      // it to expire.
      invites.cancelInvite(code).catch(() => {});
      return;
    }
    sendInviteCreated(game, analytics);
    // The buttons stay off while the route opens the waiting screen.
    onCreated(code, game);
  };

  const lengthOptions: SegmentOption<`${MatchLength}`>[] = MATCH_LENGTHS.map((n) => ({
    value: `${n}`,
    label: String(n),
  }));
  const timeLimitOptions: SegmentOption<string>[] = TIME_LIMITS.map((value) => ({
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

  const gameOptions: ListOption<OnlineGameChoice>[] = ONLINE_GAME_CHOICES.map((game) => ({
    value: game,
    label: t(`games.${game}`),
    hint: t(`games.${game}Subtitle`),
  }));

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
        <View style={styles.hero}>
          <View style={styles.heroBadge}>
            <Icon name="globe" size={26} color={theme.colors.accent} />
          </View>
          <Text style={styles.intro}>
            {friend === undefined ? t('friend.intro') : t('friends.invite.intro')}
          </Text>
        </View>
        <SectionCard title={t('friend.game')}>
          <OptionList
            testID="friend-game"
            label={t('friend.game')}
            options={gameOptions}
            value={choice}
            onChange={setChoice}
          />
        </SectionCard>
        <SectionCard title={t('friend.length')} padded>
          <SegmentedControl
            testID="friend-length"
            label={t('friend.length')}
            options={lengthOptions}
            value={`${targetPoints}`}
            onChange={(value) => setTargetPoints(Number(value) as MatchLength)}
          />
          <Text style={styles.hint}>{t('invite.open.lengthValue', { count: targetPoints })}</Text>
        </SectionCard>
        <SectionCard title={t('friend.timeLimit')} padded>
          <SegmentedControl
            testID="friend-time-limit"
            label={t('friend.timeLimit')}
            options={timeLimitOptions}
            value={`${turnTimeMinutes}`}
            onChange={(value) => setTurnTimeMinutes(value === 'null' ? null : Number(value))}
          />
          <Text style={styles.hint}>{timeLimitHint}</Text>
        </SectionCard>
        <View style={styles.note}>
          <RowIcon name="shield" />
          <Text testID="friend-account" style={styles.noteText}>
            {t('friend.account')}
          </Text>
        </View>
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
            label={t('friend.make')}
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
            void make(true);
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
    gap: theme.space.lg,
    paddingHorizontal: theme.space.lg,
    paddingTop: theme.space.sm,
    // Room for the fade over the last line.
    paddingBottom: FADE,
  },
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.md,
    padding: theme.space.lg,
    borderRadius: theme.radii.xl,
    borderWidth: 1,
    borderColor: theme.colors.accent,
    backgroundColor: theme.colors.surface,
    backgroundImage: `linear-gradient(160deg, ${theme.colors.surfaceSelected} 0%, ${theme.colors.surface} 70%)`,
    boxShadow: '0px 8px 20px rgba(0, 0, 0, 0.3)',
  },
  heroBadge: {
    width: 48,
    height: 48,
    borderRadius: theme.radii.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.backgroundDeep,
  },
  intro: {
    ...theme.type.body,
    flex: 1,
    color: theme.colors.text,
  },
  hint: {
    ...theme.type.caption,
    color: theme.colors.textDim,
  },
  note: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.space.md,
    paddingHorizontal: theme.space.xs,
    paddingTop: theme.space.xs,
  },
  noteText: {
    ...theme.type.caption,
    flex: 1,
    color: theme.colors.textDim,
  },
  problem: {
    ...theme.type.body,
    color: theme.colors.text,
  },
  footer: {
    gap: theme.space.sm,
    paddingHorizontal: theme.space.lg,
    paddingTop: theme.space.sm,
    paddingBottom: Math.max(rt.insets.bottom, theme.space.lg),
    backgroundColor: theme.colors.background,
  },
  fade: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: -FADE,
    height: FADE,
    backgroundImage: `linear-gradient(180deg, ${withAlpha(theme.colors.background, 0)} 0%, ${theme.colors.background} 100%)`,
  },
}));

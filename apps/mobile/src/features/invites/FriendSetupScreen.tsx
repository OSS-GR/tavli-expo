/**
 * Play a friend online (#281): pick the game, the match length and a turn
 * time limit, then "Make an invite". The route then opens the waiting screen
 * (`InviteWaitScreen`) with the code and the link.
 *
 * - An online game needs an account on our server. The screen says so,
 *   and "Make an invite" makes the guest account first
 *   (`signInForOnline`): the saved session when there is one, else a new
 *   guest, once.
 * - It talks to the server only through the `Invites` port.
 * - A new invite sends `invite_created` (no code, no ids).
 * - Back while the invite is being made: the screen makes no invite, or
 *   cancels the one the server just made, so no invite is left open that
 *   nobody waits for (it would count toward `MAX_OPEN_INVITES`).
 * - A problem line is read to screen readers (`useAnnouncement`; iOS
 *   VoiceOver does not read `accessibilityRole="alert"`).
 * - Screen readers: focus moves to the title when the screen opens.
 * - Large fonts scroll: no text has a line limit.
 * - Look (#358): the Home style. The intro sits on a brass-edged card,
 *   the pickers in `SectionCard`s, and "Make an invite" stays at the
 *   bottom while the list fades out under it.
 *
 * Navigation stays in the route (`app/friend/index.tsx`).
 */
import {
  isInviteErrorData,
  ONLINE_GAME_CHOICES,
  type Analytics,
  type AuthProvider,
  type Invites,
  type NewInvite,
  type OnlineGameChoice,
} from '@tavli/contracts';
import { MAX_OPEN_INVITES } from '@tavli/online';
import { withAlpha } from '@tavli/ui';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { ActionButton } from '@/components/ActionButton';
import { Icon } from '@/components/Icon';
import { Screen } from '@/components/Screen';
import { ScreenHeader } from '@/components/ScreenHeader';
import { RowIcon, SectionCard } from '@/components/SectionCard';
import { OptionList, type ListOption } from '@/components/settings/OptionList';
import { SegmentedControl, type SegmentOption } from '@/components/settings/SegmentedControl';
import { useFocusOnShow } from '@/features/accessibility/focus';
import { useAnnouncement } from '@/features/game/useAnnouncement';
import { MATCH_LENGTHS, type MatchLength } from '@/features/match/setup';
import { signInForOnline } from '@/features/online/account';
import { formatTimeLimit } from '@/features/online/clock';

import { sendInviteCreated } from './inviteAnalytics';

export interface FriendSetupScreenProps {
  auth: AuthProvider;
  invites: Invites;
  /** The server made the invite (`game`): show its code. */
  onCreated: (code: string, game: NewInvite) => void;
  onBack: () => void;
  /** For tests. Default: the app's analytics. */
  analytics?: Analytics;
}

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
}: FriendSetupScreenProps) {
  const { t } = useTranslation();
  const { theme } = useUnistyles();
  const [choice, setChoice] = useState<OnlineGameChoice>('portes');
  const [targetPoints, setTargetPoints] = useState<MatchLength>(3);
  const [turnTimeMinutes, setTurnTimeMinutes] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  // One invite per tap: a second tap before the render sees `busy` does nothing.
  const making = useRef(false);
  const [problem, setProblem] = useState<Problem | null>(null);
  const titleRef = useFocusOnShow();
  // False once the screen is gone (the server answers later).
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const make = async () => {
    if (making.current) return;
    making.current = true;
    setBusy(true);
    setProblem(null);
    const game: NewInvite = { choice, targetPoints, turnTimeMinutes };
    const failed = (next: Problem) => {
      making.current = false;
      if (!mounted.current) return;
      setBusy(false);
      setProblem(next);
    };
    try {
      await signInForOnline(auth);
    } catch {
      failed('account');
      return;
    }
    // Gone (Back) before the account was ready: make no invite.
    if (!mounted.current) return;
    let code: string;
    try {
      code = await invites.createInvite(game);
    } catch (error) {
      failed(isInviteErrorData(error) && error.code === 'TOO_MANY_INVITES' ? 'tooMany' : 'make');
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
    problem === 'account'
      ? t('friend.accountFailed')
      : problem === 'tooMany'
        ? t('friend.tooMany', { max: MAX_OPEN_INVITES })
        : problem === 'make'
          ? t('friend.makeFailed')
          : null;
  useAnnouncement(problemText);

  const gameOptions: ListOption<OnlineGameChoice>[] = ONLINE_GAME_CHOICES.map((game) => ({
    value: game,
    label: t(`games.${game}`),
    hint: t(`games.${game}Subtitle`),
  }));

  return (
    <Screen testID="friend-setup">
      <ScreenHeader
        title={t('friend.title')}
        titleRef={titleRef}
        onBack={onBack}
        backLabel={t('friend.back')}
        testID="friend-back"
      />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <View style={styles.heroBadge}>
            <Icon name="globe" size={26} color={theme.colors.accent} />
          </View>
          <Text style={styles.intro}>{t('friend.intro')}</Text>
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
        <ActionButton
          testID="friend-make"
          label={t('friend.make')}
          disabled={busy}
          onPress={() => void make()}
        />
      </View>
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

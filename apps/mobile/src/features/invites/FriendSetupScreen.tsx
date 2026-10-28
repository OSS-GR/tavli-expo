/**
 * Play a friend online (#281): pick the game, the match length and the
 * pace, then "Make an invite". The route then opens the waiting screen
 * (`InviteWaitScreen`) with the code and the link.
 *
 * - An online game needs an account on our server. The screen says so,
 *   and "Make an invite" makes the guest account first
 *   (`signInForOnline`): the saved session when there is one, else a new
 *   guest, once.
 * - It talks to the server only through the `Invites` port.
 * - A new invite sends `invite_created` (no code, no ids).
 * - Screen readers: focus moves to the title when the screen opens.
 * - Large fonts scroll: no text has a line limit.
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
  type OnlineGamePace,
} from '@tavli/contracts';
import { MAX_OPEN_INVITES } from '@tavli/online';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { ActionButton } from '@/components/ActionButton';
import { SegmentedControl, type SegmentOption } from '@/components/settings/SegmentedControl';
import { SettingsSection } from '@/components/settings/SettingsSection';
import { useFocusOnShow } from '@/features/accessibility/focus';
import { MATCH_LENGTHS, type MatchLength } from '@/features/match/setup';
import { signInForOnline } from '@/features/online/account';

import { sendInviteCreated } from './inviteAnalytics';

export interface FriendSetupScreenProps {
  auth: AuthProvider;
  invites: Invites;
  /** The server made the invite: show its code. */
  onCreated: (code: string) => void;
  onBack: () => void;
  /** For tests. Default: the app's analytics. */
  analytics?: Analytics;
}

/** Why "Make an invite" did not work. */
type Problem = 'account' | 'make' | 'tooMany';

const PACES: readonly OnlineGamePace[] = ['live', 'async'];

export function FriendSetupScreen({
  auth,
  invites,
  onCreated,
  onBack,
  analytics,
}: FriendSetupScreenProps) {
  const { t } = useTranslation();
  const [choice, setChoice] = useState<OnlineGameChoice>('portes');
  const [targetPoints, setTargetPoints] = useState<MatchLength>(3);
  const [pace, setPace] = useState<OnlineGamePace>('live');
  const [busy, setBusy] = useState(false);
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
    if (busy) return;
    setBusy(true);
    setProblem(null);
    const game: NewInvite = { choice, targetPoints, pace };
    const failed = (next: Problem) => {
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
    let code: string;
    try {
      code = await invites.createInvite(game);
    } catch (error) {
      failed(isInviteErrorData(error) && error.code === 'TOO_MANY_INVITES' ? 'tooMany' : 'make');
      return;
    }
    sendInviteCreated(game, analytics);
    // The buttons stay off while the route opens the waiting screen.
    if (mounted.current) onCreated(code);
  };

  const lengthOptions: SegmentOption<`${MatchLength}`>[] = MATCH_LENGTHS.map((n) => ({
    value: `${n}`,
    label: String(n),
  }));
  const paceOptions: SegmentOption<OnlineGamePace>[] = PACES.map((value) => ({
    value,
    label: t(`friend.${value}`),
  }));
  const problemText =
    problem === 'account'
      ? t('friend.accountFailed')
      : problem === 'tooMany'
        ? t('friend.tooMany', { max: MAX_OPEN_INVITES })
        : problem === 'make'
          ? t('friend.makeFailed')
          : null;

  return (
    <View testID="friend-setup" style={styles.screen}>
      <View style={styles.header}>
        <Pressable
          testID="friend-back"
          accessibilityRole="button"
          accessibilityLabel={t('friend.back')}
          onPress={onBack}
          hitSlop={8}
          style={({ pressed }) => [styles.back, pressed && styles.pressed]}>
          <Text style={styles.backIcon} importantForAccessibility="no" allowFontScaling={false}>
            {'‹'}
          </Text>
        </Pressable>
        <Text ref={titleRef} style={styles.title} accessibilityRole="header">
          {t('friend.title')}
        </Text>
        <View style={styles.headerSpace} />
      </View>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <Text style={styles.intro}>{t('friend.intro')}</Text>
        <SettingsSection title={t('friend.game')}>
          <View style={styles.gameList} accessibilityRole="radiogroup">
            {ONLINE_GAME_CHOICES.map((game) => {
              const selected = game === choice;
              return (
                <Pressable
                  key={game}
                  testID={`friend-game-${game}`}
                  onPress={() => setChoice(game)}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected }}
                  accessibilityLabel={`${t(`games.${game}`)}, ${t(`games.${game}Subtitle`)}`}
                  style={({ pressed }) => [
                    styles.gameCard(selected),
                    pressed && !selected && styles.pressed,
                  ]}>
                  <View style={styles.radio}>
                    {selected ? <View style={styles.radioDot} /> : null}
                  </View>
                  <View style={styles.gameTexts}>
                    <Text style={styles.gameName}>{t(`games.${game}`)}</Text>
                    <Text style={styles.hint}>{t(`games.${game}Subtitle`)}</Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        </SettingsSection>
        <SettingsSection title={t('friend.length')}>
          <SegmentedControl
            testID="friend-length"
            label={t('friend.length')}
            options={lengthOptions}
            value={`${targetPoints}`}
            onChange={(value) => setTargetPoints(Number(value) as MatchLength)}
          />
          <Text style={styles.hint}>{t('invite.open.lengthValue', { count: targetPoints })}</Text>
        </SettingsSection>
        <SettingsSection title={t('friend.pace')}>
          <SegmentedControl
            testID="friend-pace"
            label={t('friend.pace')}
            options={paceOptions}
            value={pace}
            onChange={setPace}
          />
          <Text style={styles.hint}>{t(`invite.open.${pace}`)}</Text>
        </SettingsSection>
        <Text testID="friend-account" style={styles.intro}>
          {t('friend.account')}
        </Text>
      </ScrollView>
      <View style={styles.footer}>
        {problemText !== null ? (
          <Text testID="friend-problem" style={styles.problem} accessibilityRole="alert">
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
    </View>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  screen: {
    flex: 1,
    backgroundColor: theme.colors.background,
    paddingTop: rt.insets.top,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.sm,
    paddingHorizontal: theme.space.lg,
    paddingTop: theme.space.sm,
  },
  back: {
    width: theme.touch.minTarget,
    height: theme.touch.minTarget,
    borderRadius: theme.touch.minTarget / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  backIcon: {
    fontSize: 30,
    lineHeight: 32,
    color: theme.colors.text,
  },
  headerSpace: {
    width: theme.touch.minTarget,
  },
  pressed: {
    opacity: 0.7,
  },
  title: {
    ...theme.type.title,
    flex: 1,
    textAlign: 'center',
    color: theme.colors.text,
  },
  scroll: {
    flex: 1,
  },
  content: {
    gap: theme.space.sm,
    paddingHorizontal: theme.space.lg,
    paddingTop: theme.space.md,
    paddingBottom: theme.space.xl,
  },
  intro: {
    ...theme.type.body,
    color: theme.colors.textDim,
  },
  gameList: {
    gap: theme.space.sm,
  },
  gameCard: (selected: boolean) => ({
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.space.md,
    padding: theme.space.lg,
    borderRadius: theme.radii.lg,
    // The same border width either way, so the text does not move.
    borderWidth: 3,
    borderColor: selected ? theme.colors.accent : theme.colors.border,
    backgroundColor: selected ? theme.colors.surfaceSelected : theme.colors.surface,
  }),
  radio: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: theme.colors.text,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: theme.colors.text,
  },
  gameTexts: {
    flex: 1,
  },
  gameName: {
    ...theme.type.title,
    color: theme.colors.text,
  },
  hint: {
    ...theme.type.caption,
    color: theme.colors.textDim,
    paddingTop: theme.space.xs,
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
  },
}));

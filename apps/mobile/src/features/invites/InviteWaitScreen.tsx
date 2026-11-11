/**
 * The waiting screen of the inviter (#281): the code, the link
 * (`tavlaki://invite/<code>`), Share (the phone's share sheet) and Cancel.
 *
 * - It watches the invite live (`Invites.watchInvite`). When the friend
 *   accepts, it shows "Your friend joined" and opens the game
 *   (`onGame`) after `JOINED_OPEN_MS`, or at once with "Open the game".
 * - Declined, expired, cancelled, not found and "did not load" (with Try
 *   again) each have a card with "Make a new invite" and Home.
 * - Cancel takes the invite back and goes Home. The watch sees that
 *   cancel too; the screen keeps that view back until Cancel answers, so
 *   no "cancelled" card shows (or is read) on the way Home.
 * - Screen readers: each card moves focus to its title and is read once.
 *   Large fonts scroll: no text has a line limit. While another sheet
 *   covers the screen (`covered`: the turn notifications offer, #285), the
 *   screen is hidden from screen readers, and a card takes focus and is
 *   read only once the sheet is gone.
 * - Look (#358): the Home style. The code is large on a brass-edged card
 *   with the link under it, Share is the main button, a dot pulses by
 *   "Waiting for your friend…" (still with reduce motion), and Cancel
 *   sits at the bottom.
 *
 * Navigation stays in the route (`app/friend/[code].tsx`).
 */
import { isInviteErrorData, type Invites } from '@tavli/contracts';
import { displayCaps } from '@tavli/ui';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, ScrollView, Share, Text, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { ActionButton } from '@/components/ActionButton';
import { Icon } from '@/components/Icon';
import { screenBackground } from '@/components/Screen';
import { useFocusOnShow } from '@/features/accessibility/focus';
import { useAnnouncement } from '@/features/game/useAnnouncement';

import { inviteAppUrl } from './link';
import {
  isFinalWait,
  waitStateOfCancelError,
  waitStateOfError,
  waitStateOfView,
  type WaitState,
} from './waitState';

/** The waiting dot and the ring around it, in points. */
const DOT = 10;
const DOT_RING = 6;

/** How long "Your friend joined" shows before the game opens. */
export const JOINED_OPEN_MS = 1500;

/** True while another sheet covers the screen: the cards wait to take focus and be read. */
const Covered = createContext(false);

export interface InviteWaitScreenProps {
  /** The invite code, in capital letters. */
  code: string;
  /**
   * The signed-in user. `undefined` while the saved session loads, `null`
   * when nobody is signed in: then the invite cannot be this phone's, so
   * the screen shows "not found" and never calls the server.
   */
  me: string | null | undefined;
  invites: Invites;
  /** The friend accepted: open the game. Called once. */
  onGame: (gameId: string) => void;
  /** Make a new invite. */
  onNewInvite: () => void;
  onHome: () => void;
  /** Another sheet is over the screen (the turn notifications offer). */
  covered?: boolean;
}

export function InviteWaitScreen({
  code,
  me,
  invites,
  onGame,
  onNewInvite,
  onHome,
  covered = false,
}: InviteWaitScreenProps) {
  const [state, setState] = useState<WaitState>({ kind: 'loading' });
  // Each "Try again" watches once more.
  const [attempt, setAttempt] = useState(0);
  const [cancelling, setCancelling] = useState(false);
  const [cancelFailed, setCancelFailed] = useState(false);
  // True while this phone's Cancel waits for the server.
  const cancelPending = useRef(false);
  // A "cancelled" view that came while Cancel waited.
  const heldCancel = useRef<WaitState | null>(null);
  // False once the screen is gone (Cancel answers later).
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    // No session yet, or none at all: no watch (see `shown` below).
    if (typeof me !== 'string') return undefined;
    let watching = true;
    let stopWatch = () => {};
    const finish = () => {
      if (!watching) return;
      watching = false;
      stopWatch();
    };
    stopWatch = invites.watchInvite(
      code,
      (view) => {
        const next = waitStateOfView(view, me);
        if (next.kind === 'cancelled' && cancelPending.current) {
          // Most likely our own Cancel: it goes Home when it answers.
          heldCancel.current = next;
        } else {
          setState(next);
        }
        // The invite never changes again: stop watching.
        if (isFinalWait(next)) finish();
      },
      (error) => setState(waitStateOfError(error)),
    );
    return finish;
  }, [code, invites, attempt, me]);
  const shown: WaitState =
    me === undefined ? { kind: 'loading' } : me === null ? { kind: 'notFound' } : state;

  const retry = () => {
    setState({ kind: 'loading' });
    setAttempt((n) => n + 1);
  };

  const cancel = () => {
    if (cancelling) return;
    setCancelling(true);
    setCancelFailed(false);
    cancelPending.current = true;
    heldCancel.current = null;
    invites.cancelInvite(code).then(
      () => {
        cancelPending.current = false;
        if (mounted.current) onHome();
      },
      (error: unknown) => {
        cancelPending.current = false;
        if (!mounted.current) return;
        setCancelling(false);
        // Cancelled on another phone or screen: show what the watch saw.
        const held = heldCancel.current;
        heldCancel.current = null;
        if (held !== null) {
          setState(held);
          return;
        }
        const next = waitStateOfCancelError(error);
        if (next !== null) setState(next);
        // A closed invite: the watch shows what happened (the friend may have just accepted).
        else if (!(isInviteErrorData(error) && error.code === 'INVITE_CLOSED')) {
          setCancelFailed(true);
        }
      },
    );
  };

  return (
    // The view that hides its content always keeps its children (#173).
    <View
      style={styles.screen}
      collapsable={false}
      importantForAccessibility={covered ? 'no-hide-descendants' : 'auto'}
      accessibilityElementsHidden={covered}>
      <Covered value={covered}>
        <ScrollView
          testID="invite-wait-screen"
          style={styles.scroll}
          contentContainerStyle={styles.content}>
          {shown.kind === 'loading' ? (
            <Loading />
          ) : shown.kind === 'open' ? (
            <Waiting
              code={code}
              cancelling={cancelling}
              cancelFailed={cancelFailed}
              onCancel={cancel}
            />
          ) : shown.kind === 'joined' ? (
            <Joined code={code} gameId={shown.gameId} onGame={onGame} />
          ) : (
            // A new state is a new card, so focus moves to its title again.
            <Closed
              key={shown.kind}
              kind={shown.kind}
              onRetry={retry}
              onNewInvite={onNewInvite}
              onHome={onHome}
            />
          )}
        </ScrollView>
      </Covered>
    </View>
  );
}

function Loading() {
  const { t } = useTranslation();
  const covered = useContext(Covered);
  const titleRef = useFocusOnShow(!covered);
  return (
    <View testID="invite-wait-loading" style={styles.loading}>
      <ActivityIndicator />
      <Text ref={titleRef} style={styles.line} accessibilityRole="header">
        {t('friend.wait.loading')}
      </Text>
    </View>
  );
}

interface WaitingProps {
  code: string;
  cancelling: boolean;
  cancelFailed: boolean;
  onCancel: () => void;
}

function Waiting({ code, cancelling, cancelFailed, onCancel }: WaitingProps) {
  const { t } = useTranslation();
  const { theme } = useUnistyles();
  const covered = useContext(Covered);
  const titleRef = useFocusOnShow(!covered);
  const title = t('friend.wait.title');
  const body = t('friend.wait.body');
  const link = inviteAppUrl(code);
  // Read once per invite in this app run (#216).
  useAnnouncement(covered ? null : `${title} ${body}`, `invite-wait:${code}`);
  // iOS VoiceOver does not read `accessibilityRole="alert"`: read the problem.
  useAnnouncement(cancelFailed && !covered ? t('friend.wait.cancelFailed') : null);
  const share = () => {
    Share.share({ message: t('friend.wait.shareMessage', { link, code }) }).catch(
      (error: unknown) => console.warn('share failed', error),
    );
  };
  return (
    <View testID="invite-wait-open" style={styles.waiting}>
      <Text ref={titleRef} style={styles.pageTitle} accessibilityRole="header">
        {title}
      </Text>
      <Text style={styles.lead}>{body}</Text>
      <View style={styles.hero}>
        {/* A screen reader spells the code out, one character at a time. */}
        <View
          style={styles.codeBlock}
          accessible
          accessibilityLabel={`${t('friend.wait.code')}: ${[...code].join(' ')}`}>
          <Text style={styles.eyebrow}>{displayCaps(t('friend.wait.code'))}</Text>
          <Text testID="invite-wait-code" style={styles.code} selectable>
            {code}
          </Text>
        </View>
        <View
          style={styles.linkRow}
          accessible
          accessibilityLabel={`${t('friend.wait.link')}: ${link}`}>
          <Icon name="link" size={20} color={theme.colors.textDim} />
          <Text testID="invite-wait-link" style={styles.link} selectable>
            {link}
          </Text>
        </View>
      </View>
      <ActionButton testID="invite-wait-share" label={t('friend.wait.share')} onPress={share} />
      <View style={styles.waitCard}>
        <View style={styles.status}>
          <PulsingDot />
          <Text style={styles.statusText}>{t('friend.wait.status')}</Text>
        </View>
        <Text style={styles.small}>{t('friend.wait.stay')}</Text>
      </View>
      <View style={styles.spacer} />
      <ActionButton
        testID="invite-wait-cancel"
        kind="destructiveText"
        label={t('friend.wait.cancel')}
        busy={cancelling}
        onPress={onCancel}
      />
      {cancelling ? <Text style={styles.line}>{t('friend.wait.cancelling')}</Text> : null}
      {cancelFailed ? (
        <Text testID="invite-wait-cancel-failed" style={styles.line}>
          {t('friend.wait.cancelFailed')}
        </Text>
      ) : null}
    </View>
  );
}

/** One beat of the waiting dot, in ms: it fades out and back in. */
const PULSE_MS = 900;

/**
 * The dot by "Waiting for your friend…": it pulses while the invite is
 * open. With reduce motion on it stays still. Screen readers skip it.
 */
function PulsingDot() {
  const reduceMotion = useReducedMotion();
  const pulse = useSharedValue(1);
  useEffect(() => {
    if (reduceMotion) return undefined;
    pulse.set(
      withRepeat(
        withTiming(0.35, { duration: PULSE_MS, easing: Easing.inOut(Easing.quad) }),
        -1,
        true,
      ),
    );
    return () => cancelAnimation(pulse);
  }, [reduceMotion, pulse]);
  const animated = useAnimatedStyle(() => ({ opacity: pulse.get() }));
  return (
    <View
      style={styles.dotRing}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden>
      <Animated.View testID="invite-wait-dot" style={[styles.dot, animated]} />
    </View>
  );
}

interface JoinedProps {
  code: string;
  gameId: string;
  onGame: (gameId: string) => void;
}

function Joined({ code, gameId, onGame }: JoinedProps) {
  const { t } = useTranslation();
  const covered = useContext(Covered);
  const titleRef = useFocusOnShow(!covered);
  const title = t('friend.joined.title');
  const body = t('friend.joined.body');
  useAnnouncement(covered ? null : `${title} ${body}`, `invite-joined:${code}`);
  // The game opens once: by the timer, or by the button.
  const onGameRef = useRef(onGame);
  useEffect(() => {
    onGameRef.current = onGame;
  });
  const opened = useRef(false);
  const open = useCallback(() => {
    if (opened.current) return;
    opened.current = true;
    onGameRef.current(gameId);
  }, [gameId]);
  useEffect(() => {
    const timer = setTimeout(open, JOINED_OPEN_MS);
    return () => clearTimeout(timer);
  }, [open]);
  return (
    <View testID="invite-wait-joined" style={styles.card}>
      <Text ref={titleRef} style={styles.title} accessibilityRole="header">
        {title}
      </Text>
      <Text style={styles.line}>{body}</Text>
      <View style={styles.actions}>
        <ActionButton
          testID="invite-wait-open-game"
          label={t('friend.joined.open')}
          onPress={open}
        />
      </View>
    </View>
  );
}

interface ClosedProps {
  kind: 'declined' | 'expired' | 'cancelled' | 'notFound' | 'failed';
  onRetry: () => void;
  onNewInvite: () => void;
  onHome: () => void;
}

function Closed({ kind, onRetry, onNewInvite, onHome }: ClosedProps) {
  const { t } = useTranslation();
  const covered = useContext(Covered);
  const titleRef = useFocusOnShow(!covered);
  const title = t(`friend.${kind}.title`);
  const body = t(`friend.${kind}.body`);
  useAnnouncement(covered ? null : `${title} ${body}`);
  return (
    <View testID={`invite-wait-${kind}`} style={styles.card}>
      <Text ref={titleRef} style={styles.title} accessibilityRole="header">
        {title}
      </Text>
      <Text style={styles.line}>{body}</Text>
      <View style={styles.actions}>
        {kind === 'failed' ? (
          <ActionButton
            testID="invite-wait-retry"
            label={t('friend.failed.retry')}
            onPress={onRetry}
          />
        ) : (
          <ActionButton
            testID="invite-wait-again"
            label={t('friend.again')}
            onPress={onNewInvite}
          />
        )}
        <ActionButton
          testID="invite-wait-home"
          kind="secondary"
          label={t('friend.home')}
          onPress={onHome}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  screen: {
    flex: 1,
    ...screenBackground(theme.colors),
  },
  scroll: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingTop: rt.insets.top + theme.space.lg,
    paddingBottom: Math.max(rt.insets.bottom, theme.space.lg),
    paddingHorizontal: theme.space.lg,
  },
  loading: {
    alignItems: 'center',
    gap: theme.space.md,
  },
  card: {
    padding: theme.space.lg,
    gap: theme.space.md,
    borderRadius: theme.radii.xl,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    boxShadow: '0px 8px 20px rgba(0, 0, 0, 0.3)',
  },
  title: {
    ...theme.type.title,
    color: theme.colors.text,
  },
  line: {
    ...theme.type.body,
    color: theme.colors.textDim,
  },
  waiting: {
    flexGrow: 1,
    gap: theme.space.lg,
  },
  pageTitle: {
    ...theme.type.title,
    textAlign: 'center',
    color: theme.colors.text,
  },
  lead: {
    ...theme.type.body,
    textAlign: 'center',
    color: theme.colors.textDim,
  },
  hero: {
    alignItems: 'center',
    gap: theme.space.md,
    paddingVertical: theme.space.xl,
    paddingHorizontal: theme.space.lg,
    borderRadius: theme.radii.xl,
    borderWidth: 1,
    borderColor: theme.colors.accent,
    backgroundColor: theme.colors.surface,
    backgroundImage: `linear-gradient(160deg, ${theme.colors.surfaceSelected} 0%, ${theme.colors.surface} 70%)`,
    boxShadow: '0px 8px 20px rgba(0, 0, 0, 0.3)',
  },
  codeBlock: {
    alignItems: 'center',
    gap: theme.space.xs,
  },
  eyebrow: {
    ...theme.type.section,
    color: theme.colors.accent,
  },
  code: {
    ...theme.type.display,
    fontWeight: '800',
    letterSpacing: 6,
    fontVariant: ['tabular-nums'],
    textAlign: 'center',
    color: theme.colors.text,
  },
  linkRow: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.sm,
    minHeight: 48,
    paddingHorizontal: theme.space.md,
    paddingVertical: theme.space.sm,
    borderRadius: theme.radii.lg,
    borderWidth: 1,
    borderColor: theme.colors.separator,
    backgroundColor: theme.colors.backgroundDeep,
  },
  link: {
    ...theme.type.caption,
    flex: 1,
    color: theme.colors.textDim,
  },
  waitCard: {
    gap: theme.space.sm,
    padding: theme.space.lg,
    borderRadius: theme.radii.xl,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    boxShadow: '0px 8px 20px rgba(0, 0, 0, 0.3)',
  },
  status: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.md,
  },
  statusText: {
    ...theme.type.bodyStrong,
    flex: 1,
    color: theme.colors.text,
  },
  small: {
    ...theme.type.caption,
    color: theme.colors.textDim,
  },
  // The ring stays; only the dot inside it pulses.
  dotRing: {
    width: DOT + 2 * DOT_RING,
    height: DOT + 2 * DOT_RING,
    borderRadius: (DOT + 2 * DOT_RING) / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.accentWash,
  },
  dot: {
    width: DOT,
    height: DOT,
    borderRadius: DOT / 2,
    backgroundColor: theme.colors.turn,
  },
  spacer: {
    flexGrow: 1,
  },
  actions: {
    gap: theme.space.sm,
    marginTop: theme.space.sm,
  },
}));

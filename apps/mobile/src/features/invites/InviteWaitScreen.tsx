/**
 * The waiting screen of the inviter (#281): the code, Share (the phone's
 * share sheet, with the link `tavlaki://invite/<code>` and the code) and
 * Cancel.
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
 * - Look (#516, Figma node `17:187`): Close (top left) goes Home and
 *   leaves the invite open. The title and one line with the game and the
 *   length. The code in two groups of four bone tiles on a raised card,
 *   with Share under it (the link shows only in the share message). A
 *   dot pulses by "Waiting for your friend" (still with reduce motion),
 *   with the time the invite has left on the phone clock (as on Home).
 *   Cancel sits at the bottom.
 *
 * Navigation stays in the route (`app/friend/[code].tsx`).
 */
import { isInviteErrorData, type InviteView, type Invites } from '@tavli/contracts';
import { fonts, withAlpha } from '@tavli/ui';
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
import { StyleSheet } from 'react-native-unistyles';

import { ActionButton } from '@/components/ActionButton';
import { CheckerAvatar } from '@/components/CheckerAvatar';
import { RoundButton } from '@/components/RoundButton';
import { screenBackground } from '@/components/Screen';
import { Surface } from '@/components/Surface';
import { useFocusOnShow } from '@/features/accessibility/focus';
import { useAnnouncement } from '@/features/game/useAnnouncement';
import { clockText } from '@/features/online/clock';

import { inviteAppUrl } from './link';
import { INVITE_TICK_MS, inviteClockOffset } from './myInvites';
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
              view={shown.view}
              cancelling={cancelling}
              cancelFailed={cancelFailed}
              onCancel={cancel}
              onClose={onHome}
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
  view: InviteView;
  cancelling: boolean;
  cancelFailed: boolean;
  onCancel: () => void;
  onClose: () => void;
}

function Waiting({ code, view, cancelling, cancelFailed, onCancel, onClose }: WaitingProps) {
  const { t } = useTranslation();
  const covered = useContext(Covered);
  const titleRef = useFocusOnShow(!covered);
  const title = t('friend.wait.title');
  const body = t('friend.wait.body', {
    game: t(`games.${view.choice}`),
    count: view.targetPoints,
  });
  const left = useTimeLeft(view);
  const stay =
    left > 0
      ? t('friend.wait.stay', { time: clockText(left, null, t) })
      : t('friend.wait.expiring');
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
      <View style={styles.topBar}>
        <RoundButton
          testID="invite-wait-close"
          icon="x"
          accessibilityLabel={t('friend.wait.close')}
          accessibilityHint={t('friend.wait.closeHint')}
          onPress={onClose}
        />
      </View>
      <View style={styles.head}>
        <CheckerAvatar playerKey={code} wood="bone" size={32} />
        <Text ref={titleRef} style={styles.pageTitle} accessibilityRole="header">
          {title}
        </Text>
        <Text style={styles.lead}>{body}</Text>
      </View>
      <Surface tier="raised" style={styles.codeCard}>
        <CodeTiles code={code} />
        <ActionButton
          testID="invite-wait-share"
          icon="share"
          label={t('friend.wait.share')}
          onPress={share}
        />
      </Surface>
      <Surface tier="tray" style={styles.statusCard}>
        <PulsingDot />
        <View style={styles.statusTexts}>
          <Text style={styles.statusText}>{t('friend.wait.status')}</Text>
          <Text testID="invite-wait-left" style={styles.small}>
            {stay}
          </Text>
        </View>
      </Surface>
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

/** Characters per tile group: two groups of four are easy to read over the phone. */
const CODE_GROUP = 4;

/**
 * The code in bone tiles (#516), two groups of four. A screen reader
 * spells the code out, one character at a time.
 */
function CodeTiles({ code }: { code: string }) {
  const { t } = useTranslation();
  const groups: string[][] = [];
  [...code].forEach((char, index) => {
    if (index % CODE_GROUP === 0) groups.push([]);
    groups[groups.length - 1]!.push(char);
  });
  return (
    <View
      style={styles.codeBlock}
      accessible
      accessibilityLabel={`${t('friend.wait.code')}: ${[...code].join(' ')}`}>
      <Text style={styles.eyebrow}>{t('friend.wait.code')}</Text>
      <View testID="invite-wait-code" style={styles.tiles}>
        {groups.map((group, g) => (
          <View key={g} style={styles.tileGroup}>
            {group.map((char, i) => (
              <View key={i} style={styles.tile}>
                <Text style={styles.tileText}>{char}</Text>
              </View>
            ))}
          </View>
        ))}
      </View>
    </View>
  );
}

/**
 * The time the open invite has left on the phone clock, set right by the
 * server clock as far as the view tells (`inviteClockOffset`, as on
 * Home). It ticks like Home's list (`INVITE_TICK_MS`).
 */
function useTimeLeft(view: InviteView): number {
  // The view of an open invite keeps its `expiresAt`: the first one sets the offset.
  const [offset] = useState(() => inviteClockOffset([view], Date.now()));
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), INVITE_TICK_MS);
    return () => clearInterval(timer);
  }, []);
  return view.expiresAt - (now + offset);
}

/** One beat of the waiting dot, in ms: it fades out and back in. */
const PULSE_MS = 900;

/**
 * The dot by "Waiting for your friend": it pulses while the invite is
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
    ...theme.type.title2,
    color: theme.colors.text,
  },
  line: {
    ...theme.type.body,
    color: theme.colors.textDim,
  },
  waiting: {
    flexGrow: 1,
    gap: 20,
  },
  // The close button sits alone on the right (#516).
  topBar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  head: {
    alignItems: 'center',
    gap: 6,
  },
  pageTitle: {
    ...theme.type.title1,
    textAlign: 'center',
    color: theme.colors.text,
  },
  lead: {
    ...theme.type.callout,
    textAlign: 'center',
    color: theme.colors.textDim,
  },
  codeCard: {
    alignItems: 'stretch',
    gap: theme.space.lg,
    paddingTop: 22,
    paddingBottom: 18,
    paddingHorizontal: theme.space.lg,
  },
  codeBlock: {
    alignItems: 'center',
    gap: theme.space.lg,
  },
  eyebrow: {
    ...theme.type.footnote,
    color: theme.colors.textDim,
  },
  tiles: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    columnGap: 14,
    rowGap: theme.space.sm,
  },
  tileGroup: {
    flexDirection: 'row',
    gap: 5,
  },
  // A bone tile, like a domino: a light face with a darker lip under it.
  tile: {
    minWidth: 38,
    minHeight: 52,
    paddingHorizontal: theme.space.xxs,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 9,
    backgroundColor: theme.colors.tileFace,
    backgroundImage: `linear-gradient(180deg, ${theme.colors.tileFaceLight} 0%, ${theme.colors.tileFace} 100%)`,
    boxShadow: `0px 2px 0px ${theme.colors.tileEdge}, 0px 4px 8px rgba(0, 0, 0, 0.4)`,
  },
  tileText: {
    ...theme.type.title1,
    fontFamily: fonts.numerals,
    color: theme.colors.tileText,
  },
  statusCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.space.md,
    paddingHorizontal: theme.space.lg,
    paddingVertical: 14,
  },
  statusTexts: {
    flex: 1,
    gap: 3,
  },
  statusText: {
    ...theme.type.headline,
    color: theme.colors.text,
  },
  small: {
    ...theme.type.footnote,
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
    boxShadow: `0px 0px 0px 4px ${withAlpha(theme.colors.turn, 0.18)}`,
  },
  spacer: {
    flexGrow: 1,
  },
  actions: {
    gap: theme.space.sm,
    marginTop: theme.space.sm,
  },
}));

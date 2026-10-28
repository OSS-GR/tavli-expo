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
 *   Large fonts scroll: no text has a line limit.
 *
 * Navigation stays in the route (`app/friend/[code].tsx`).
 */
import { isInviteErrorData, type Invites } from '@tavli/contracts';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, ScrollView, Share, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { ActionButton } from '@/components/ActionButton';
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

/** How long "Your friend joined" shows before the game opens. */
export const JOINED_OPEN_MS = 1500;

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
}

export function InviteWaitScreen({
  code,
  me,
  invites,
  onGame,
  onNewInvite,
  onHome,
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
    <ScrollView
      testID="invite-wait-screen"
      style={styles.screen}
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
  );
}

function Loading() {
  const { t } = useTranslation();
  const titleRef = useFocusOnShow();
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
  const titleRef = useFocusOnShow();
  const title = t('friend.wait.title');
  const body = t('friend.wait.body');
  const link = inviteAppUrl(code);
  // Read once per invite in this app run (#216).
  useAnnouncement(`${title} ${body}`, `invite-wait:${code}`);
  // iOS VoiceOver does not read `accessibilityRole="alert"`: read the problem.
  useAnnouncement(cancelFailed ? t('friend.wait.cancelFailed') : null);
  const share = () => {
    Share.share({ message: t('friend.wait.shareMessage', { link, code }) }).catch(
      (error: unknown) => console.warn('share failed', error),
    );
  };
  return (
    <View testID="invite-wait-open" style={styles.card}>
      <Text ref={titleRef} style={styles.title} accessibilityRole="header">
        {title}
      </Text>
      <Text style={styles.line}>{body}</Text>
      {/* A screen reader spells the code out, one character at a time. */}
      <View
        style={styles.row}
        accessible
        accessibilityLabel={`${t('friend.wait.code')}: ${[...code].join(' ')}`}>
        <Text style={styles.label}>{t('friend.wait.code')}</Text>
        <Text testID="invite-wait-code" style={styles.code} selectable>
          {code}
        </Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>{t('friend.wait.link')}</Text>
        <Text testID="invite-wait-link" style={styles.value} selectable>
          {link}
        </Text>
      </View>
      <View style={styles.status}>
        <ActivityIndicator />
        <Text style={styles.value}>{t('friend.wait.status')}</Text>
      </View>
      <Text style={styles.line}>{t('friend.wait.stay')}</Text>
      <View style={styles.actions}>
        <ActionButton testID="invite-wait-share" label={t('friend.wait.share')} onPress={share} />
        <ActionButton
          testID="invite-wait-cancel"
          kind="secondary"
          label={t('friend.wait.cancel')}
          disabled={cancelling}
          onPress={onCancel}
        />
      </View>
      {cancelling ? <Text style={styles.line}>{t('friend.wait.cancelling')}</Text> : null}
      {cancelFailed ? (
        <Text testID="invite-wait-cancel-failed" style={styles.line}>
          {t('friend.wait.cancelFailed')}
        </Text>
      ) : null}
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
  const titleRef = useFocusOnShow();
  const title = t('friend.joined.title');
  const body = t('friend.joined.body');
  useAnnouncement(`${title} ${body}`, `invite-joined:${code}`);
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
  const titleRef = useFocusOnShow();
  const title = t(`friend.${kind}.title`);
  const body = t(`friend.${kind}.body`);
  useAnnouncement(`${title} ${body}`);
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
    backgroundColor: theme.colors.background,
  },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingTop: Math.max(rt.insets.top, theme.space.lg),
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
  },
  title: {
    ...theme.type.title,
    color: theme.colors.text,
  },
  line: {
    ...theme.type.body,
    color: theme.colors.textDim,
  },
  row: {
    gap: theme.space.xxs,
  },
  label: {
    ...theme.type.caption,
    color: theme.colors.textDim,
  },
  value: {
    ...theme.type.bodyStrong,
    color: theme.colors.text,
  },
  code: {
    ...theme.type.title,
    color: theme.colors.text,
    letterSpacing: 2,
  },
  status: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.sm,
  },
  actions: {
    gap: theme.space.sm,
    marginTop: theme.space.sm,
  },
}));

/**
 * The invite screen (#256): a friend opened an invite link
 * (`tavlaki://invite/<code>`). It shows the game, the match length and
 * the pace, with Accept and Decline.
 *
 * - It talks to the server only through the `Invites` port, so the same
 *   screen works on the in-memory server now and on Convex later.
 * - States: loading, open, expired, already used, not found, your own
 *   invite, and "did not load" (with Try again). See `inviteState.ts`.
 * - Accept starts the game on the server; the route then opens the
 *   online game screen (#255). Decline closes the invite.
 * - Screen readers: each state moves focus to its title and reads the
 *   invite once. Large fonts scroll: no text has a line limit.
 *
 * The invite has no name of the inviter yet: players have no display
 * names (usernames come later, owner answer Q10). So it says "A friend".
 *
 * Navigation stays in the route (`app/invite/[code].tsx`).
 */
import { normalizeInviteCode, type InviteView, type Invites } from '@tavli/contracts';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { ActionButton } from '@/components/ActionButton';
import { useFocusOnShow } from '@/features/accessibility/focus';
import { useAnnouncement } from '@/features/game/useAnnouncement';

import { stateOfError, stateOfView, type InviteScreenState } from './inviteState';

export interface InviteScreenProps {
  /** The code from the link, in any case. It may not be a code at all. */
  code: string;
  invites: Invites;
  /** The player id of this phone, to tell your own invite. */
  me: string;
  /** The server started the game: open it. */
  onAccepted: (gameId: string) => void;
  /** The invite is declined. */
  onDeclined: () => void;
  onHome: () => void;
}

type Busy = 'accept' | 'decline' | null;

/** The first state: a text that is not a code needs no server call. */
function firstState(code: string): InviteScreenState {
  return normalizeInviteCode(code) === null ? { kind: 'notFound' } : { kind: 'loading' };
}

export function InviteScreen({
  code,
  invites,
  me,
  onAccepted,
  onDeclined,
  onHome,
}: InviteScreenProps) {
  const [state, setState] = useState<InviteScreenState>(() => firstState(code));
  // Each "Try again" loads once more.
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState<Busy>(null);
  const [actionFailed, setActionFailed] = useState(false);
  const valid = normalizeInviteCode(code) !== null;
  // False once the screen is gone (Accept and Decline answer later).
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!valid) return;
    let live = true;
    invites.getInvite(code).then(
      (view) => {
        if (live) setState(stateOfView(view, me));
      },
      (error: unknown) => {
        if (live) setState(stateOfError(error) ?? { kind: 'failed' });
      },
    );
    return () => {
      live = false;
    };
  }, [code, invites, me, valid, attempt]);

  const retry = () => {
    setState({ kind: 'loading' });
    setAttempt((n) => n + 1);
  };

  /**
   * Runs an answer. An error that says what happened to the invite shows
   * that state. Once the screen is gone, a late answer does nothing.
   *
   * After a successful answer the buttons stay off: the invite is closed,
   * and a second tap while the route navigates would only get
   * `INVITE_CLOSED`. Only a failed answer turns them on again.
   */
  const answer = (kind: 'accept' | 'decline') => {
    if (busy !== null) return;
    setBusy(kind);
    setActionFailed(false);
    const failed = (error: unknown) => {
      if (!mounted.current) return;
      setBusy(null);
      const next = stateOfError(error);
      if (next === null) setActionFailed(true);
      else setState(next);
    };
    if (kind === 'accept') {
      invites.acceptInvite(code).then((gameId) => {
        if (mounted.current) onAccepted(gameId);
      }, failed);
    } else {
      invites.declineInvite(code).then(() => {
        if (mounted.current) onDeclined();
      }, failed);
    }
  };

  return (
    <ScrollView testID="invite-screen" style={styles.screen} contentContainerStyle={styles.content}>
      {state.kind === 'loading' ? (
        <Loading />
      ) : state.kind === 'open' ? (
        <OpenInvite
          view={state.view}
          busy={busy}
          failed={actionFailed}
          onAccept={() => answer('accept')}
          onDecline={() => answer('decline')}
        />
      ) : (
        // A new state is a new card, so focus moves to its title again.
        <ClosedInvite key={state.kind} kind={state.kind} onRetry={retry} onHome={onHome} />
      )}
    </ScrollView>
  );
}

function Loading() {
  const { t } = useTranslation();
  const titleRef = useFocusOnShow();
  return (
    <View testID="invite-loading" style={styles.loading}>
      <ActivityIndicator />
      <Text ref={titleRef} style={styles.line} accessibilityRole="header">
        {t('invite.loading')}
      </Text>
    </View>
  );
}

interface OpenInviteProps {
  view: InviteView;
  busy: Busy;
  failed: boolean;
  onAccept: () => void;
  onDecline: () => void;
}

function OpenInvite({ view, busy, failed, onAccept, onDecline }: OpenInviteProps) {
  const { t } = useTranslation();
  const titleRef = useFocusOnShow();
  const title = t('invite.open.title');
  const from = t('invite.open.from');
  const rows = [
    { label: t('invite.open.game'), value: t(`games.${view.choice}`) },
    {
      label: t('invite.open.length'),
      value: t('invite.open.lengthValue', { count: view.targetPoints }),
    },
    { label: t('invite.open.pace'), value: t(`invite.open.${view.pace}`) },
  ];
  // Read once per invite in this app run (#216): the title, then each detail.
  useAnnouncement(
    [title, from, ...rows.map((row) => `${row.label}: ${row.value}.`)].join(' '),
    `invite:${view.code}`,
  );
  // iOS VoiceOver does not read `accessibilityRole="alert"`: read the problem.
  useAnnouncement(failed ? t('invite.open.failed') : null);
  return (
    <View testID="invite-open" style={styles.card}>
      <Text ref={titleRef} style={styles.title} accessibilityRole="header">
        {title}
      </Text>
      <Text style={styles.line}>{from}</Text>
      {rows.map((row) => (
        // One stop per detail for a screen reader: "Game, Portes".
        <View key={row.label} style={styles.row} accessible>
          <Text style={styles.label}>{row.label}</Text>
          <Text style={styles.value}>{row.value}</Text>
        </View>
      ))}
      <View style={styles.actions}>
        <ActionButton
          testID="invite-accept"
          label={t('invite.open.accept')}
          disabled={busy !== null}
          onPress={onAccept}
        />
        <ActionButton
          testID="invite-decline"
          kind="secondary"
          label={t('invite.open.decline')}
          disabled={busy !== null}
          onPress={onDecline}
        />
      </View>
      {busy !== null ? <Text style={styles.line}>{t('invite.open.busy')}</Text> : null}
      {failed ? (
        <Text testID="invite-failed" style={styles.line}>
          {t('invite.open.failed')}
        </Text>
      ) : null}
    </View>
  );
}

interface ClosedInviteProps {
  kind: 'expired' | 'used' | 'notFound' | 'own' | 'failed';
  onRetry: () => void;
  onHome: () => void;
}

function ClosedInvite({ kind, onRetry, onHome }: ClosedInviteProps) {
  const { t } = useTranslation();
  const titleRef = useFocusOnShow();
  const title = t(`invite.${kind}.title`);
  const body = t(`invite.${kind}.body`);
  useAnnouncement(`${title} ${body}`);
  return (
    <View testID={`invite-${kind}`} style={styles.card}>
      <Text ref={titleRef} style={styles.title} accessibilityRole="header">
        {title}
      </Text>
      <Text style={styles.line}>{body}</Text>
      <View style={styles.actions}>
        {kind === 'failed' ? (
          <ActionButton testID="invite-retry" label={t('invite.failed.retry')} onPress={onRetry} />
        ) : null}
        <ActionButton
          testID="invite-home"
          kind={kind === 'failed' ? 'secondary' : 'primary'}
          label={t('invite.home')}
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
  actions: {
    gap: theme.space.sm,
    marginTop: theme.space.sm,
  },
}));

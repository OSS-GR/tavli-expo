/**
 * Before a friend sees an invite on our server (#281): the server shows an
 * invite only to a signed-in user, and online play needs an account.
 *
 * - A saved session (this phone made or opened an invite before) shows
 *   the invite at once (`children`).
 * - Else a card says that an online game needs a free account, with "Show
 *   the invite" (it makes the guest account, once) and Home. Opening a
 *   link alone makes no account.
 * - A build with no online server shows "Online play is off".
 * - Screen readers: each card moves focus to its title and is read once.
 *   Large fonts scroll.
 *
 * Dev invites (`/dev/online`) skip this: they live on the in-memory server.
 */
import type { AuthProvider } from '@tavli/contracts';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { ActionButton } from '@/components/ActionButton';
import { useFocusOnShow } from '@/features/accessibility/focus';
import { useAnnouncement } from '@/features/game/useAnnouncement';
import { useOnlineAccount } from '@/features/online/account';

export interface InviteAccountGateProps {
  /** `undefined`: this build has no online server. */
  auth: AuthProvider | undefined;
  /** The invite, for the signed-in user `me`. */
  children: (me: string) => ReactNode;
  onHome: () => void;
}

export function InviteAccountGate({ auth, children, onHome }: InviteAccountGateProps) {
  if (auth === undefined) {
    return (
      <Frame>
        <OffCard onHome={onHome} />
      </Frame>
    );
  }
  return (
    <SignedInGate auth={auth} onHome={onHome}>
      {children}
    </SignedInGate>
  );
}

function SignedInGate({ auth, children, onHome }: InviteAccountGateProps & { auth: AuthProvider }) {
  const { account, signIn } = useOnlineAccount(auth);
  if (account.status === 'signedIn') return <>{children(account.me)}</>;
  return (
    <Frame>
      {account.status === 'loading' ? (
        <Loading />
      ) : (
        <AccountCard
          busy={account.status === 'signingIn'}
          failed={account.status === 'failed'}
          onShow={signIn}
          onHome={onHome}
        />
      )}
    </Frame>
  );
}

function Frame({ children }: { children: ReactNode }) {
  return (
    <ScrollView
      testID="invite-account-gate"
      style={styles.screen}
      contentContainerStyle={styles.content}>
      {children}
    </ScrollView>
  );
}

function Loading() {
  const { t } = useTranslation();
  const titleRef = useFocusOnShow();
  return (
    <View testID="invite-account-loading" style={styles.loading}>
      <ActivityIndicator />
      <Text ref={titleRef} style={styles.line} accessibilityRole="header">
        {t('invite.loading')}
      </Text>
    </View>
  );
}

interface AccountCardProps {
  busy: boolean;
  failed: boolean;
  onShow: () => void;
  onHome: () => void;
}

function AccountCard({ busy, failed, onShow, onHome }: AccountCardProps) {
  const { t } = useTranslation();
  const titleRef = useFocusOnShow();
  const title = t('invite.account.title');
  const body = t('invite.account.body');
  useAnnouncement(`${title} ${body}`);
  return (
    <View testID="invite-account" style={styles.card}>
      <Text ref={titleRef} style={styles.title} accessibilityRole="header">
        {title}
      </Text>
      <Text style={styles.line}>{body}</Text>
      <View style={styles.actions}>
        <ActionButton
          testID="invite-account-show"
          label={t('invite.account.show')}
          disabled={busy}
          onPress={onShow}
        />
        <ActionButton
          testID="invite-home"
          kind="secondary"
          label={t('invite.home')}
          onPress={onHome}
        />
      </View>
      {busy ? <Text style={styles.line}>{t('invite.account.busy')}</Text> : null}
      {failed ? (
        <Text testID="invite-account-failed" style={styles.line} accessibilityRole="alert">
          {t('invite.account.failed')}
        </Text>
      ) : null}
    </View>
  );
}

function OffCard({ onHome }: { onHome: () => void }) {
  const { t } = useTranslation();
  const titleRef = useFocusOnShow();
  const title = t('invite.off.title');
  const body = t('invite.off.body');
  useAnnouncement(`${title} ${body}`);
  return (
    <View testID="invite-off" style={styles.card}>
      <Text ref={titleRef} style={styles.title} accessibilityRole="header">
        {title}
      </Text>
      <Text style={styles.line}>{body}</Text>
      <View style={styles.actions}>
        <ActionButton testID="invite-home" label={t('invite.home')} onPress={onHome} />
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
  actions: {
    gap: theme.space.sm,
    marginTop: theme.space.sm,
  },
}));

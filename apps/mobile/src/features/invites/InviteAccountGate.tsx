/**
 * Before a friend sees an invite on our server (#281): the server shows an
 * invite only to a signed-in user, and online play needs an account.
 *
 * - A saved session (this phone made or opened an invite before) shows
 *   the invite at once (`children`).
 * - Else a card says that an online game needs a free account, with the
 *   sign-in choices (#401, `SignInChoices`): Apple, Continue as a guest,
 *   and Not now (Home). Opening a link alone makes no account. The invite
 *   code stays in the route, so the invite shows right after the sign-in.
 * - A build with no online server shows "Online play is off".
 * - Screen readers: each card moves focus to its title and is read once.
 *   Large fonts scroll.
 *
 * Dev invites (`/dev/online`) skip this: they live on the in-memory server.
 */
import type { Analytics, AppleSheet, AuthProvider } from '@tavli/contracts';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { ActionButton } from '@/components/ActionButton';
import { useFocusOnShow } from '@/features/accessibility/focus';
import { useAnnouncement } from '@/features/game/useAnnouncement';
import { useOnlineAccount } from '@/features/online/account';
import { SignInChoices } from '@/features/online/SignInChoices';

export interface InviteAccountGateProps {
  /** `undefined`: this build has no online server. */
  auth: AuthProvider | undefined;
  /** The invite, for the signed-in user `me`. */
  children: (me: string) => ReactNode;
  onHome: () => void;
  /** For tests. Default: the app's. */
  appleSheet?: AppleSheet;
  /** For tests. Default: the app's analytics. */
  analytics?: Analytics;
}

export function InviteAccountGate({ auth, children, onHome, ...more }: InviteAccountGateProps) {
  if (auth === undefined) {
    return (
      <Frame>
        <OffCard onHome={onHome} />
      </Frame>
    );
  }
  return (
    <SignedInGate auth={auth} onHome={onHome} {...more}>
      {children}
    </SignedInGate>
  );
}

function SignedInGate({
  auth,
  children,
  onHome,
  appleSheet,
  analytics,
}: InviteAccountGateProps & { auth: AuthProvider }) {
  const { account, signedIn } = useOnlineAccount(auth);
  if (account.status === 'signedIn') return <>{children(account.me)}</>;
  return (
    <Frame>
      {account.status === 'loading' ? (
        <Loading />
      ) : (
        <AccountCard>
          <SignInChoices
            auth={auth}
            onSignedIn={signedIn}
            onNotNow={onHome}
            {...(appleSheet === undefined ? {} : { appleSheet })}
            {...(analytics === undefined ? {} : { analytics })}
          />
        </AccountCard>
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

/** The invite card over the sign-in choices (`children`). */
function AccountCard({ children }: { children: ReactNode }) {
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
      <View style={styles.actions}>{children}</View>
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

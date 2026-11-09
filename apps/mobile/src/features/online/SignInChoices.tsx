/**
 * The sign-in choices for online play (#401, ADR-0008): Apple first, then
 * Continue as a guest, then Not now. The invite card
 * (`InviteAccountGate`) and the sheet of Play a friend (`SignInSheet`)
 * show them, under their own title.
 *
 * - Apple's own button shows only where Apple's sheet works (iPhone).
 *   Apple on Android needs a browser flow on the server: later.
 * - Not now signs in nothing: the caller closes or goes Home.
 * - A problem line is read to screen readers (`useAnnouncement`; iOS
 *   VoiceOver does not read `accessibilityRole="alert"`). No text has a
 *   line limit, so large fonts wrap.
 */
import type { Analytics, AppleSheet, AuthProvider, AuthUser } from '@tavli/contracts';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { ActionButton } from '@/components/ActionButton';
import { useAnnouncement } from '@/features/game/useAnnouncement';
import {
  analytics as appAnalytics,
  appleSheet as appAppleSheet,
  AppleSignInButton,
} from '@/services';

import { useSignInChoices } from './signIn';

export interface SignInChoicesProps {
  auth: AuthProvider;
  onSignedIn: (user: AuthUser) => void;
  onNotNow: () => void;
  /** For tests. Default: the app's. */
  appleSheet?: AppleSheet;
  /** For tests. Default: the app's analytics. */
  analytics?: Analytics;
}

export function SignInChoices({
  auth,
  onSignedIn,
  onNotNow,
  appleSheet = appAppleSheet,
  analytics = appAnalytics,
}: SignInChoicesProps) {
  const { t } = useTranslation();
  const { theme } = useUnistyles();
  const { appleAvailable, busy, failed, choose } = useSignInChoices({
    auth,
    appleSheet,
    analytics,
    onSignedIn,
  });
  useAnnouncement(failed ? t('signIn.failed') : null);
  return (
    <View testID="sign-in-choices" style={styles.choices}>
      {appleAvailable ? (
        <View style={styles.choice}>
          <AppleSignInButton
            testID="sign-in-apple"
            // The app has one set of colors, and it is dark.
            dark
            cornerRadius={theme.radii.lg}
            style={styles.apple}
            onPress={() => choose('apple')}
          />
          <Text style={styles.note}>{t('signIn.appleNote')}</Text>
        </View>
      ) : null}
      <View style={styles.choice}>
        <ActionButton
          testID="sign-in-guest"
          kind={appleAvailable ? 'secondary' : 'primary'}
          label={t('signIn.guest')}
          disabled={busy !== null}
          onPress={() => choose('guest')}
        />
        <Text style={styles.note}>{t('signIn.guestNote')}</Text>
      </View>
      <ActionButton
        testID="sign-in-not-now"
        kind="text"
        label={t('signIn.notNow')}
        onPress={onNotNow}
      />
      {busy !== null ? <Text style={styles.line}>{t('signIn.busy')}</Text> : null}
      {failed ? (
        <Text testID="sign-in-failed" style={styles.line}>
          {t('signIn.failed')}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  choices: {
    gap: theme.space.md,
  },
  choice: {
    gap: theme.space.xs,
  },
  // Apple's button draws nothing without a height and a width.
  apple: {
    width: '100%',
    height: theme.touch.button,
  },
  note: {
    ...theme.type.caption,
    color: theme.colors.textDim,
  },
  line: {
    ...theme.type.body,
    color: theme.colors.text,
  },
}));

/**
 * The sign-in choices for online play (#401, #433, ADR-0008): Apple
 * first, then Continue with email, Continue as a guest, and Not now. The
 * invite card (`InviteAccountGate`) and the sheet of Play a friend
 * (`SignInSheet`) show them, under their own title.
 *
 * - Apple's own button shows only where Apple's sheet works (iPhone).
 *   Apple on Android needs a browser flow on the server: later. There
 *   the email is the main button.
 * - Continue with email shows the email code step (`EmailCodeForm`) in
 *   place of the choices; its Back shows the choices again. The caller
 *   (and the invite in its route) stays the same all the while.
 * - Not now signs in nothing: the caller closes or goes Home.
 * - After a sign-in with a key, a saved account with no username yet sees
 *   the username step (`UsernameForm`, #405) in place of the choices; its
 *   Save or Not now hands the user on.
 * - A failed try shows the problem box (`ProblemCard`, #462) in place of
 *   the choices, with its title, what to do and OK; OK shows the choices
 *   again. The box takes the screen reader's focus. No text has a line
 *   limit, so large fonts wrap.
 */
import type { Analytics, AppleSheet, AuthProvider, AuthUser, Usernames } from '@tavli/contracts';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { ActionButton } from '@/components/ActionButton';
import { ProblemCard } from '@/components/Problem';
import {
  analytics as appAnalytics,
  appleSheet as appAppleSheet,
  AppleSignInButton,
  usernames as appUsernames,
} from '@/services';

import { EmailCodeForm } from './EmailCodeForm';
import { useSignInChoices } from './signIn';
import { UsernameForm } from './UsernameForm';

export interface SignInChoicesProps {
  auth: AuthProvider;
  onSignedIn: (user: AuthUser) => void;
  onNotNow: () => void;
  /** For tests. Default: the app's. */
  appleSheet?: AppleSheet;
  /** For tests. Default: the app's analytics. */
  analytics?: Analytics;
  /** For tests. Default: the app's. */
  usernames?: Usernames | undefined;
}

export function SignInChoices({
  auth,
  onSignedIn,
  onNotNow,
  appleSheet = appAppleSheet,
  analytics = appAnalytics,
  usernames = appUsernames,
}: SignInChoicesProps) {
  const { t } = useTranslation();
  const { theme } = useUnistyles();
  const [withEmailForm, setWithEmailForm] = useState(false);
  const { appleAvailable, busy, failed, dismissFailed, choose, withEmail, step, finishStep } =
    useSignInChoices({
      auth,
      appleSheet,
      analytics,
      onSignedIn,
      usernames,
    });
  if (step !== null && usernames !== undefined) {
    return (
      <UsernameForm
        usernames={usernames}
        mine={step.mine}
        title={t('username.title')}
        onDone={finishStep}
        onNotNow={finishStep}
      />
    );
  }
  if (failed !== null) {
    return (
      <ProblemCard
        testID="sign-in-failed"
        problem={{
          title: t(`signIn.problem.${failed}.title`),
          text: t(`signIn.problem.${failed}.text`),
        }}
        okLabel={t('problem.ok')}
        onOk={dismissFailed}
      />
    );
  }
  if (withEmailForm) {
    return (
      <EmailCodeForm
        auth={auth}
        title={t('emailCode.title')}
        onCode={withEmail}
        onBack={() => setWithEmailForm(false)}
        backLabel={t('emailCode.back')}
      />
    );
  }
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
          testID="sign-in-email"
          kind={appleAvailable ? 'secondary' : 'primary'}
          label={t('signIn.email')}
          disabled={busy !== null}
          onPress={() => setWithEmailForm(true)}
        />
        <Text style={styles.note}>{t('signIn.emailNote')}</Text>
      </View>
      <View style={styles.choice}>
        <ActionButton
          testID="sign-in-guest"
          kind="secondary"
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

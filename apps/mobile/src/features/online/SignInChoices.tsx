/**
 * The sign-in choices for online play (#401, #433, ADR-0008), in the
 * Figma pass look (#519, frame 09): three lines on what a saved account
 * gives, then Apple's white button, Continue with email and Continue as a
 * guest (a text button), then one footnote with a link to the privacy
 * policy. The invite card (`InviteAccountGate`) and the sheet of Play a
 * friend (`SignInSheet`) show them under a `SignInHeader`, whose close
 * button is **Not now** (it signs in nothing).
 *
 * - Apple's own button shows only where Apple's sheet works (iPhone).
 *   Apple on Android needs a browser flow on the server: later. There
 *   the email is the main button.
 * - Continue with email shows the email code step (`EmailCodeForm`) in
 *   place of the choices; its Back shows the choices again. The caller
 *   (and the invite in its route) stays the same all the while.
 * - The full list of what a saved account gives (`AccountBenefits`) is in
 *   Settings → Account; here only three short lines (`SIGN_IN_BENEFITS`).
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
import { Linking, Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { ActionButton } from '@/components/ActionButton';
import { Icon } from '@/components/Icon';
import type { IconName } from '@/components/icons';
import { ProblemCard } from '@/components/Problem';
import { PRIVACY_POLICY_URL } from '@/features/privacy/consent';
import {
  analytics as appAnalytics,
  appleSheet as appAppleSheet,
  AppleSignInButton,
  usernames as appUsernames,
} from '@/services';

import { EmailCodeForm } from './EmailCodeForm';
import { useSignInChoices } from './signIn';
import { UsernameForm } from './UsernameForm';

export type SignInBenefit = 'username' | 'anyPhone' | 'ratings';

/** The three short lines above the buttons. Each id names `signIn.benefits.<id>`. */
export const SIGN_IN_BENEFITS: readonly { readonly id: SignInBenefit; readonly icon: IconName }[] =
  [
    { id: 'username', icon: 'user' },
    { id: 'anyPhone', icon: 'smartphone' },
    { id: 'ratings', icon: 'trophy' },
  ];

export interface SignInChoicesProps {
  auth: AuthProvider;
  onSignedIn: (user: AuthUser) => void;
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
      <View testID="sign-in-benefits" style={styles.benefits}>
        {SIGN_IN_BENEFITS.map(({ id, icon }) => (
          <View key={id} style={styles.benefit}>
            <Icon name={icon} size={22} color={theme.colors.accentLight} />
            <Text style={styles.benefitText}>{t(`signIn.benefits.${id}`)}</Text>
          </View>
        ))}
      </View>
      <View style={styles.buttons}>
        {appleAvailable ? (
          <AppleSignInButton
            testID="sign-in-apple"
            // The app has one set of colors, and it is dark: Apple's white button.
            dark
            cornerRadius={theme.radii.lg}
            style={styles.apple}
            onPress={() => choose('apple')}
          />
        ) : null}
        <ActionButton
          testID="sign-in-email"
          kind={appleAvailable ? 'secondary' : 'primary'}
          icon="mail"
          label={t('signIn.email')}
          disabled={busy !== null}
          onPress={() => setWithEmailForm(true)}
        />
        <ActionButton
          testID="sign-in-guest"
          kind="text"
          label={t('signIn.guest')}
          disabled={busy !== null}
          onPress={() => choose('guest')}
        />
      </View>
      {busy !== null ? <Text style={styles.line}>{t('signIn.busy')}</Text> : null}
      <Text testID="sign-in-footnote" style={styles.footnote}>
        {`${t('signIn.footnote')} `}
        <Text
          testID="sign-in-privacy"
          accessibilityRole="link"
          style={styles.link}
          onPress={() => void Linking.openURL(PRIVACY_POLICY_URL).catch(() => undefined)}>
          {t('signIn.privacy')}
        </Text>
      </Text>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  choices: {
    gap: theme.space.lg,
  },
  benefits: {
    gap: theme.space.md,
    paddingHorizontal: theme.space.xs,
    paddingVertical: theme.space.xxs,
  },
  benefit: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.md,
  },
  benefitText: {
    ...theme.type.body,
    flex: 1,
    color: theme.colors.text,
  },
  buttons: {
    // 10 pt between the buttons (Figma frame 09).
    gap: theme.space.sm + theme.space.xxs,
  },
  // Apple's button draws nothing without a height and a width.
  apple: {
    width: '100%',
    height: theme.touch.button,
  },
  line: {
    ...theme.type.body,
    color: theme.colors.text,
  },
  footnote: {
    ...theme.type.footnote,
    paddingHorizontal: theme.space.sm,
    textAlign: 'center',
    color: theme.colors.textDim,
  },
  link: {
    color: theme.colors.accentLight,
  },
}));

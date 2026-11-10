import { useTranslation } from 'react-i18next';
import { Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { ActionButton } from '@/components/ActionButton';
import { Screen } from '@/components/Screen';
import { PRIVACY_POLICY_URL } from '@/features/privacy/consent';
import { useConsent } from '@/features/privacy/consentStore';
import { whatsNewSeen } from '@/features/whats-new/seen';

import { useBoardStep } from './boardStepStore';
import { WelcomeTop } from './WelcomeTop';

export interface WelcomeConsentScreenProps {
  onBack: () => void;
  /** After the answer is saved: the route opens the board step when it is due (#350). */
  onAnswered?: () => void;
}

/**
 * First launch, step 2 (wireframe 02): ask before any usage data is sent
 * (GDPR, #61). "Allow" and "Don't allow" look the same: refusing is as easy
 * as accepting. "Don't allow" stops usage data and crash reports (the one
 * switch, `features/privacy`). Closing the app without an answer sends no
 * usage data, only anonymous crash reports, and this screen shows again on
 * the next launch. The first answer makes the board step due (#350), so
 * the route opens it next. Without a board step, the answer itself leaves
 * this screen: the root layout's guard opens Home.
 */
export function WelcomeConsentScreen({ onBack, onAnswered }: WelcomeConsentScreenProps) {
  const { t } = useTranslation();
  const setConsent = useConsent((s) => s.setConsent);
  const beginBoardStep = useBoardStep((s) => s.begin);
  // A player who passed the board step before (a new consent text asks
  // again) has two steps; a new player three.
  const total = useBoardStep((s) => s.status) === 'done' ? 2 : 3;

  const answer = (granted: boolean) => {
    // Before the answer: the guard must never see the consent answered
    // while the board step is not due yet, or it opens Home at once.
    beginBoardStep();
    // A new player has seen every release of What's new (#471).
    whatsNewSeen.begin();
    setConsent(granted);
    onAnswered?.();
  };

  const collect = [
    t('welcome.privacy.collect.modes'),
    t('welcome.privacy.collect.games'),
    t('welcome.privacy.collect.settings'),
    t('welcome.privacy.collect.crashes'),
  ];

  return (
    <Screen testID="welcome-consent">
      <WelcomeTop
        onBack={onBack}
        backTestID="welcome-consent-back"
        step={t('welcome.privacy.step', { step: 2, total })}
      />

      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
        <View style={styles.picture} importantForAccessibility="no-hide-descendants">
          <View style={styles.bar(0.4)} />
          <View style={styles.bar(0.7)} />
          <View style={styles.bar(1)} />
        </View>
        <Text style={styles.title} accessibilityRole="header">
          {t('welcome.privacy.title')}
        </Text>
        <Text style={styles.text}>{t('welcome.privacy.intro')}</Text>
        <View style={styles.list}>
          {collect.map((item) => (
            <Text key={item} style={styles.text}>
              {`•  ${item}`}
            </Text>
          ))}
        </View>
        <Text style={styles.text}>{t('welcome.privacy.never')}</Text>
        <Pressable
          testID="welcome-consent-policy"
          accessibilityRole="link"
          onPress={() => void Linking.openURL(PRIVACY_POLICY_URL).catch(() => undefined)}
          style={({ pressed }) => [styles.policy, pressed && styles.pressed]}>
          <Text style={styles.policyText}>{`${t('welcome.privacy.policy')} ›`}</Text>
        </Pressable>
      </ScrollView>

      {/* Same kind for both: no nudge. */}
      <View style={styles.buttons}>
        <ActionButton
          testID="welcome-consent-allow"
          kind="secondary"
          label={t('welcome.privacy.allow')}
          onPress={() => answer(true)}
        />
        <ActionButton
          testID="welcome-consent-deny"
          kind="secondary"
          label={t('welcome.privacy.deny')}
          onPress={() => answer(false)}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  pressed: {
    opacity: 0.7,
  },
  body: {
    flex: 1,
  },
  bodyContent: {
    paddingHorizontal: theme.space.xl,
    paddingVertical: theme.space.lg,
    gap: theme.space.md,
  },
  picture: {
    alignSelf: 'center',
    width: 96,
    height: 88,
    borderRadius: theme.radii.xl,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    boxShadow: '0px 8px 20px rgba(0, 0, 0, 0.3)',
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: theme.space.xs,
    paddingBottom: theme.space.md,
    marginBottom: theme.space.sm,
  },
  bar: (height: number) => ({
    width: 12,
    height: 48 * height,
    borderRadius: 2,
    backgroundColor: theme.colors.accent,
  }),
  title: {
    ...theme.type.display,
    fontSize: 30,
    lineHeight: 36,
    color: theme.colors.text,
  },
  text: {
    ...theme.type.body,
    color: theme.colors.textDim,
  },
  list: {
    gap: theme.space.xxs,
  },
  policy: {
    alignSelf: 'flex-start',
    minHeight: theme.touch.minTarget,
    justifyContent: 'center',
  },
  policyText: {
    ...theme.type.bodyStrong,
    color: theme.colors.text,
    textDecorationLine: 'underline',
  },
  buttons: {
    gap: theme.space.sm,
    paddingHorizontal: theme.space.xl,
    paddingTop: theme.space.sm,
    paddingBottom: rt.insets.bottom + theme.space.lg,
  },
}));

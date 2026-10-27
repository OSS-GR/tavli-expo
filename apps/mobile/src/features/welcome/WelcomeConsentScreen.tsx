import { useTranslation } from 'react-i18next';
import { Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { ActionButton } from '@/components/ActionButton';
import { PRIVACY_POLICY_URL } from '@/features/privacy/consent';
import { useConsent } from '@/features/privacy/consentStore';

export interface WelcomeConsentScreenProps {
  onBack: () => void;
  /** After the user answered. */
  onDone: () => void;
}

/**
 * First launch, step 2 (wireframe 02): ask before any usage data is sent
 * (GDPR, #61). "Allow" and "Don't allow" look the same: refusing is as easy
 * as accepting. "Don't allow" stops usage data and crash reports (the one
 * switch, `features/privacy`). Closing the app without an answer sends no
 * usage data, only anonymous crash reports, and this screen shows again on
 * the next launch.
 */
export function WelcomeConsentScreen({ onBack, onDone }: WelcomeConsentScreenProps) {
  const { t } = useTranslation();
  const setConsent = useConsent((s) => s.setConsent);

  const answer = (granted: boolean) => {
    setConsent(granted);
    onDone();
  };

  const collect = [
    t('welcome.privacy.collect.modes'),
    t('welcome.privacy.collect.games'),
    t('welcome.privacy.collect.settings'),
    t('welcome.privacy.collect.crashes'),
  ];

  return (
    <View testID="welcome-consent" style={styles.screen}>
      <View style={styles.topBar}>
        <Pressable
          testID="welcome-consent-back"
          accessibilityRole="button"
          accessibilityLabel={t('welcome.privacy.back')}
          hitSlop={8}
          onPress={onBack}
          style={({ pressed }) => [styles.back, pressed && styles.pressed]}>
          <Text style={styles.backIcon} importantForAccessibility="no">
            {'‹'}
          </Text>
        </Pressable>
        <Text style={styles.step}>{t('welcome.privacy.step', { step: 2, total: 2 })}</Text>
      </View>

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
    </View>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  screen: {
    flex: 1,
    backgroundColor: theme.colors.background,
    paddingTop: rt.insets.top + theme.space.sm,
    paddingBottom: rt.insets.bottom + theme.space.lg,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.space.lg,
  },
  back: {
    width: theme.touch.minTarget,
    height: theme.touch.minTarget,
    borderRadius: theme.touch.minTarget / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surface,
  },
  backIcon: {
    fontSize: 32,
    lineHeight: 34,
    color: theme.colors.text,
  },
  pressed: {
    opacity: 0.7,
  },
  step: {
    ...theme.type.caption,
    color: theme.colors.textDim,
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
    borderRadius: theme.radii.lg,
    borderWidth: 2,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
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
    backgroundColor: theme.colors.textDim,
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
  },
}));

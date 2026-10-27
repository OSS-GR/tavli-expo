import { useLocales } from 'expo-localization';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { ActionButton } from '@/components/ActionButton';
import { OptionList, type ListOption } from '@/components/settings/OptionList';
import { useSettings } from '@/features/settings/store';
import { LANGUAGES, pickDeviceLanguage, resolveLanguage, type AppLanguage } from '@/i18n/languages';

export interface WelcomeLanguageScreenProps {
  onContinue: () => void;
}

/**
 * First launch, step 1 (wireframe 01): pick Greek or English. The phone's
 * language is picked at first. The app switches language at once.
 */
export function WelcomeLanguageScreen({ onContinue }: WelcomeLanguageScreenProps) {
  const { t } = useTranslation();
  const locales = useLocales();
  const preference = useSettings((s) => s.language);
  const setSetting = useSettings((s) => s.setSetting);

  const phone = pickDeviceLanguage(locales.map((locale) => locale.languageCode));
  const current = resolveLanguage(preference, [phone]);
  // The title in both languages: the current one first.
  const other: AppLanguage = current === 'el' ? 'en' : 'el';

  const options: ListOption<AppLanguage>[] = LANGUAGES.map((code) => ({
    value: code,
    label: t(`languages.${code}`),
    ...(code === phone ? { hint: t('welcome.language.phoneLanguage') } : {}),
  }));

  return (
    <View testID="welcome-language" style={styles.screen}>
      <View style={styles.brand}>
        <View style={styles.logo} importantForAccessibility="no" />
        <Text style={styles.appName} accessibilityRole="header">
          {t('home.title', { lng: 'en' })}
        </Text>
        <Text style={styles.appNameAlt}>{t('home.title', { lng: 'el' })}</Text>
      </View>

      <View style={styles.choice}>
        <Text style={styles.title} accessibilityRole="header">
          {t('welcome.language.title', { lng: current })}
        </Text>
        <Text style={styles.titleAlt}>{t('welcome.language.title', { lng: other })}</Text>
        <OptionList
          testID="welcome-language-options"
          label={t('welcome.language.title')}
          options={options}
          value={current}
          // Picking the phone's language keeps "Phone language" in Settings.
          onChange={(code) => setSetting('language', code === phone ? 'system' : code)}
        />
        <Text style={styles.note}>{t('welcome.language.note')}</Text>
      </View>

      <ActionButton
        testID="welcome-language-continue"
        label={t('welcome.language.continue')}
        onPress={onContinue}
      />
    </View>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  screen: {
    flex: 1,
    backgroundColor: theme.colors.background,
    paddingTop: rt.insets.top + theme.space.xl,
    paddingBottom: rt.insets.bottom + theme.space.lg,
    paddingHorizontal: theme.space.xl,
    justifyContent: 'space-between',
    gap: theme.space.xl,
  },
  brand: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.space.xs,
  },
  logo: {
    width: 96,
    height: 96,
    borderRadius: theme.radii.lg,
    borderWidth: 2,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    marginBottom: theme.space.md,
  },
  appName: {
    ...theme.type.display,
    color: theme.colors.text,
  },
  appNameAlt: {
    ...theme.type.body,
    color: theme.colors.textDim,
  },
  choice: {
    gap: theme.space.sm,
  },
  title: {
    ...theme.type.title,
    color: theme.colors.text,
    textAlign: 'center',
  },
  titleAlt: {
    ...theme.type.body,
    color: theme.colors.textDim,
    textAlign: 'center',
    paddingBottom: theme.space.sm,
  },
  note: {
    ...theme.type.caption,
    color: theme.colors.textDim,
    textAlign: 'center',
    paddingTop: theme.space.sm,
  },
}));

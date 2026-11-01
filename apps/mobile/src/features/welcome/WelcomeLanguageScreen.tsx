import { useLocales } from 'expo-localization';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { ActionButton } from '@/components/ActionButton';
import { Screen } from '@/components/Screen';
import { OptionList, type ListOption } from '@/components/settings/OptionList';
import { useSettings } from '@/features/settings/store';
import { LANGUAGES, pickDeviceLanguage, resolveLanguage, type AppLanguage } from '@/i18n/languages';

import { WelcomeTop } from './WelcomeTop';

export interface WelcomeLanguageScreenProps {
  onContinue: () => void;
}

/**
 * First launch, step 1 (wireframe 01): pick Greek or English. The phone's
 * language is picked at first. The app switches language at once. The
 * logo and the app name sit on top as on the other steps (#362); the
 * choice sits in the middle and scrolls with a large font.
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
    <Screen testID="welcome-language">
      <WelcomeTop />
      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
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
      </ScrollView>

      <View style={styles.buttons}>
        <ActionButton
          testID="welcome-language-continue"
          kind="primary"
          label={t('welcome.language.continue')}
          onPress={onContinue}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  body: {
    flex: 1,
  },
  // The choice in the middle of the space; it scrolls when it does not fit.
  bodyContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: theme.space.xl,
    paddingVertical: theme.space.lg,
  },
  choice: {
    gap: theme.space.sm,
  },
  title: {
    ...theme.type.display,
    fontSize: 30,
    lineHeight: 36,
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
  buttons: {
    paddingHorizontal: theme.space.xl,
    paddingTop: theme.space.sm,
    paddingBottom: rt.insets.bottom + theme.space.lg,
  },
}));

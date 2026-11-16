import { useLocales } from 'expo-localization';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { ActionButton } from '@/components/ActionButton';
import { Icon } from '@/components/Icon';
import { Screen } from '@/components/Screen';
import { surfaceStyle } from '@/components/Surface';
import { useSettings } from '@/features/settings/store';
import { LANGUAGES, pickDeviceLanguage, resolveLanguage, type AppLanguage } from '@/i18n/languages';

import { useBoardStep } from './boardStepStore';
import { WelcomeTop } from './WelcomeTop';

export interface WelcomeLanguageScreenProps {
  onContinue: () => void;
}

/**
 * First launch, step 1 (Figma frame 12): pick Greek or English. The phone's
 * language is picked at first. The app switches language at once. Each
 * language is a large card with its name in its own script, a radio and a
 * brass edge on the pick. The choice scrolls with a large font; Continue
 * stays at the bottom.
 */
export function WelcomeLanguageScreen({ onContinue }: WelcomeLanguageScreenProps) {
  const { t } = useTranslation();
  const locales = useLocales();
  const preference = useSettings((s) => s.language);
  const setSetting = useSettings((s) => s.setSetting);
  // A player who passed the board step before (a new consent text asks
  // again) has two steps; a new player three.
  const total = useBoardStep((s) => s.status) === 'done' ? 2 : 3;

  const phone = pickDeviceLanguage(locales.map((locale) => locale.languageCode));
  const current = resolveLanguage(preference, [phone]);
  // The title in both languages: the current one first.
  const other: AppLanguage = current === 'el' ? 'en' : 'el';

  return (
    <Screen testID="welcome-language">
      <WelcomeTop step={1} total={total} />
      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
        <View style={styles.heading}>
          <LightChecker />
          <Text style={styles.title} accessibilityRole="header">
            {t('welcome.language.title', { lng: current })}
          </Text>
          <Text style={styles.titleAlt}>{t('welcome.language.title', { lng: other })}</Text>
        </View>
        <View
          testID="welcome-language-options"
          style={styles.cards}
          accessibilityRole="radiogroup"
          accessibilityLabel={t('welcome.language.title')}>
          {LANGUAGES.map((code) => {
            const name = t(`languages.${code}`);
            // The name in the app's language, unless it reads the same.
            const inAppLanguage = t(`welcome.language.names.${code}`);
            const hint =
              code === phone
                ? t('welcome.language.phoneLanguage')
                : inAppLanguage === name
                  ? undefined
                  : inAppLanguage;
            return (
              <LanguageCard
                key={code}
                testID={`welcome-language-options-${code}`}
                name={name}
                hint={hint}
                selected={code === current}
                // Picking the phone's language keeps "Phone language" in Settings.
                onPress={() => setSetting('language', code === phone ? 'system' : code)}
              />
            );
          })}
        </View>
        <Text style={styles.note}>{t('welcome.language.note')}</Text>
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

interface LanguageCardProps {
  name: string;
  hint?: string;
  selected: boolean;
  onPress: () => void;
  testID: string;
}

/** One language: a tray, or the raised card with a brass edge when picked. */
function LanguageCard({ name, hint, selected, onPress, testID }: LanguageCardProps) {
  const { theme } = useUnistyles();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="radio"
      accessibilityLabel={name}
      accessibilityHint={hint}
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={({ pressed }) => [styles.card(selected), pressed && styles.pressed]}>
      <View style={styles.cardText}>
        <Text style={styles.name}>{name}</Text>
        {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      </View>
      <View style={styles.radio(selected)}>
        {selected ? <Icon name="check" size={17} color={theme.colors.onAccent} /> : null}
      </View>
    </Pressable>
  );
}

/** A light checker seen from above, as the mark on top. It only decorates. */
function LightChecker() {
  return (
    <View
      style={styles.checker}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    />
  );
}

const CHECKER = 56;
const RADIO = 28;

const styles = StyleSheet.create((theme, rt) => ({
  body: {
    flex: 1,
  },
  bodyContent: {
    gap: theme.space.xl,
    paddingHorizontal: theme.space.lg,
    paddingTop: theme.space.xxxl,
    paddingBottom: theme.space.lg,
  },
  heading: {
    alignItems: 'center',
    gap: theme.space.sm,
  },
  checker: {
    width: CHECKER,
    height: CHECKER,
    borderRadius: CHECKER / 2,
    marginBottom: theme.space.xxs,
    borderWidth: 1,
    borderColor: theme.checker.lightEdge,
    backgroundColor: theme.checker.light,
    // The turned center, a lit ring around it, then the face.
    backgroundImage: `radial-gradient(circle closest-side, ${theme.avatar.bone.center} 0%, ${theme.avatar.bone.center} 54%, ${theme.avatar.bone.ring} 57%, ${theme.checker.light} 100%)`,
    boxShadow: '0px 2px 4px rgba(0, 0, 0, 0.5)',
  },
  title: {
    ...theme.type.display,
    color: theme.colors.text,
    textAlign: 'center',
  },
  titleAlt: {
    ...theme.type.title3,
    color: theme.colors.textDim,
    textAlign: 'center',
  },
  cards: {
    gap: theme.space.md,
  },
  card: (selected: boolean) => ({
    ...surfaceStyle(theme, selected ? 'raised' : 'tray'),
    // The pick gets a brass edge, not the hairline of a raised card.
    ...(selected ? { borderColor: theme.colors.accent } : {}),
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: theme.space.lg,
    paddingVertical: 18,
    // A tray has no border: the same space keeps both cards the same size.
    ...(selected ? {} : { borderWidth: 1, borderColor: 'transparent' }),
  }),
  pressed: {
    opacity: 0.7,
  },
  cardText: {
    flex: 1,
    gap: theme.space.xxs,
  },
  name: {
    ...theme.type.title1,
    color: theme.colors.text,
  },
  hint: {
    ...theme.type.callout,
    color: theme.colors.textDim,
  },
  radio: (selected: boolean) => ({
    width: RADIO,
    height: RADIO,
    borderRadius: RADIO / 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: selected ? theme.colors.accent : theme.colors.border,
    backgroundColor: selected ? theme.colors.accent : 'transparent',
  }),
  note: {
    ...theme.type.footnote,
    color: theme.colors.textDim,
    textAlign: 'center',
  },
  buttons: {
    paddingHorizontal: theme.space.lg,
    paddingTop: theme.space.sm,
    paddingBottom: rt.insets.bottom + theme.space.sm,
  },
}));

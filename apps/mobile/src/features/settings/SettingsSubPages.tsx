/**
 * The small pages of Settings (#501): Sound & haptics, Language, Move
 * list, Usage data and Turn notifications. Each holds one group that the
 * Settings index sums up in its row. Board & look and Gameplay have their
 * own files.
 */
import { useLocales } from 'expo-localization';
import { useTranslation } from 'react-i18next';
import { Linking } from 'react-native';

import { SectionCard, SectionRow } from '@/components/SectionCard';
import { OptionList, type ListOption } from '@/components/settings/OptionList';
import { SegmentedControl, type SegmentOption } from '@/components/settings/SegmentedControl';
import { ToggleRow } from '@/components/settings/ToggleRow';
import { TurnPushSettings } from '@/features/notifications/TurnPushSettings';
import type { TurnPushes } from '@/features/notifications/turnPushes';
import { PRIVACY_POLICY_URL } from '@/features/privacy/consent';
import { useConsent } from '@/features/privacy/consentStore';
import { pickDeviceLanguage, type LanguagePreference } from '@/i18n/languages';

import { BlockHint } from './SettingBlock';
import type { MoveListMode } from './settings';
import { SettingsPage } from './SettingsPage';
import { useSettings } from './store';

interface PageProps {
  onBack?: () => void;
}

/** Settings → Sound & haptics. */
export function SoundSettings({ onBack }: PageProps) {
  const { t } = useTranslation();
  const sound = useSettings((s) => s.sound);
  const haptics = useSettings((s) => s.haptics);
  const setSetting = useSettings((s) => s.setSetting);
  return (
    <SettingsPage
      title={t('settings.soundPage.title')}
      onBack={onBack}
      testID="settings-sound-screen"
      backTestID="settings-sound-back">
      <SectionCard>
        <ToggleRow
          testID="settings-sound"
          label={t('settings.sound.label')}
          hint={t('settings.sound.hint')}
          value={sound}
          onValueChange={(value) => setSetting('sound', value)}
        />
        <ToggleRow
          testID="settings-haptics"
          label={t('settings.haptics.label')}
          hint={t('settings.haptics.hint')}
          value={haptics}
          onValueChange={(value) => setSetting('haptics', value)}
        />
      </SectionCard>
    </SettingsPage>
  );
}

/** Settings → Language: the phone language, Greek or English. It applies at once. */
export function LanguageSettings({ onBack }: PageProps) {
  const { t } = useTranslation();
  const locales = useLocales();
  const language = useSettings((s) => s.language);
  const setSetting = useSettings((s) => s.setSetting);
  const phoneLanguage = pickDeviceLanguage(locales.map((locale) => locale.languageCode));
  const options: ListOption<LanguagePreference>[] = [
    {
      value: 'system',
      label: t('settings.language.system'),
      hint: t('settings.language.systemHint', { language: t(`languages.${phoneLanguage}`) }),
    },
    { value: 'el', label: t('languages.el') },
    { value: 'en', label: t('languages.en') },
  ];
  return (
    <SettingsPage
      title={t('settings.sections.language')}
      onBack={onBack}
      testID="settings-language-screen"
      backTestID="settings-language-back">
      <SectionCard>
        <OptionList
          testID="settings-language"
          label={t('settings.sections.language')}
          options={options}
          value={language}
          onChange={(value) => setSetting('language', value)}
        />
      </SectionCard>
    </SettingsPage>
  );
}

/** Settings → Move list (#134): a button for each move, for screen readers. */
export function MoveListSettings({ onBack }: PageProps) {
  const { t } = useTranslation();
  const moveList = useSettings((s) => s.moveList);
  const setSetting = useSettings((s) => s.setSetting);
  const options: SegmentOption<MoveListMode>[] = [
    { value: 'auto', label: t('settings.moveList.auto') },
    { value: 'on', label: t('settings.moveList.on') },
    { value: 'off', label: t('settings.moveList.off') },
  ];
  return (
    <SettingsPage
      title={t('settings.moveList.label')}
      onBack={onBack}
      testID="settings-move-list-screen"
      backTestID="settings-move-list-back">
      <SectionCard padded>
        <SegmentedControl
          testID="settings-move-list"
          label={t('settings.moveList.label')}
          options={options}
          value={moveList}
          onChange={(value) => setSetting('moveList', value)}
        />
        <BlockHint>{t(`settings.moveList.${moveList}Hint`)}</BlockHint>
      </SectionCard>
    </SettingsPage>
  );
}

/**
 * Settings → Usage data (#61): the one privacy switch. It saves the answer
 * in the consent store, not in Settings; crash reports follow it too.
 */
export function UsageDataSettings({ onBack }: PageProps) {
  const { t } = useTranslation();
  const shareUsageData = useConsent((s) => s.status === 'granted');
  const setConsent = useConsent((s) => s.setConsent);
  return (
    <SettingsPage
      title={t('settings.usageDataPage.title')}
      onBack={onBack}
      testID="settings-usage-data-screen"
      backTestID="settings-usage-data-back">
      <SectionCard>
        <ToggleRow
          testID="settings-usage-data"
          label={t('settings.usageData.label')}
          hint={t('settings.usageData.hint')}
          value={shareUsageData}
          onValueChange={setConsent}
        />
        <SectionRow
          testID="settings-usage-data-policy"
          label={t('settings.privacyPolicy')}
          accessibilityRole="link"
          onPress={() => void Linking.openURL(PRIVACY_POLICY_URL).catch(() => undefined)}
        />
      </SectionCard>
    </SettingsPage>
  );
}

/** Settings → Turn notifications (#285): the state and Turn on. */
export function NotificationSettings({ onBack, pushes }: PageProps & { pushes: TurnPushes }) {
  const { t } = useTranslation();
  return (
    <SettingsPage
      title={t('notifications.settings.label')}
      onBack={onBack}
      testID="settings-notifications-screen"
      backTestID="settings-notifications-back">
      <SectionCard>
        <TurnPushSettings pushes={pushes} />
      </SectionCard>
    </SettingsPage>
  );
}

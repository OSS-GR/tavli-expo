import type { TutorialGame } from '@tavli/contracts';
import { THEME_IDS } from '@tavli/ui';
import Constants from 'expo-constants';
import { useLocales } from 'expo-localization';
import { useTranslation } from 'react-i18next';
import { Linking, Pressable, ScrollView, Text } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { OptionList, type ListOption } from '@/components/settings/OptionList';
import { SegmentedControl, type SegmentOption } from '@/components/settings/SegmentedControl';
import { SettingsSection } from '@/components/settings/SettingsSection';
import { ToggleRow } from '@/components/settings/ToggleRow';
import type { BotSpeed } from '@/features/bot/botSpeed';
import { HistorySettings } from '@/features/history/HistorySettings';
import { PRIVACY_POLICY_URL } from '@/features/privacy/consent';
import { useConsent } from '@/features/privacy/consentStore';
import { TutorialSettings } from '@/features/tutorial/TutorialSettings';
import { pickDeviceLanguage, type LanguagePreference } from '@/i18n/languages';

import { BoardThemePicker } from './BoardThemePicker';
import { BoardLayoutPicker } from './BoardLayoutPicker';
import { HomeBoardSidePicker } from './HomeBoardSidePicker';
import type { BoardFlipMode, MoveListMode } from './settings';
import { useSettings } from './store';

/** Pass-and-play board views. Face-to-face is shown but locked until it ships. */
type BoardViewOption = BoardFlipMode | 'faceToFace';

/**
 * Settings (wireframe 10, issue #37). Every change saves at once.
 * Layout follows `docs/design/wireframes.md`. Privacy (#61) saves the usage
 * data answer in the consent store, not in Settings.
 */
export interface SettingsScreenProps {
  /**
   * Opens the lessons of a game (#128, #159): "Learn to play" lets the
   * player pick Portes, Plakoto, Fevga or Asodio. The Help section shows
   * only with it.
   */
  onLearnToPlay?: (game: TutorialGame) => void;
  /** Opens the match history (#142). The History section shows only with it. */
  onHistory?: () => void;
}

export function SettingsScreen({ onLearnToPlay, onHistory }: SettingsScreenProps = {}) {
  const { t } = useTranslation();
  const locales = useLocales();

  const sound = useSettings((s) => s.sound);
  const haptics = useSettings((s) => s.haptics);
  const language = useSettings((s) => s.language);
  const autoConfirmMoves = useSettings((s) => s.autoConfirmMoves);
  const showPipCounts = useSettings((s) => s.showPipCounts);
  const showHints = useSettings((s) => s.showHints);
  const boardFlipMode = useSettings((s) => s.boardFlipMode);
  const theme = useSettings((s) => s.theme);
  const moveList = useSettings((s) => s.moveList);
  const botSpeed = useSettings((s) => s.botSpeed);
  const setSetting = useSettings((s) => s.setSetting);
  const shareUsageData = useConsent((s) => s.status === 'granted');
  const setConsent = useConsent((s) => s.setConsent);

  const phoneLanguage = pickDeviceLanguage(locales.map((locale) => locale.languageCode));

  const boardViewOptions: SegmentOption<BoardViewOption>[] = [
    { value: 'flip', label: t('settings.boardView.flip') },
    {
      value: 'faceToFace',
      label: t('settings.boardView.faceToFace'),
      disabled: true,
      accessibilityHint: t('common.comingSoon'),
    },
    { value: 'fixed', label: t('settings.boardView.fixed') },
  ];

  const languageOptions: ListOption<LanguagePreference>[] = [
    {
      value: 'system',
      label: t('settings.language.system'),
      hint: t('settings.language.systemHint', { language: t(`languages.${phoneLanguage}`) }),
    },
    { value: 'el', label: t('languages.el') },
    { value: 'en', label: t('languages.en') },
  ];

  const moveListOptions: SegmentOption<MoveListMode>[] = [
    { value: 'auto', label: t('settings.moveList.auto') },
    { value: 'on', label: t('settings.moveList.on') },
    { value: 'off', label: t('settings.moveList.off') },
  ];

  const botSpeedOptions: SegmentOption<BotSpeed>[] = [
    { value: 'slow', label: t('settings.botSpeed.slow') },
    { value: 'normal', label: t('settings.botSpeed.normal') },
    { value: 'fast', label: t('settings.botSpeed.fast') },
  ];

  const themeOptions = THEME_IDS.map((id) => ({ value: id, label: t(`themes.${id}`) }));

  const version = Constants.expoConfig?.version ?? '';

  return (
    <ScrollView
      testID="settings-screen"
      style={styles.screen}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic">
      <SettingsSection title={t('settings.sections.game')}>
        <ToggleRow
          testID="settings-auto-confirm"
          label={t('settings.autoConfirm.label')}
          hint={t('settings.autoConfirm.hint')}
          value={autoConfirmMoves}
          onValueChange={(value) => setSetting('autoConfirmMoves', value)}
        />
        <ToggleRow
          testID="settings-pip-counts"
          label={t('settings.pipCounts.label')}
          hint={t('settings.pipCounts.hint')}
          value={showPipCounts}
          onValueChange={(value) => setSetting('showPipCounts', value)}
        />
        <ToggleRow
          testID="settings-hints"
          label={t('settings.hints.label')}
          hint={t('settings.hints.hint')}
          value={showHints}
          onValueChange={(value) => setSetting('showHints', value)}
        />
        <Text style={styles.label}>{t('settings.boardView.label')}</Text>
        <SegmentedControl
          testID="settings-board-view"
          label={t('settings.boardView.label')}
          options={boardViewOptions}
          value={boardFlipMode}
          onChange={(value) => {
            if (value !== 'faceToFace') {
              setSetting('boardFlipMode', value);
            }
          }}
        />
        <Text style={styles.hint}>
          {boardFlipMode === 'flip'
            ? t('settings.boardView.flipHint')
            : t('settings.boardView.fixedHint')}
        </Text>
        <Text style={styles.hint}>{t('settings.boardView.faceToFaceSoon')}</Text>
        <Text style={styles.label}>{t('settings.botSpeed.label')}</Text>
        <SegmentedControl
          testID="settings-bot-speed"
          label={t('settings.botSpeed.label')}
          options={botSpeedOptions}
          value={botSpeed}
          onChange={(value) => setSetting('botSpeed', value)}
        />
        <Text style={styles.hint}>{t(`settings.botSpeed.${botSpeed}Hint`)}</Text>
      </SettingsSection>

      <SettingsSection title={t('settings.sections.soundAndFeel')}>
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
      </SettingsSection>

      <SettingsSection title={t('settings.sections.language')}>
        <OptionList
          testID="settings-language"
          label={t('settings.sections.language')}
          options={languageOptions}
          value={language}
          onChange={(value) => setSetting('language', value)}
        />
      </SettingsSection>

      <SettingsSection title={t('settings.sections.board')}>
        <BoardThemePicker testID="settings-board-theme" />
        <BoardLayoutPicker testID="settings-board-layout" />
        <HomeBoardSidePicker testID="settings-home-board" />
      </SettingsSection>

      <SettingsSection title={t('settings.sections.look')}>
        <Text style={styles.label}>{t('settings.theme.label')}</Text>
        <OptionList
          testID="settings-theme"
          label={t('settings.theme.label')}
          options={themeOptions}
          value={theme}
          onChange={(value) => setSetting('theme', value)}
        />
        <Text style={styles.hint}>{t('settings.theme.hint')}</Text>
      </SettingsSection>

      <SettingsSection title={t('settings.sections.accessibility')}>
        <Text style={styles.label}>{t('settings.moveList.label')}</Text>
        <SegmentedControl
          testID="settings-move-list"
          label={t('settings.moveList.label')}
          options={moveListOptions}
          value={moveList}
          onChange={(value) => setSetting('moveList', value)}
        />
        <Text style={styles.hint}>{t(`settings.moveList.${moveList}Hint`)}</Text>
      </SettingsSection>

      {onLearnToPlay ? (
        <SettingsSection title={t('settings.sections.help')}>
          <TutorialSettings onOpen={onLearnToPlay} />
        </SettingsSection>
      ) : null}

      {onHistory ? (
        <SettingsSection title={t('settings.sections.history')}>
          <HistorySettings onOpen={onHistory} />
        </SettingsSection>
      ) : null}

      <SettingsSection title={t('settings.sections.privacy')}>
        <ToggleRow
          testID="settings-usage-data"
          label={t('settings.usageData.label')}
          hint={t('settings.usageData.hint')}
          value={shareUsageData}
          onValueChange={setConsent}
        />
        <Pressable
          testID="settings-privacy-policy"
          accessibilityRole="link"
          onPress={() => void Linking.openURL(PRIVACY_POLICY_URL).catch(() => undefined)}
          style={({ pressed }) => [styles.link, pressed && styles.pressed]}>
          <Text style={styles.linkText}>{`${t('settings.privacyPolicy')} ›`}</Text>
        </Pressable>
      </SettingsSection>

      <Text style={styles.footer}>{t('settings.version', { version })}</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  screen: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    paddingHorizontal: theme.space.xl,
    paddingBottom: rt.insets.bottom + theme.space.xxl,
  },
  label: {
    ...theme.type.body,
    color: theme.colors.text,
    paddingTop: theme.space.md,
    paddingBottom: theme.space.xs,
  },
  hint: {
    ...theme.type.caption,
    color: theme.colors.textDim,
    paddingTop: theme.space.xs,
  },
  link: {
    minHeight: theme.touch.row,
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.7,
  },
  linkText: {
    ...theme.type.body,
    color: theme.colors.text,
    textDecorationLine: 'underline',
  },
  footer: {
    ...theme.type.caption,
    color: theme.colors.textDim,
    textAlign: 'center',
    paddingTop: theme.space.xxl,
  },
}));

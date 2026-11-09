import type { TutorialGame } from '@tavli/contracts';
import { THEME_IDS } from '@tavli/ui';
import Constants from 'expo-constants';
import { useLocales } from 'expo-localization';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, ScrollView, Text } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { Screen } from '@/components/Screen';
import { ScreenHeader } from '@/components/ScreenHeader';
import { SectionCard, SectionRow } from '@/components/SectionCard';
import { OptionList, type ListOption } from '@/components/settings/OptionList';
import { SegmentedControl, type SegmentOption } from '@/components/settings/SegmentedControl';
import { ToggleRow } from '@/components/settings/ToggleRow';
import type { BotSpeed } from '@/features/bot/botSpeed';
import { HistorySettings } from '@/features/history/HistorySettings';
import type { TurnPushes } from '@/features/notifications/turnPushes';
import { hasOnlineAccount } from '@/features/online/accountHint';
import { TurnPushSettings } from '@/features/notifications/TurnPushSettings';
import { PRIVACY_POLICY_URL } from '@/features/privacy/consent';
import { useConsent } from '@/features/privacy/consentStore';
import { TutorialSettings } from '@/features/tutorial/TutorialSettings';
import { pickDeviceLanguage, type LanguagePreference } from '@/i18n/languages';

import { BoardThemePicker } from './BoardThemePicker';
import { BoardLayoutPicker } from './BoardLayoutPicker';
import { HomeBoardSidePicker } from './HomeBoardSidePicker';
import { BlockHint, SettingBlock } from './SettingBlock';
import type { BoardFlipMode, MoveListMode } from './settings';
import { useSettings } from './store';

/** Pass-and-play board views. Face-to-face is shown but locked until it ships. */
type BoardViewOption = BoardFlipMode | 'faceToFace';

/**
 * Settings (wireframe 10, issue #37). Every change saves at once.
 * Privacy (#61) saves the usage data answer in the consent store, not in
 * Settings.
 *
 * In the Home style (#360): `Screen` with a `ScreenHeader`, each group one
 * `SectionCard` with lines between its rows, and an icon badge at the start
 * of each row. A switch is a `ToggleRow`, a picker a `SettingBlock` (or a
 * label `SectionRow` above an `OptionList`), a link a `SectionRow`.
 */
export interface SettingsScreenProps {
  /** Goes back. The header shows a back button only with it. */
  onBack?: () => void;
  /**
   * Opens the lessons of a game (#128, #159): "Learn to play" lets the
   * player pick Portes, Plakoto, Fevga or Asodio. The Help section shows
   * only with it.
   */
  onLearnToPlay?: (game: TutorialGame) => void;
  /** Opens the match history (#142). The History section shows only with it. */
  onHistory?: () => void;
  /**
   * Turn notifications (#285). The Notifications section shows only with
   * it: a build with no online play has none.
   */
  turnPushes?: TurnPushes;
  /**
   * Opens Settings → Account (#402): sign-in, username, sign out and
   * delete. The Online section shows only with it (a build with online
   * play), also on a phone that never played online.
   */
  onAccount?: () => void;
  /**
   * Opens Settings → Blocked players (#435). It shows only when this
   * phone used online play (`hasOnlineAccount()`, read again each `visit`).
   */
  onBlocked?: () => void;
  /**
   * Changes each time the screen shows again (the route's focus), so a
   * sign-in on Settings → Account shows the Blocked players row.
   */
  visit?: number;
}

export function SettingsScreen({
  onBack,
  onLearnToPlay,
  onHistory,
  turnPushes,
  onAccount,
  onBlocked,
  visit = 0,
}: SettingsScreenProps = {}) {
  const { t } = useTranslation();
  const locales = useLocales();
  // Read the note again when `visit` changes (React's "adjust state on a prop change").
  const [online, setOnline] = useState(() => ({ visit, used: hasOnlineAccount() }));
  if (online.visit !== visit) setOnline({ visit, used: hasOnlineAccount() });
  const usedOnline = online.used;

  const sound = useSettings((s) => s.sound);
  const haptics = useSettings((s) => s.haptics);
  const language = useSettings((s) => s.language);
  const autoConfirmMoves = useSettings((s) => s.autoConfirmMoves);
  const showHints = useSettings((s) => s.showHints);
  const offerFastForward = useSettings((s) => s.offerFastForward);
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
    <Screen testID="settings-screen">
      <ScreenHeader
        title={t('settings.title')}
        onBack={onBack}
        backLabel={t('common.back')}
        testID="settings-back"
      />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="never">
        <SectionCard title={t('settings.sections.game')}>
          <ToggleRow
            testID="settings-auto-confirm"
            icon="checkCheck"
            label={t('settings.autoConfirm.label')}
            hint={t('settings.autoConfirm.hint')}
            value={autoConfirmMoves}
            onValueChange={(value) => setSetting('autoConfirmMoves', value)}
          />
          <ToggleRow
            testID="settings-hints"
            icon="lightbulb"
            label={t('settings.hints.label')}
            hint={t('settings.hints.hint')}
            value={showHints}
            onValueChange={(value) => setSetting('showHints', value)}
          />
          <ToggleRow
            testID="settings-offer-fast-forward"
            icon="fastForward"
            label={t('settings.offerFastForward.label')}
            hint={t('settings.offerFastForward.hint')}
            value={offerFastForward}
            onValueChange={(value) => setSetting('offerFastForward', value)}
          />
          <SettingBlock icon="flipVertical" label={t('settings.boardView.label')}>
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
            <BlockHint>
              {boardFlipMode === 'flip'
                ? t('settings.boardView.flipHint')
                : t('settings.boardView.fixedHint')}
            </BlockHint>
            <BlockHint>{t('settings.boardView.faceToFaceSoon')}</BlockHint>
          </SettingBlock>
          <SettingBlock icon="gauge" label={t('settings.botSpeed.label')}>
            <SegmentedControl
              testID="settings-bot-speed"
              label={t('settings.botSpeed.label')}
              options={botSpeedOptions}
              value={botSpeed}
              onChange={(value) => setSetting('botSpeed', value)}
            />
            <BlockHint>{t(`settings.botSpeed.${botSpeed}Hint`)}</BlockHint>
          </SettingBlock>
        </SectionCard>

        <SectionCard title={t('settings.sections.soundAndFeel')}>
          <ToggleRow
            testID="settings-sound"
            icon="volume"
            label={t('settings.sound.label')}
            hint={t('settings.sound.hint')}
            value={sound}
            onValueChange={(value) => setSetting('sound', value)}
          />
          <ToggleRow
            testID="settings-haptics"
            icon="vibrate"
            label={t('settings.haptics.label')}
            hint={t('settings.haptics.hint')}
            value={haptics}
            onValueChange={(value) => setSetting('haptics', value)}
          />
        </SectionCard>

        <SectionCard title={t('settings.sections.language')}>
          <SectionRow icon="languages" label={t('settings.sections.language')} />
          <OptionList
            testID="settings-language"
            label={t('settings.sections.language')}
            options={languageOptions}
            value={language}
            onChange={(value) => setSetting('language', value)}
          />
        </SectionCard>

        <SectionCard title={t('settings.sections.board')}>
          <BoardThemePicker testID="settings-board-theme" />
          <BoardLayoutPicker testID="settings-board-layout" />
          <HomeBoardSidePicker testID="settings-home-board" />
        </SectionCard>

        <SectionCard title={t('settings.sections.look')}>
          <SectionRow
            icon="palette"
            label={t('settings.theme.label')}
            hint={t('settings.theme.hint')}
          />
          <OptionList
            testID="settings-theme"
            label={t('settings.theme.label')}
            options={themeOptions}
            value={theme}
            onChange={(value) => setSetting('theme', value)}
          />
        </SectionCard>

        <SectionCard title={t('settings.sections.accessibility')}>
          <SettingBlock icon="list" label={t('settings.moveList.label')}>
            <SegmentedControl
              testID="settings-move-list"
              label={t('settings.moveList.label')}
              options={moveListOptions}
              value={moveList}
              onChange={(value) => setSetting('moveList', value)}
            />
            <BlockHint>{t(`settings.moveList.${moveList}Hint`)}</BlockHint>
          </SettingBlock>
        </SectionCard>

        {onLearnToPlay ? (
          <SectionCard title={t('settings.sections.help')}>
            <TutorialSettings onOpen={onLearnToPlay} />
          </SectionCard>
        ) : null}

        {onHistory ? (
          <SectionCard title={t('settings.sections.history')}>
            <HistorySettings onOpen={onHistory} />
          </SectionCard>
        ) : null}

        {turnPushes ? (
          <SectionCard title={t('settings.sections.notifications')}>
            <TurnPushSettings pushes={turnPushes} />
          </SectionCard>
        ) : null}

        {onAccount ? (
          <SectionCard title={t('settings.sections.online')}>
            <SectionRow
              testID="settings-account"
              icon="user"
              label={t('settings.account.label')}
              hint={t('settings.account.hint')}
              onPress={onAccount}
            />
            {onBlocked && usedOnline ? (
              <SectionRow
                testID="settings-blocked"
                icon="userX"
                label={t('settings.blocked.label')}
                hint={t('settings.blocked.hint')}
                onPress={onBlocked}
              />
            ) : null}
          </SectionCard>
        ) : null}

        <SectionCard title={t('settings.sections.privacy')}>
          <ToggleRow
            testID="settings-usage-data"
            icon="chart"
            label={t('settings.usageData.label')}
            hint={t('settings.usageData.hint')}
            value={shareUsageData}
            onValueChange={setConsent}
          />
          <SectionRow
            testID="settings-privacy-policy"
            icon="shield"
            label={t('settings.privacyPolicy')}
            accessibilityRole="link"
            onPress={() => void Linking.openURL(PRIVACY_POLICY_URL).catch(() => undefined)}
          />
        </SectionCard>

        <Text style={styles.footer}>{t('settings.version', { version })}</Text>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  scroll: {
    flex: 1,
  },
  content: {
    gap: theme.space.lg,
    paddingHorizontal: theme.space.lg,
    paddingTop: theme.space.sm,
    paddingBottom: rt.insets.bottom + theme.space.xxl,
  },
  footer: {
    ...theme.type.caption,
    color: theme.colors.textDim,
    textAlign: 'center',
    paddingTop: theme.space.sm,
  },
}));

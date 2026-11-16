import type { AuthProvider, Usernames } from '@tavli/contracts';
import { getTheme } from '@tavli/themes';
import Constants from 'expo-constants';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { SectionCard, SectionRow } from '@/components/SectionCard';
import { HistorySettings } from '@/features/history/HistorySettings';
import { useTurnPushState } from '@/features/notifications/TurnPushSettings';
import type { TurnPushes } from '@/features/notifications/turnPushes';
import { hasOnlineAccount } from '@/features/online/accountHint';
import { PRIVACY_POLICY_URL } from '@/features/privacy/consent';
import { useConsent } from '@/features/privacy/consentStore';
import { whatsNewSeen } from '@/features/whats-new/seen';
import { appBuild } from '@/services';

import { AccountCard } from './AccountCard';
import { SettingsPage } from './SettingsPage';
import { useSettings } from './store';

/** The sub-pages of Settings (#501). Each has its route under `/settings/`. */
export type SettingsPageId =
  'gameplay' | 'board' | 'sound' | 'language' | 'move-list' | 'notifications' | 'usage-data';

/**
 * Settings (#37), split into pages (#501, Figma "08 Settings"). The top
 * level is a short index: the account card first, then the groups Play,
 * Online, Help and Privacy. Each row shows its current value; a group of
 * settings opens its own page (`SettingsPageId`). Every change saves at
 * once, on the page that holds it.
 *
 * Rows that open a screen outside Settings show only with their callback,
 * as before: a build with no online play has no Online group.
 */
export interface SettingsScreenProps {
  /** Goes back. The header shows a back button only with it. */
  onBack?: () => void;
  /** Opens a sub-page of Settings. */
  onPage?: (page: SettingsPageId) => void;
  /** Opens How to play: every game's lessons and rules (#571). */
  onHowToPlay?: () => void;
  /** Opens the match history (#142). The History rows show only with it. */
  onHistory?: () => void;
  /** Opens What's new (#471): a row in the Help group. */
  onWhatsNew?: () => void;
  /** Opens the app tour (#573): a row in the Help group. */
  onTour?: () => void;
  /**
   * Turn notifications (#285). Its row shows only with it: a build with no
   * online play has none.
   */
  turnPushes?: TurnPushes;
  /**
   * Opens Settings → Account (#402). The Online group shows only with it
   * (a build with online play), also on a phone that never played online.
   */
  onAccount?: () => void;
  /** The account card's services. With `onAccount`, the card shows on top. */
  account?: { auth: AuthProvider; usernames: Usernames };
  /**
   * Opens Settings → Blocked players (#435). It shows only when this
   * phone used online play (`hasOnlineAccount()`, read again each `visit`).
   */
  onBlocked?: () => void;
  /** Opens Friends (#406). `undefined`: no Friends row. */
  onFriends?: () => void;
  /** Opens Leaderboards (#407). `undefined`: no Leaderboards row. Shows like Friends. */
  onRatings?: () => void;
  /**
   * Changes each time the screen shows again (the route's focus), so a
   * sign-in on Settings → Account shows the Blocked players row, and a
   * change on a sub-page shows in its row.
   */
  visit?: number;
}

export function SettingsScreen({
  onBack,
  onPage,
  onHowToPlay,
  onHistory,
  onWhatsNew,
  onTour,
  turnPushes,
  onAccount,
  account,
  onBlocked,
  onFriends,
  onRatings,
  visit = 0,
}: SettingsScreenProps = {}) {
  const { t, i18n } = useTranslation();
  // Read the notes again when `visit` changes (React's "adjust state on a prop change").
  const [seen, setSeen] = useState(() => ({
    visit,
    usedOnline: hasOnlineAccount(),
    whatsNewDue: whatsNewSeen.due(),
  }));
  if (seen.visit !== visit) {
    setSeen({ visit, usedOnline: hasOnlineAccount(), whatsNewDue: whatsNewSeen.due() });
  }
  const { usedOnline, whatsNewDue } = seen;

  const sound = useSettings((s) => s.sound);
  const haptics = useSettings((s) => s.haptics);
  const language = useSettings((s) => s.language);
  const boardTheme = useSettings((s) => s.boardTheme);
  const shareUsageData = useConsent((s) => s.status === 'granted');

  const lang = i18n.language === 'el' ? 'el' : 'en';
  const onOff = (on: boolean) => t(on ? 'settings.value.on' : 'settings.value.off');
  const languageValue =
    language === 'system' ? t('settings.language.system') : t(`languages.${language}`);
  const soundValue = t(
    `settings.soundPage.summary.${sound ? 'soundOn' : 'soundOff'}${haptics ? 'HapticsOn' : 'HapticsOff'}`,
  );
  const open = (page: SettingsPageId) => () => onPage?.(page);
  const version = Constants.expoConfig?.version ?? '';
  const build = appBuild()?.build;

  return (
    <SettingsPage
      title={t('settings.title')}
      onBack={onBack}
      testID="settings-screen"
      backTestID="settings-back">
      {onAccount && account ? (
        <AccountCard
          auth={account.auth}
          usernames={account.usernames}
          visit={visit}
          onPress={onAccount}
        />
      ) : null}

      <SectionCard title={t('settings.sections.play')}>
        <SectionRow
          testID="settings-gameplay"
          icon="gauge"
          iconLook="bare"
          label={t('settings.gameplay.title')}
          hint={t('settings.gameplay.summary')}
          onPress={open('gameplay')}
        />
        <SectionRow
          testID="settings-board-look"
          icon="image"
          iconLook="bare"
          label={t('settings.boardLook.title')}
          hint={getTheme(boardTheme).name[lang]}
          onPress={open('board')}
        />
        <SectionRow
          testID="settings-sound-page"
          icon="volume"
          iconLook="bare"
          label={t('settings.soundPage.title')}
          hint={soundValue}
          onPress={open('sound')}
        />
        <SectionRow
          testID="settings-language-page"
          icon="languages"
          iconLook="bare"
          label={t('settings.sections.language')}
          value={languageValue}
          onPress={open('language')}
        />
        {onHistory ? <HistorySettings onOpen={onHistory} /> : null}
      </SectionCard>

      {/* The account card on top opens Account, so Online has no Account
          row (#561); with no row left, no section. */}
      {turnPushes || (usedOnline && (onFriends || onRatings || onBlocked)) ? (
        <SectionCard title={t('settings.sections.online')}>
          {onFriends && usedOnline ? (
            <SectionRow
              testID="settings-friends"
              icon="handshake"
              iconLook="bare"
              label={t('settings.friends.label')}
              hint={t('settings.friends.hint')}
              onPress={onFriends}
            />
          ) : null}
          {onRatings && usedOnline ? (
            <SectionRow
              testID="settings-ratings"
              icon="trophy"
              iconLook="bare"
              label={t('settings.ratings.label')}
              hint={t('settings.ratings.hint')}
              onPress={onRatings}
            />
          ) : null}
          {turnPushes ? (
            <TurnPushRow pushes={turnPushes} onPress={open('notifications')} onOff={onOff} />
          ) : null}
          {onBlocked && usedOnline ? (
            <SectionRow
              testID="settings-blocked"
              icon="userX"
              iconLook="bare"
              label={t('settings.blocked.label')}
              hint={t('settings.blocked.hint')}
              onPress={onBlocked}
            />
          ) : null}
        </SectionCard>
      ) : null}

      {onHowToPlay || onWhatsNew || onTour ? (
        <SectionCard title={t('settings.sections.help')}>
          {onHowToPlay ? (
            <SectionRow
              testID="settings-how-to-play"
              icon="book"
              iconLook="bare"
              label={t('settings.howToPlay')}
              hint={t('settings.howToPlayHint')}
              onPress={onHowToPlay}
            />
          ) : null}
          {onTour ? (
            <SectionRow
              testID="settings-tour"
              icon="compass"
              iconLook="bare"
              label={t('tour.row.label')}
              hint={t('tour.row.hint')}
              onPress={onTour}
            />
          ) : null}
          {onWhatsNew ? (
            <SectionRow
              testID="settings-whats-new"
              icon="sparkles"
              iconLook="bare"
              label={t('settings.whatsNew.label')}
              hint={t('settings.whatsNew.hint')}
              accessibilityLabel={
                whatsNewDue ? t('home.whatsNew.labelFresh') : t('settings.whatsNew.label')
              }
              right={
                whatsNewDue ? <View testID="settings-whats-new-dot" style={styles.dot} /> : null
              }
              onPress={onWhatsNew}
            />
          ) : null}
        </SectionCard>
      ) : null}

      <SectionCard title={t('settings.sections.privacy')}>
        <SectionRow
          testID="settings-usage-data-page"
          icon="chart"
          iconLook="bare"
          label={t('settings.usageDataPage.title')}
          value={onOff(shareUsageData)}
          onPress={open('usage-data')}
        />
        <SectionRow
          testID="settings-privacy-policy"
          icon="shield"
          iconLook="bare"
          label={t('settings.privacyPolicy')}
          accessibilityRole="link"
          onPress={() => void Linking.openURL(PRIVACY_POLICY_URL).catch(() => undefined)}
        />
      </SectionCard>

      <Text style={styles.footer}>
        {build !== undefined
          ? t('settings.versionBuild', { version, build })
          : t('settings.version', { version })}
      </Text>
    </SettingsPage>
  );
}

/** Turn notifications, with On or Off (#285). It opens its page. */
function TurnPushRow({
  pushes,
  onPress,
  onOff,
}: {
  pushes: TurnPushes;
  onPress: () => void;
  onOff: (on: boolean) => string;
}) {
  const { t } = useTranslation();
  const state = useTurnPushState(pushes);
  return (
    <SectionRow
      testID="settings-turn-pushes-row"
      icon="bell"
      iconLook="bare"
      label={t('notifications.settings.label')}
      value={state === null ? undefined : onOff(state === 'on')}
      onPress={onPress}
    />
  );
}

const DOT = 8;

const styles = StyleSheet.create((theme) => ({
  dot: {
    width: DOT,
    height: DOT,
    borderRadius: DOT / 2,
    backgroundColor: theme.colors.accentLight,
  },
  footer: {
    ...theme.type.caption,
    color: theme.colors.textDim,
    textAlign: 'center',
    paddingTop: theme.space.sm,
  },
}));

/**
 * Home (wireframe 3): start or continue a game in one or two taps.
 * Main actions sit in the lower half; the top holds only the gear.
 */
import type { Difficulty } from '@tavli/contracts';
import { displayCaps } from '@tavli/ui';
import { useEffect, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { MenuButton } from '@/components/MenuButton';
import { Toast, useToast } from '@/components/Toast';
import type { MatchMode } from '@/features/match/setup';

export interface HomeScreenProps {
  onNewGame: (mode: MatchMode) => void;
  onSettings: () => void;
  onHowToPlay: () => void;
  /** The bot levels this build can play (for the "Play vs bot" subtitle). */
  botLevels: readonly Difficulty[];
  /** The "Continue game" card, when a saved game exists (#36). */
  continueCard?: ReactNode;
  /** A one-time message, for example "Your saved game could not be opened." */
  notice?: string | null;
}

export function HomeScreen({
  onNewGame,
  onSettings,
  onHowToPlay,
  botLevels,
  continueCard,
  notice = null,
}: HomeScreenProps) {
  const { t } = useTranslation();
  const [toast, showToast] = useToast();
  useEffect(() => {
    if (notice !== null) showToast(notice);
  }, [notice, showToast]);
  const hasMedium = botLevels.includes('medium');

  return (
    <View style={styles.screen}>
      <View style={styles.topBar}>
        <View style={styles.logo} importantForAccessibility="no-hide-descendants" />
        <Text style={styles.appName} accessibilityRole="header">
          {t('home.title')}
        </Text>
        <Pressable
          testID="home-settings"
          accessibilityRole="button"
          accessibilityLabel={t('home.openSettings')}
          hitSlop={8}
          onPress={onSettings}
          style={({ pressed }) => [styles.gear, pressed && styles.pressed]}>
          {/* U+FE0E asks for the text glyph, not the emoji. */}
          <Text style={styles.gearIcon} importantForAccessibility="no">
            {'⚙︎'}
          </Text>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.content} bounces={false}>
        {/* Board art comes with the art task. It grows when there is no saved game. */}
        <View style={styles.art}>
          <Text style={styles.tagline}>{t('home.tagline')}</Text>
        </View>
        {continueCard}
        <Text
          style={styles.section}
          accessibilityRole="header"
          accessibilityLabel={t('home.newGame')}>
          {displayCaps(t('home.newGame'))}
        </Text>
        <View style={styles.buttons}>
          <MenuButton
            testID="home-vs-bot"
            kind="primary"
            badge="AI"
            title={t('home.vsBot.title')}
            subtitle={hasMedium ? t('home.vsBot.subtitle') : t('home.vsBot.subtitleEasy')}
            onPress={() => onNewGame('bot')}
          />
          <MenuButton
            testID="home-local"
            badge="2P"
            title={t('home.local.title')}
            subtitle={t('home.local.subtitle')}
            onPress={() => onNewGame('local')}
          />
          <MenuButton
            testID="home-friend"
            kind="locked"
            badge="@"
            title={t('home.friend.title')}
            subtitle={t('home.friend.subtitle')}
            chip={t('common.comingSoon')}
            onPress={() => showToast(t('home.friend.soon'))}
          />
        </View>
        <Pressable
          testID="home-how-to-play"
          accessibilityRole="link"
          onPress={onHowToPlay}
          hitSlop={8}
          style={({ pressed }) => [styles.link, pressed && styles.pressed]}>
          <Text style={styles.linkText}>{t('home.howToPlay')}</Text>
        </Pressable>
      </ScrollView>
      <Toast text={toast} />
    </View>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  screen: {
    flex: 1,
    backgroundColor: theme.colors.background,
    paddingTop: rt.insets.top,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.md,
    paddingHorizontal: theme.space.lg,
    paddingTop: theme.space.sm,
  },
  logo: {
    width: 36,
    height: 36,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  appName: {
    ...theme.type.title,
    flex: 1,
    color: theme.colors.text,
  },
  gear: {
    width: theme.touch.minTarget,
    height: theme.touch.minTarget,
    borderRadius: theme.touch.minTarget / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  pressed: {
    opacity: 0.7,
  },
  gearIcon: {
    fontSize: 24,
    lineHeight: 28,
    color: theme.colors.text,
  },
  content: {
    flexGrow: 1,
    gap: theme.space.md,
    paddingHorizontal: theme.space.lg,
    paddingTop: theme.space.lg,
    paddingBottom: rt.insets.bottom + theme.space.xl,
  },
  art: {
    flexGrow: 1,
    minHeight: 120,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radii.lg,
    backgroundColor: theme.colors.backgroundDeep,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.space.lg,
  },
  tagline: {
    ...theme.type.body,
    color: theme.colors.textDim,
    textAlign: 'center',
  },
  section: {
    ...theme.type.section,
    color: theme.colors.textDim,
    paddingTop: theme.space.sm,
  },
  buttons: {
    gap: theme.space.md,
  },
  link: {
    alignSelf: 'center',
    minHeight: theme.touch.minTarget,
    justifyContent: 'center',
    paddingHorizontal: theme.space.lg,
  },
  linkText: {
    ...theme.type.bodyStrong,
    color: theme.colors.text,
    textDecorationLine: 'underline',
  },
}));

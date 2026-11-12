/**
 * Home (wireframe 3, redesigned in #342): start or continue a game in one
 * or two taps.
 *
 * Top to bottom: the logo, What's new (#471) and Settings, a greeting, then a big hero card
 * with a board picture. The hero is the saved game ("Continue game") or,
 * with no save, "Play vs bot". Then the reminder card (#404, when one is
 * due), your online games and invites, the friend invites to you
 * (#486), the "Learn to play" banner, the other play modes as tiles
 * ("Join with a code" under "Play a friend" when online play is on, #333;
 * then Friends and Leaderboards, #486), and How to play and History as
 * pills.
 */
import type { Difficulty } from '@tavli/contracts';
import { displayCaps } from '@tavli/ui';
import type { TFunction } from 'i18next';
import { useEffect, useMemo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Image, Pressable, ScrollView, Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { Icon } from '@/components/Icon';
import type { IconName } from '@/components/icons';
import { screenBackground } from '@/components/Screen';
import { SectionHeader } from '@/components/SectionHeader';
import { Toast, useToast } from '@/components/Toast';
import type { MatchMode } from '@/features/match/setup';
import { rulesDirection, startBoard } from '@/features/rules/content';
import { WhatsNewButton } from '@/features/whats-new/WhatsNewButton';

import { greetingFor } from './greeting';
import { HomeHero, type HeroBoard } from './HomeHero';
import { ModeTile } from './ModeTile';

const LOGO = require('../../../assets/home/logo.webp') as number;

/** Above this font scale the mode tiles and the pills take a row each. */
const ONE_COLUMN_FONT_SCALE = 1.3;

export interface HomeScreenProps {
  onNewGame: (mode: MatchMode) => void;
  onSettings: () => void;
  /** Opens What's new (#471). The button shows only with it. */
  onWhatsNew?: () => void;
  /** A release this phone has not opened: the button's dot and heartbeat. */
  whatsNewFresh?: boolean;
  onHowToPlay: () => void;
  /** Opens the match history (#142). The link shows only with it. */
  onHistory?: () => void;
  /**
   * Opens "Play a friend online" (#281). Without it (a build with no
   * online server) the tile shows "Coming soon".
   */
  onPlayFriend?: () => void;
  /**
   * Opens "Join with a code" (#333). The tile shows only with it (a build
   * with an online server).
   */
  onJoinWithCode?: () => void;
  /** Opens Friends (#406). The tile shows only with it (a build with online play). */
  onFriends?: () => void;
  /** Opens the Leaderboards (#407). The tile shows only with it. */
  onRatings?: () => void;
  /** The bot levels this build can play, easiest first (the "Play vs bot" subtitle). */
  botLevels: readonly Difficulty[];
  /** The "Continue game" card, when a saved game exists (#36). It takes the hero's place. */
  continueCard?: ReactNode;
  /** The reminder card (#404): save a guest account, or play online. */
  reminderCard?: ReactNode;
  /** "Your online games" (#297), when this phone has an online account. */
  onlineGames?: ReactNode;
  /** "Your invites" (#314), when this phone has an online account. */
  invites?: ReactNode;
  /** "Invites from friends" (#486), when this phone has an online account. */
  friendInvites?: ReactNode;
  /** The "Learn to play" card, until the tutorial is done or dismissed (#128). */
  learnCard?: ReactNode;
  /** A one-time message, for example "Your saved game could not be opened." */
  notice?: string | null;
  /** The phone's hour (0–23), for the greeting. Default: now. */
  hour?: number;
}

export function HomeScreen({
  onNewGame,
  onSettings,
  onWhatsNew,
  whatsNewFresh = false,
  onHowToPlay,
  onHistory,
  onPlayFriend,
  onJoinWithCode,
  onFriends,
  onRatings,
  botLevels,
  continueCard,
  reminderCard,
  onlineGames,
  invites,
  friendInvites,
  learnCard,
  notice = null,
  hour,
}: HomeScreenProps) {
  const { t } = useTranslation();
  const { theme } = useUnistyles();
  const [toast, showToast] = useToast();
  useEffect(() => {
    if (notice !== null) showToast(notice);
  }, [notice, showToast]);
  const startPosition = useMemo<HeroBoard>(
    () => ({ board: startBoard('portes'), direction: rulesDirection('portes') }),
    [],
  );

  const greeting = t(`home.greeting.${greetingFor(hour ?? new Date().getHours())}`);
  const vsBotTitle = t('home.vsBot.title');
  const levels = levelList(botLevels, t);
  const vsBotLabel = [vsBotTitle, levels].filter(Boolean).join(', ');
  const hasSave = continueCard != null;
  const modesTitle = hasSave ? t('home.newGame') : t('home.moreModes');

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} bounces={false}>
        <View style={styles.header}>
          <View style={styles.topRow}>
            <Image
              source={LOGO}
              style={styles.logo}
              accessible={false}
              importantForAccessibility="no"
            />
            <Text style={styles.appName} accessibilityRole="header">
              {t('home.title')}
            </Text>
            {onWhatsNew ? <WhatsNewButton fresh={whatsNewFresh} onPress={onWhatsNew} /> : null}
            <Pressable
              testID="home-settings"
              accessibilityRole="button"
              accessibilityLabel={t('home.openSettings')}
              hitSlop={8}
              onPress={onSettings}
              style={({ pressed }) => [styles.roundButton, pressed && styles.pressed]}>
              <Icon name="settings" size={22} color={theme.colors.text} />
            </Pressable>
          </View>
          <Text style={styles.greeting}>{greeting}</Text>
          <Text style={styles.tagline}>{t('home.tagline')}</Text>
        </View>

        {continueCard ?? (
          <HomeHero
            testID="home-vs-bot"
            eyebrow={displayCaps(t('home.newGame'))}
            title={vsBotTitle}
            {...(levels ? { lines: [levels] } : {})}
            action={t('home.playNow')}
            accessibilityLabel={vsBotLabel}
            board={startPosition}
            onPress={() => onNewGame('bot')}
          />
        )}
        {reminderCard}
        {onlineGames}
        {invites}
        {friendInvites}
        {learnCard}

        <SectionHeader title={modesTitle} />
        <View style={styles.grid}>
          {hasSave ? (
            <ModeTile
              testID="home-vs-bot"
              kind="primary"
              wide
              icon="bot"
              title={vsBotTitle}
              {...(levels ? { subtitle: levels } : {})}
              onPress={() => onNewGame('bot')}
            />
          ) : null}
          <View style={styles.cell}>
            <ModeTile
              testID="home-local"
              icon="users"
              title={t('home.local.title')}
              subtitle={t('home.local.subtitle')}
              onPress={() => onNewGame('local')}
            />
          </View>
          <View style={styles.cell}>
            {onPlayFriend ? (
              <ModeTile
                testID="home-friend"
                icon="globe"
                title={t('home.friend.title')}
                subtitle={t('home.friend.subtitle')}
                onPress={onPlayFriend}
              />
            ) : (
              <ModeTile
                testID="home-friend"
                kind="locked"
                icon="globe"
                title={t('home.friend.title')}
                subtitle={t('home.friend.subtitle')}
                chip={t('common.comingSoon')}
                onPress={() => showToast(t('home.friend.soon'))}
              />
            )}
          </View>
          {onJoinWithCode ? (
            <ModeTile
              testID="home-join"
              wide
              icon="keyboard"
              title={t('home.join.title')}
              subtitle={t('home.join.subtitle')}
              onPress={onJoinWithCode}
            />
          ) : null}
          {onFriends ? (
            <View style={styles.cell}>
              <ModeTile
                testID="home-friends"
                icon="handshake"
                title={t('home.friends.title')}
                subtitle={t('home.friends.subtitle')}
                onPress={onFriends}
              />
            </View>
          ) : null}
          {onRatings ? (
            <View style={styles.cell}>
              <ModeTile
                testID="home-ratings"
                icon="trophy"
                title={t('home.ratings.title')}
                subtitle={t('home.ratings.subtitle')}
                onPress={onRatings}
              />
            </View>
          ) : null}
        </View>

        <View style={styles.footer}>
          <FooterLink
            testID="home-how-to-play"
            icon="book"
            label={t('home.howToPlay')}
            onPress={onHowToPlay}
          />
          {onHistory ? (
            <FooterLink
              testID="home-history"
              icon="history"
              label={t('home.history')}
              onPress={onHistory}
            />
          ) : null}
        </View>
      </ScrollView>
      <Toast text={toast} />
    </View>
  );
}

interface FooterLinkProps {
  testID: string;
  icon: IconName;
  label: string;
  onPress: () => void;
}

/** A pill at the bottom of Home. Screen readers hear a link, as before #342. */
function FooterLink({ testID, icon, label, onPress }: FooterLinkProps) {
  const { theme } = useUnistyles();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="link"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.pill, pressed && styles.pressed]}>
      <Icon name={icon} size={18} color={theme.colors.textDim} />
      <Text style={styles.pillText}>{label}</Text>
    </Pressable>
  );
}

/**
 * The level names as one line: "Easy", "Easy or Medium", "Easy, Medium or
 * Hard". Built from the levels, so it stays right when the bot gets a new
 * one (#182). No levels gives no subtitle.
 */
export function levelList(levels: readonly Difficulty[], t: TFunction): string | undefined {
  const names = levels.map((level) => t(`bot.levels.${level}`));
  const last = names.pop();
  if (last === undefined) return undefined;
  if (names.length === 0) return last;
  return t('home.vsBot.levels', { first: names.join(t('home.vsBot.levelsSeparator')), last });
}

const styles = StyleSheet.create((theme, rt) => ({
  screen: {
    flex: 1,
    ...screenBackground(theme.colors),
  },
  content: {
    flexGrow: 1,
    gap: theme.space.lg,
    paddingHorizontal: theme.space.lg,
    paddingTop: rt.insets.top + theme.space.sm,
    paddingBottom: rt.insets.bottom + theme.space.xl,
  },
  header: {
    gap: theme.space.xs,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.sm,
    paddingBottom: theme.space.md,
  },
  logo: {
    width: 32,
    height: 32,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  appName: {
    ...theme.type.bodyStrong,
    flex: 1,
    color: theme.colors.text,
    letterSpacing: 0.3,
  },
  roundButton: {
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
    opacity: 0.85,
    transform: [{ scale: 0.97 }],
  },
  greeting: {
    ...theme.type.display,
    color: theme.colors.text,
  },
  tagline: {
    ...theme.type.body,
    color: theme.colors.textDim,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.space.md,
  },
  // Two tiles a row; one a row with a large font. Equal heights in a row.
  cell: {
    flexGrow: 1,
    flexBasis: rt.fontScale > ONE_COLUMN_FONT_SCALE ? '100%' : 0,
    minWidth: 140,
  },
  footer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.space.md,
  },
  pill: {
    flexGrow: 1,
    flexBasis: rt.fontScale > ONE_COLUMN_FONT_SCALE ? '100%' : 0,
    minWidth: 140,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.space.sm,
    minHeight: theme.touch.button,
    paddingHorizontal: theme.space.lg,
    paddingVertical: theme.space.sm,
    borderRadius: theme.radii.pill,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  pillText: {
    ...theme.type.bodyStrong,
    color: theme.colors.text,
    flexShrink: 1,
  },
}));

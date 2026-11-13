/**
 * Home (wireframe 3, redesigned in #342, Figma pass in #517): start or
 * continue a game in one or two taps.
 *
 * Top to bottom: a small ivory checker and the name, What's new (#471)
 * and Settings, a greeting with the kafeneio table scene (#509; it plays
 * the first time Home shows in an app run), then the card that leads Home.
 * With a save it is the saved game ("Continue game", a big board). With no
 * save it is Play vs bot with quick start (`QuickStartHero`, Figma option
 * G): a small board, the level chip and one button per game. Then the
 * reminder card (#404, when one is due), your online games and invites,
 * the friend invites to you (#486), the "Learn to play" row, the other
 * play modes as tiles (Play a friend, Pass-and-play, then Friends and
 * Leaderboards, #486), and one list with Join with a code (#333, when
 * online play is on), How to play and History.
 *
 * One brass button per view (Figma notes): the Continue card's, or the
 * last game played on the quick start card.
 */
import type { Difficulty } from '@tavli/contracts';
import type { TFunction } from 'i18next';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { CheckerAvatar } from '@/components/CheckerAvatar';
import { RoundButton } from '@/components/RoundButton';
import { screenBackground } from '@/components/Screen';
import { SectionCard, SectionRow } from '@/components/SectionCard';
import { SectionHeader } from '@/components/SectionHeader';
import { Toast, useToast } from '@/components/Toast';
import { homeIntroDue, markHomeIntroPlayed } from '@/features/intro/introRuns';
import { TableScene } from '@/features/intro/TableScene';
import type { GameChoice, MatchMode } from '@/features/match/setup';
import { rulesDirection, startBoard } from '@/features/rules/content';
import { WhatsNewButton } from '@/features/whats-new/WhatsNewButton';

import { greetingFor } from './greeting';
import type { HeroBoard } from './HomeHero';
import { ModeTile } from './ModeTile';
import { QuickStartHero, type QuickStartGame } from './QuickStartHero';

/** The table scene's width beside the greeting (Figma: 144×108). */
const SCENE_WIDTH = 144;

/** What the quick start card shows (#517). */
export interface QuickStartChoice {
  /** The game buttons, in order: the games the bot can play. */
  readonly games: readonly QuickStartGame[];
  /** The last game played vs the bot: the brass button. */
  readonly last: GameChoice;
  /** The level the buttons start at. */
  readonly level: Difficulty;
}

/** Above this font scale the mode tiles take a row each. */
const ONE_COLUMN_FONT_SCALE = 1.3;

export interface HomeScreenProps {
  /** Opens New game in this mode (the full form). */
  onNewGame: (mode: MatchMode) => void;
  /** The quick start card's choices (#517). */
  quickStart: QuickStartChoice;
  /** A game button on the quick start card: start that game vs the bot now. */
  onQuickStart: (game: QuickStartGame) => void;
  /** A level picked on the quick start card's chip. */
  onBotLevel: (level: Difficulty) => void;
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
   * Opens "Join with a code" (#333). The row shows only with it (a build
   * with an online server).
   */
  onJoinWithCode?: () => void;
  /**
   * Opens Play ranked (#532). The tile shows only with it (a build with
   * online play); the online tiles then come first.
   */
  onPlayRanked?: () => void;
  /** Opens Friends (#406). The tile shows only with it (a build with online play). */
  onFriends?: () => void;
  /** Opens the Leaderboards (#407). The tile shows only with it. */
  onRatings?: () => void;
  /** The bot levels this build can play, easiest first (the chip's choices). */
  botLevels: readonly Difficulty[];
  /** The "Continue game" card, when a saved game exists (#36). It takes the lead card's place. */
  continueCard?: ReactNode;
  /** The reminder card (#404): save a guest account, or play online. */
  reminderCard?: ReactNode;
  /** "Your online games" (#297), when this phone has an online account. */
  onlineGames?: ReactNode;
  /** "Your invites" (#314), when this phone has an online account. */
  invites?: ReactNode;
  /** "Invites from friends" (#486), when this phone has an online account. */
  friendInvites?: ReactNode;
  /** The "Learn to play" row, until the tutorial is done or dismissed (#128). */
  learnCard?: ReactNode;
  /** A one-time message, for example "Your saved game could not be opened." */
  notice?: string | null;
  /** The phone's hour (0–23), for the greeting. Default: now. */
  hour?: number;
}

export function HomeScreen({
  onNewGame,
  quickStart,
  onQuickStart,
  onBotLevel,
  onSettings,
  onWhatsNew,
  whatsNewFresh = false,
  onHowToPlay,
  onHistory,
  onPlayFriend,
  onJoinWithCode,
  onPlayRanked,
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
  const [toast, showToast] = useToast();
  useEffect(() => {
    if (notice !== null) showToast(notice);
  }, [notice, showToast]);
  // The table scene plays once per app run; after that it rests (#509).
  const [playIntro] = useState(homeIntroDue);
  useEffect(() => {
    markHomeIntroPlayed();
  }, []);
  const startPosition = useMemo<HeroBoard>(
    () => ({ board: startBoard('portes'), direction: rulesDirection('portes') }),
    [],
  );

  const greeting = t(`home.greeting.${greetingFor(hour ?? new Date().getHours())}`);
  const vsBotTitle = t('home.vsBot.title');
  const levels = levelList(botLevels, t);
  const hasSave = continueCard != null;
  const modesTitle = hasSave ? t('home.newGame') : t('home.moreModes');

  const localTile = (
    <ModeTile
      testID="home-local"
      icon="users"
      title={t('home.local.title')}
      subtitle={t('home.local.subtitle')}
      onPress={() => onNewGame('local')}
    />
  );
  const friendTile = onPlayFriend ? (
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
  );

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} bounces={false}>
        <View style={styles.header}>
          <View style={styles.topRow}>
            <View style={styles.brand}>
              <CheckerAvatar playerKey="home" wood="bone" size={24} />
              <Text style={styles.appName} accessibilityRole="header">
                {t('home.title')}
              </Text>
            </View>
            {onWhatsNew ? <WhatsNewButton fresh={whatsNewFresh} onPress={onWhatsNew} /> : null}
            <RoundButton
              testID="home-settings"
              icon="settings"
              accessibilityLabel={t('home.openSettings')}
              onPress={onSettings}
            />
          </View>
          <View style={styles.welcome}>
            <View style={styles.welcomeText}>
              <Text style={styles.greeting}>{greeting}</Text>
              <Text style={styles.tagline}>{t('home.tagline')}</Text>
            </View>
            <TableScene width={SCENE_WIDTH} play={playIntro} testID="home-table-scene" />
          </View>
        </View>

        {continueCard ?? (
          <QuickStartHero
            board={startPosition}
            games={quickStart.games}
            last={quickStart.last}
            level={quickStart.level}
            levels={botLevels}
            onMore={() => onNewGame('bot')}
            onStart={onQuickStart}
            onLevel={onBotLevel}
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
              wide
              icon="bot"
              title={vsBotTitle}
              {...(levels ? { subtitle: levels } : {})}
              onPress={() => onNewGame('bot')}
            />
          ) : null}
          {/* Play ranked (#532, Figma 81:2): the two online tiles first. */}
          <View style={styles.cell}>{friendTile}</View>
          {onPlayRanked ? (
            <View style={styles.cell}>
              <ModeTile
                testID="home-ranked"
                icon="trophy"
                title={t('home.ranked.title')}
                subtitle={t('home.ranked.subtitle')}
                onPress={onPlayRanked}
              />
            </View>
          ) : null}
          <View style={styles.cell}>{localTile}</View>
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

        {/* The other links in one list (Figma). Screen readers hear How to
            play and History as links, as before #342. */}
        <SectionCard testID="home-links">
          {onJoinWithCode ? (
            <SectionRow
              testID="home-join"
              icon="keyboard"
              iconLook="bare"
              label={t('home.join.title')}
              accessibilityHint={t('home.join.subtitle')}
              onPress={onJoinWithCode}
            />
          ) : null}
          <SectionRow
            testID="home-how-to-play"
            icon="book"
            iconLook="bare"
            label={t('home.howToPlay')}
            accessibilityRole="link"
            onPress={onHowToPlay}
          />
          {onHistory ? (
            <SectionRow
              testID="home-history"
              icon="history"
              iconLook="bare"
              label={t('home.history')}
              accessibilityRole="link"
              onPress={onHistory}
            />
          ) : null}
        </SectionCard>
      </ScrollView>
      <Toast text={toast} />
    </View>
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
    gap: theme.space.xl,
    paddingHorizontal: theme.space.lg,
    paddingTop: rt.insets.top + theme.space.xs,
    paddingBottom: rt.insets.bottom + theme.space.xxxl,
  },
  header: {
    gap: theme.space.xs,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.sm,
    paddingBottom: theme.space.sm,
  },
  brand: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.sm,
  },
  appName: {
    ...theme.type.title3,
    flexShrink: 1,
    color: theme.colors.text,
  },
  welcome: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.md,
  },
  welcomeText: {
    flex: 1,
    minWidth: 0,
    gap: theme.space.xs,
  },
  greeting: {
    ...theme.type.display,
    color: theme.colors.text,
  },
  tagline: {
    ...theme.type.callout,
    color: theme.colors.textDim,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  // Two tiles a row; one a row with a large font. Equal heights in a row.
  cell: {
    flexGrow: 1,
    flexBasis: rt.fontScale > ONE_COLUMN_FONT_SCALE ? '100%' : 0,
    minWidth: 140,
  },
}));

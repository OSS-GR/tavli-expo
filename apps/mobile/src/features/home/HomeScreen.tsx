/**
 * Home (wireframe 3, redesigned in #342): start or continue a game in one
 * or two taps.
 *
 * Top to bottom: the logo, What's new (#471) and Settings, a greeting with
 * the kafeneio table scene (#509; it plays the first time Home shows in an
 * app run), then a big hero card
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
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Image, Pressable, ScrollView, Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { Icon } from '@/components/Icon';
import type { IconName } from '@/components/icons';
import { screenBackground } from '@/components/Screen';
import { SectionHeader } from '@/components/SectionHeader';
import { Toast, useToast } from '@/components/Toast';
import { homeIntroDue, markHomeIntroPlayed } from '@/features/intro/introRuns';
import { TableScene } from '@/features/intro/TableScene';
import type { MatchMode } from '@/features/match/setup';
import { rulesDirection, startBoard } from '@/features/rules/content';
import { WhatsNewButton } from '@/features/whats-new/WhatsNewButton';

import { greetingFor } from './greeting';
import { HomeHero, type HeroBoard } from './HomeHero';
import { ModeTile } from './ModeTile';

const LOGO = require('../../../assets/home/logo.webp') as number;

/** The table scene's width beside the greeting (Figma: 144×108). */
const SCENE_WIDTH = 144;

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
  /**
   * Opens Play ranked (#532). The tile shows only with it (a build with
   * online play); the online tiles then come first.
   */
  onPlayRanked?: () => void;
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
  const { theme, rt } = useUnistyles();
  const perRow = rt.fontScale > ONE_COLUMN_FONT_SCALE ? 1 : 2;
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
  const vsBotLabel = [vsBotTitle, levels].filter(Boolean).join(', ');
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
  // With Play ranked it sits in the grid; without, it spans the row.
  const joinTile = onJoinWithCode ? (
    <ModeTile
      testID="home-join"
      wide={!onPlayRanked}
      icon="keyboard"
      title={t('home.join.title')}
      subtitle={t('home.join.subtitle')}
      onPress={onJoinWithCode}
    />
  ) : null;

  // Plain rows of two (one with a large font), never a wrapping row: iOS
  // measured the tiles of a wrapping row at no width and drew them very
  // tall, with the links below on top of them (build 33).
  const gridTiles: Cell[] = [];
  if (onPlayRanked) {
    // Play ranked (#532, Figma 81:2): the two online tiles first.
    gridTiles.push({ key: 'friend', node: friendTile });
    gridTiles.push({
      key: 'ranked',
      node: (
        <ModeTile
          testID="home-ranked"
          icon="trophy"
          title={t('home.ranked.title')}
          subtitle={t('home.ranked.subtitle')}
          onPress={onPlayRanked}
        />
      ),
    });
    gridTiles.push({ key: 'local', node: localTile });
    if (joinTile) gridTiles.push({ key: 'join', node: joinTile });
  } else {
    gridTiles.push({ key: 'local', node: localTile });
    gridTiles.push({ key: 'friend', node: friendTile });
    // Without Play ranked, Join spans its own row.
    if (joinTile) gridTiles.push({ key: 'join', node: joinTile, wide: true });
  }
  if (onFriends) {
    gridTiles.push({
      key: 'friends',
      node: (
        <ModeTile
          testID="home-friends"
          icon="handshake"
          title={t('home.friends.title')}
          subtitle={t('home.friends.subtitle')}
          onPress={onFriends}
        />
      ),
    });
  }
  if (onRatings) {
    gridTiles.push({
      key: 'ratings',
      node: (
        <ModeTile
          testID="home-ratings"
          icon="trophy"
          title={t('home.ratings.title')}
          subtitle={t('home.ratings.subtitle')}
          onPress={onRatings}
        />
      ),
    });
  }
  const footerLinks: Cell[] = [
    {
      key: 'how-to-play',
      node: (
        <FooterLink
          testID="home-how-to-play"
          icon="book"
          label={t('home.howToPlay')}
          onPress={onHowToPlay}
        />
      ),
    },
  ];
  if (onHistory) {
    footerLinks.push({
      key: 'history',
      node: (
        <FooterLink
          testID="home-history"
          icon="history"
          label={t('home.history')}
          onPress={onHistory}
        />
      ),
    });
  }

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
          <View style={styles.welcome}>
            <View style={styles.welcomeText}>
              <Text style={styles.greeting}>{greeting}</Text>
              <Text style={styles.tagline}>{t('home.tagline')}</Text>
            </View>
            <TableScene width={SCENE_WIDTH} play={playIntro} testID="home-table-scene" />
          </View>
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
          {inRows(gridTiles, perRow).map((row) => (
            <View key={row.map((tile) => tile.key).join()} style={styles.row}>
              {row.map((tile) => (
                <View key={tile.key} style={styles.cell}>
                  {tile.node}
                </View>
              ))}
            </View>
          ))}
        </View>

        <View style={styles.grid}>
          {inRows(footerLinks, perRow).map((row) => (
            <View key={row.map((link) => link.key).join()} style={styles.row}>
              {row.map((link) => (
                <View key={link.key} style={styles.cell}>
                  {link.node}
                </View>
              ))}
            </View>
          ))}
        </View>
      </ScrollView>
      <Toast text={toast} />
    </View>
  );
}

interface Cell {
  key: string;
  node: ReactNode;
  /** Takes a whole row. */
  wide?: boolean;
}

/** Cells in rows of `perRow`; a wide cell gets a row of its own. */
export function inRows(cells: readonly Cell[], perRow: number): Cell[][] {
  const rows: Cell[][] = [];
  let row: Cell[] = [];
  for (const cell of cells) {
    if (cell.wide) {
      if (row.length > 0) rows.push(row);
      rows.push([cell]);
      row = [];
      continue;
    }
    row.push(cell);
    if (row.length === perRow) {
      rows.push(row);
      row = [];
    }
  }
  if (row.length > 0) rows.push(row);
  return rows;
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
    ...theme.type.body,
    color: theme.colors.textDim,
  },
  grid: {
    gap: theme.space.md,
  },
  // Two cells a row (one with a large font, `inRows`); the cells of a row
  // share its width and its height.
  row: {
    flexDirection: 'row',
    gap: theme.space.md,
  },
  cell: {
    flex: 1,
  },
  pill: {
    flexGrow: 1,
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

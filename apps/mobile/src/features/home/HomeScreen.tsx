/**
 * Home (wireframe 3, redesigned in #342): start or continue a game in one
 * or two taps.
 *
 * Top to bottom: the logo, What's new (#471) and Settings, a greeting with
 * the kafeneio table scene (#509; it plays the first time Home shows in an
 * app run), then a big hero card with a board picture: your most
 * important game (`heroPick.ts`, #517), or "Play vs bot". Then the "Learn
 * to play" banner, the reminder card (#404, when one is due), "Your
 * games" (the saved game and the online games not in the hero), your
 * invites, the friend invites to you (#486), "More ways to play" (Play vs
 * bot first when it is not the hero, then Play ranked on a row of its own
 * with your rating, Play a friend, Pass-and-play, Friends with the
 * requests waiting, and Leaderboards, #486, #517), and one list in the
 * tiles' look (#517) with Join with a code (#333, when online play is
 * on), How to play and History.
 */
import type { Difficulty } from '@tavli/contracts';
import { displayCaps } from '@tavli/ui';
import type { TFunction } from 'i18next';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Image, Pressable, ScrollView, Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { Icon } from '@/components/Icon';
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
import { HomeLinks, type HomeLink } from './HomeLinks';
import { ModeTile } from './ModeTile';

const LOGO = require('../../../assets/home/logo.webp') as number;

/** The table scene's width beside the greeting (Figma: 144×108). */
const SCENE_WIDTH = 144;

/** Above this font scale the mode tiles take a row each. */
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
   * Opens "Join with a code" (#333). The row shows only with it (a build
   * with an online server).
   */
  onJoinWithCode?: () => void;
  /**
   * Opens Play ranked (#532). The tile shows only with it (a build with
   * online play), next to Play a friend.
   */
  onPlayRanked?: () => void;
  /** Opens Friends (#406). The tile shows only with it (a build with online play). */
  onFriends?: () => void;
  /** Opens the Leaderboards (#407). The tile shows only with it. */
  onRatings?: () => void;
  /**
   * The player's rating on the Play ranked tile (#517): a number, `null`
   * before the first rated match, `undefined` to show the plain line.
   */
  rankedRating?: number | null;
  /** Friend requests waiting for an answer, on the Friends tile (#517). */
  friendRequests?: number;
  /** The bot levels this build can play, easiest first (the "Play vs bot" subtitle). */
  botLevels: readonly Difficulty[];
  /**
   * The hero card (#517, `heroPick.ts`): an online game, a friend's
   * invite, the saved game or Play ranked. Without it the hero is Play vs
   * bot; with it Play vs bot leads "More ways to play".
   */
  hero?: ReactNode;
  /** The hero is Play ranked: no Play ranked tile. */
  heroRanked?: boolean;
  /** The reminder card (#404): save a guest account, or play online. */
  reminderCard?: ReactNode;
  /** "Your games" (#297, #517): the saved game and the online games not in the hero. */
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
  rankedRating,
  friendRequests = 0,
  botLevels,
  hero,
  heroRanked = false,
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
  // Something else is the hero: Play vs bot leads the tiles.
  const botTile = hero != null;

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

  // Plain rows of two (one with a large font), never a wrapping row: iOS
  // measured the tiles of a wrapping row at no width and drew them very
  // tall, with the links below on top of them (build 33).
  // Order (#517): Play ranked on a row of its own with your rating, then
  // Play a friend | Pass-and-play, then Friends | Leaderboards.
  const rankedLine =
    rankedRating === undefined
      ? t('home.ranked.subtitle')
      : rankedRating === null
        ? t('home.ranked.unrated')
        : t('home.ranked.rated', { rating: rankedRating });
  const gridTiles: Cell[] = [];
  if (onPlayRanked && !heroRanked) {
    gridTiles.push({
      key: 'ranked',
      wide: true,
      node: (
        <ModeTile
          testID="home-ranked"
          wide
          icon="trophy"
          title={t('home.ranked.title')}
          subtitle={rankedLine}
          onPress={onPlayRanked}
        />
      ),
    });
  }
  gridTiles.push({ key: 'friend', node: friendTile });
  gridTiles.push({ key: 'local', node: localTile });
  if (onFriends) {
    gridTiles.push({
      key: 'friends',
      node: (
        <ModeTile
          testID="home-friends"
          icon="handshake"
          title={t('home.friends.title')}
          subtitle={
            friendRequests > 0
              ? t('home.friends.requests', { count: friendRequests })
              : t('home.friends.subtitle')
          }
          highlight={friendRequests > 0}
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
  const links: HomeLink[] = [];
  if (onJoinWithCode) {
    links.push({
      testID: 'home-join',
      icon: 'keyboard',
      label: t('home.join.title'),
      accessibilityHint: t('home.join.subtitle'),
      onPress: onJoinWithCode,
    });
  }
  links.push({
    testID: 'home-how-to-play',
    icon: 'book',
    label: t('home.howToPlay'),
    accessibilityRole: 'link',
    onPress: onHowToPlay,
  });
  if (onHistory) {
    links.push({
      testID: 'home-history',
      icon: 'history',
      label: t('home.history'),
      accessibilityRole: 'link',
      onPress: onHistory,
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

        {hero ?? (
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
        {learnCard}
        {reminderCard}
        {onlineGames}
        {invites}
        {friendInvites}

        <SectionHeader title={t('home.moreModes')} />
        <View style={styles.grid}>
          {botTile ? (
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
          <CellRows cells={gridTiles} perRow={perRow} />
        </View>

        {/* The other links in one list in the tiles' look (#517). Screen
            readers hear How to play and History as links, as before #342. */}
        <HomeLinks testID="home-links" links={links} />
      </ScrollView>
      <Toast text={toast} />
    </View>
  );
}

export interface Cell {
  key: string;
  node: ReactNode;
  /** Takes a whole row. */
  wide?: boolean;
}

/** The cells in rows (`inRows`); the cells of a row share its width and height. */
function CellRows({ cells, perRow }: { cells: readonly Cell[]; perRow: number }) {
  return inRows(cells, perRow).map((row) => (
    <View key={row.map((cell) => cell.key).join()} style={styles.row}>
      {row.map((cell) => (
        <View key={cell.key} style={styles.cell}>
          {cell.node}
        </View>
      ))}
    </View>
  ));
}

/**
 * Cells in rows of `perRow`; a wide cell gets a row of its own. A lone
 * cell in the last row fills it too (`styles.cell` is `flex: 1`).
 */
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
}));

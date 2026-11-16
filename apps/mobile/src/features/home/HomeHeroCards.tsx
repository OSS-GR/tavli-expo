/**
 * The hero cards of Home that `heroPick.ts` picks (#517, Figma 01d), and
 * the saved game's row in "Your games":
 *
 * - `OnlineGameHero`: your turn ("Play") or the other player's ("Open"),
 *   with the board from the game's view (`useHeroBoard`), your side at the
 *   bottom.
 * - `InviteHero`: a friend's invite to you ("See invite"), over the start
 *   position. The invite screen accepts or declines.
 * - `RankedHero`: Play ranked for a ranked regular ("Find").
 * - `SavedGameRow`: the saved game when the hero is an online game.
 *
 * The saved game in the hero is `ContinueCard`; Play vs bot is in
 * `HomeScreen`. Each card is one button; its label says it all.
 */
import {
  RANKED_TURN_TIME_MINUTES,
  type GameSummary,
  type GameTransport,
  type InviteView,
} from '@tavli/contracts';
import { displayCaps } from '@tavli/ui';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { Icon } from '@/components/Icon';
import { clockText } from '@/features/online/clock';
import { gameRowText } from '@/features/online/myGames';
import { playerNameText } from '@/features/online/playerName';
import type { ContinueSummary } from '@/features/match/summary';
import { isRulesGame, rulesDirection, startBoard, type RulesGame } from '@/features/rules/content';

import { HomeHero, type HeroBoard } from './HomeHero';

/** The game a match of `choice` starts with (a Tavli match starts with Portes). */
function firstGame(choice: string): RulesGame {
  return isRulesGame(choice) ? choice : 'portes';
}

/**
 * The board of an online game, live from its view, your side at the
 * bottom. The start position while the view loads, and after an error.
 */
export function useHeroBoard(games: GameTransport, game: GameSummary): HeroBoard {
  const { gameId, mySide, variant } = game;
  const [view, setView] = useState<{ id: string; board: HeroBoard } | null>(null);
  useEffect(
    () =>
      games.subscribe(
        gameId,
        (next) =>
          setView({
            id: gameId,
            board: {
              board: next.game.state.board,
              direction: next.game.state.rules.movement.direction,
              viewer: mySide,
            },
          }),
        // Only a picture: the game screen shows the problem.
        () => {},
      ),
    [games, gameId, mySide],
  );
  if (view !== null && view.id === gameId) return view.board;
  const first = firstGame(variant);
  return { board: startBoard(first), direction: rulesDirection(first), viewer: mySide };
}

export interface OnlineGameHeroProps {
  games: GameTransport;
  game: GameSummary;
  /** The phone time the clock shows, and the server clock minus it. */
  now: number;
  offset: number;
  onPress: () => void;
}

export function OnlineGameHero({ games, game, now, offset, onPress }: OnlineGameHeroProps) {
  const { t } = useTranslation();
  const board = useHeroBoard(games, game);
  const text = gameRowText(game, t, now, offset);
  const me = game.score[game.mySide];
  const friend = game.score[game.mySide === 'white' ? 'black' : 'white'];
  const score = t('home.hero.score', { me, friend, target: game.targetPoints });
  const eyebrow = [text.turn, text.time].filter((part) => part !== null).join(' · ');
  return (
    <HomeHero
      testID="home-hero-game"
      eyebrow={displayCaps(eyebrow)}
      title={text.title}
      lines={[score]}
      action={game.myTurn ? t('home.hero.play') : t('home.hero.open')}
      accessibilityLabel={text.label}
      board={board}
      onPress={onPress}
    />
  );
}

export interface InviteHeroProps {
  invite: InviteView;
  /** The phone time the clock shows. */
  now: number;
  onPress: () => void;
}

export function InviteHero({ invite, now, onPress }: InviteHeroProps) {
  const { t } = useTranslation();
  const name = playerNameText(invite.fromName, t) ?? t('friends.unnamed');
  const title = t('friends.invites.from', { name });
  const game = t('home.invites.game', {
    game: t(`games.${invite.choice}`),
    count: invite.targetPoints,
  });
  const left = invite.expiresAt - now;
  const time =
    left > 0
      ? t('home.invites.left', { time: clockText(left, null, t) })
      : t('home.invites.expiring');
  const eyebrow = `${t('home.hero.invite')} · ${time}`;
  const first = firstGame(invite.choice);
  return (
    <HomeHero
      testID="home-hero-invite"
      eyebrow={displayCaps(eyebrow)}
      title={title}
      lines={[game]}
      action={t('home.hero.seeInvite')}
      accessibilityLabel={`${title}, ${game}, ${time}`}
      board={{ board: startBoard(first), direction: rulesDirection(first) }}
      onPress={onPress}
    />
  );
}

export interface RankedHeroProps {
  /** Your rating, `null` before the first rated match, `undefined` while unknown. */
  rating?: number | null;
  onPress: () => void;
}

export function RankedHero({ rating, onPress }: RankedHeroProps) {
  const { t } = useTranslation();
  const eyebrow =
    rating === undefined || rating === null
      ? t('home.ranked.title')
      : t('home.hero.rankedRated', { rating });
  const title = t('home.hero.findPlayer');
  const line = t('home.hero.rankedLine', { minutes: RANKED_TURN_TIME_MINUTES });
  return (
    <HomeHero
      testID="home-hero-ranked"
      eyebrow={displayCaps(eyebrow)}
      title={title}
      lines={[line]}
      action={t('home.hero.find')}
      accessibilityLabel={`${eyebrow}, ${title}, ${line}`}
      board={{ board: startBoard('portes'), direction: rulesDirection('portes') }}
      onPress={onPress}
    />
  );
}

export interface SavedGameRowProps {
  summary: ContinueSummary;
  /** A game against the bot, or pass-and-play. */
  vsBot: boolean;
  onPress: () => void;
}

/** The saved game in "Your games", in the look of the online rows. */
export function SavedGameRow({ summary, vsBot, onPress }: SavedGameRowProps) {
  const { t } = useTranslation();
  const { theme } = useUnistyles();
  const turn = t('home.games.saved');
  return (
    <Pressable
      testID="home-saved-game"
      accessibilityRole="button"
      accessibilityLabel={`${summary.game}, ${turn}, ${summary.status}`}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      <View style={styles.avatar}>
        <Icon name={vsBot ? 'bot' : 'users'} size={20} color={theme.colors.text} />
      </View>
      <View style={styles.texts}>
        <Text style={styles.title}>{summary.game}</Text>
        <Text style={styles.turn}>{turn}</Text>
        <Text style={styles.line}>{summary.status}</Text>
      </View>
      <Text style={styles.chevron} importantForAccessibility="no">
        {'›'}
      </Text>
    </Pressable>
  );
}

const AVATAR = 40;

const styles = StyleSheet.create((theme) => ({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.md,
    minHeight: theme.touch.row,
    paddingVertical: theme.space.md,
    paddingHorizontal: theme.space.lg,
    borderRadius: theme.radii.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  pressed: {
    opacity: 0.75,
  },
  avatar: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: AVATAR / 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.backgroundDeep,
  },
  texts: {
    flex: 1,
    gap: theme.space.xxs,
  },
  title: {
    ...theme.type.bodyStrong,
    color: theme.colors.text,
  },
  turn: {
    ...theme.type.body,
    color: theme.colors.textDim,
  },
  line: {
    ...theme.type.caption,
    color: theme.colors.textDim,
  },
  chevron: {
    ...theme.type.headline,
    fontSize: 20,
    lineHeight: 26,
    color: theme.colors.textDim,
  },
}));

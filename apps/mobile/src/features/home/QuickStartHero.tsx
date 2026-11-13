/**
 * Play vs bot on Home (#517, Figma option G "Small whole board + quick
 * start"): the raised card that leads Home when there is no saved game.
 *
 * Top: the whole start board at half size, with the title and the level
 * chip beside it. The board and the title open New game (match length,
 * level, house rules). Below: one button per game. One tap starts that
 * game vs the bot at the chip's level. The last game played is brass, the
 * one main button of Home; the others sit in the card.
 *
 * The chip opens a sheet with the levels. Text wraps with a large font:
 * the game buttons then go two per row.
 */
import type { Difficulty } from '@tavli/contracts';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { ActionButton } from '@/components/ActionButton';
import { Icon } from '@/components/Icon';
import { OptionList } from '@/components/settings/OptionList';
import { Sheet } from '@/components/Sheet';
import { surfaceStyle } from '@/components/Surface';
import { boardLayout, useBoardTheme, useHomeBoardSide } from '@/features/board/BoardCanvas';
import { StaticBoard } from '@/features/board/StaticBoard';
import type { GameChoice } from '@/features/match/setup';

import type { HeroBoard } from './HomeHero';

/** The games with a quick start button, in this order (Figma). Asodio stays on New game. */
export const QUICK_START_GAMES = ['portes', 'plakoto', 'fevga', 'tavli'] as const;

export type QuickStartGame = (typeof QUICK_START_GAMES)[number];

/** The board's width beside the title (Figma: 176 of a 344 pt row). */
const BOARD_WIDTH = 176;

/** Above this font scale the game buttons go two per row. */
const TWO_ROWS_FONT_SCALE = 1.3;

export interface QuickStartHeroProps {
  /** The position on the small board (the start position). */
  board: HeroBoard;
  /** The game buttons, in order. Games the bot cannot play are left out. */
  games: readonly QuickStartGame[];
  /** The last game played vs the bot: the brass button. Else the first one. */
  last: GameChoice;
  /** The level the buttons start at (the chip). */
  level: Difficulty;
  /** The levels the chip offers, easiest first. One level: the chip is a plain label. */
  levels: readonly Difficulty[];
  /** The board or the title: New game vs the bot. */
  onMore: () => void;
  onStart: (game: QuickStartGame) => void;
  onLevel: (level: Difficulty) => void;
}

export function QuickStartHero({
  board,
  games,
  last,
  level,
  levels,
  onMore,
  onStart,
  onLevel,
}: QuickStartHeroProps) {
  const { t } = useTranslation();
  const { theme } = useUnistyles();
  const boardTheme = useBoardTheme();
  const homeSide = useHomeBoardSide();
  const aspectRatio = boardLayout(boardTheme, 'classic', homeSide).aspectRatio;
  const [picking, setPicking] = useState(false);
  const brass = games.includes(last as QuickStartGame) ? last : games[0];
  const levelName = t(`bot.levels.${level}`);
  const title = t('home.vsBot.title');

  return (
    <View testID="home-quick-start" style={styles.card}>
      <View style={styles.top}>
        {/* The picture opens New game too; screen readers use the title. */}
        <Pressable
          onPress={onMore}
          accessible={false}
          importantForAccessibility="no-hide-descendants"
          accessibilityElementsHidden
          collapsable={false}
          style={({ pressed }) => [styles.board(aspectRatio), pressed && styles.pressed]}>
          <View pointerEvents="none" style={styles.boardClip}>
            <StaticBoard
              board={board.board}
              view={{ viewer: 'white', direction: board.direction }}
              layout="classic"
              testID="home-vs-bot-board"
            />
          </View>
        </Pressable>
        <View style={styles.side}>
          <Pressable
            testID="home-vs-bot"
            accessibilityRole="button"
            accessibilityLabel={title}
            accessibilityHint={t('home.quickStart.moreHint')}
            onPress={onMore}
            style={({ pressed }) => [styles.titleButton, pressed && styles.pressed]}>
            <Text style={styles.title}>{title}</Text>
            <Icon name="chevronRight" size={18} color={theme.colors.textDim} />
          </Pressable>
          {levels.length > 1 ? (
            <Pressable
              testID="home-bot-level"
              accessibilityRole="button"
              accessibilityLabel={t('home.quickStart.level', { level: levelName })}
              accessibilityHint={t('home.quickStart.levelHint')}
              hitSlop={6}
              onPress={() => setPicking(true)}
              style={({ pressed }) => [styles.chip, pressed && styles.pressed]}>
              <Text style={styles.chipText}>{levelName}</Text>
              <Icon name="chevronDown" size={14} color={theme.colors.textDim} />
            </Pressable>
          ) : levels.length === 1 ? (
            <View
              testID="home-bot-level"
              accessible
              accessibilityLabel={t('home.quickStart.level', { level: levelName })}
              style={styles.chip}>
              <Text style={styles.chipText}>{levelName}</Text>
            </View>
          ) : null}
        </View>
      </View>
      {games.length > 0 ? (
        <View style={styles.games}>
          {games.map((game) => (
            <GameButton
              key={game}
              game={game}
              brass={game === brass}
              levelName={levelName}
              onPress={() => onStart(game)}
            />
          ))}
        </View>
      ) : null}
      <Sheet visible={picking} onClose={() => setPicking(false)} closeLabel={t('common.cancel')}>
        <View style={styles.picker}>
          <Text style={styles.pickerTitle} accessibilityRole="header">
            {t('newGame.botLevel.label')}
          </Text>
          <OptionList
            testID="home-bot-level-picker"
            label={t('newGame.botLevel.label')}
            options={levels.map((value) => ({
              value,
              label: t(`bot.levels.${value}`),
              hint: t(`newGame.botLevel.${value}Hint`),
            }))}
            value={level}
            onChange={(value) => {
              setPicking(false);
              onLevel(value);
            }}
          />
          <ActionButton
            testID="home-bot-level-cancel"
            kind="text"
            label={t('common.cancel')}
            onPress={() => setPicking(false)}
          />
        </View>
      </Sheet>
    </View>
  );
}

interface GameButtonProps {
  game: QuickStartGame;
  brass: boolean;
  levelName: string;
  onPress: () => void;
}

/** One game: its name, and under it the name in the other language (decoration). */
function GameButton({ game, brass, levelName, onPress }: GameButtonProps) {
  const { t } = useTranslation();
  const { theme } = useUnistyles();
  const name = t(`games.${game}`);
  return (
    <Pressable
      testID={`home-quick-${game}`}
      accessibilityRole="button"
      accessibilityLabel={t('home.quickStart.play', { game: name })}
      accessibilityHint={t('home.quickStart.playHint', { level: levelName })}
      onPress={onPress}
      style={({ pressed }) => [styles.game(brass), pressed && styles.pressed]}>
      {brass ? (
        <Icon name="play" size={20} color={theme.colors.onAccent} testID="home-quick-play-icon" />
      ) : null}
      <Text style={styles.gameName(brass)}>{name}</Text>
      <Text style={styles.gameAlt(brass)}>{t(`home.quickStart.alt.${game}`)}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  card: {
    ...surfaceStyle(theme, 'raised'),
    padding: theme.space.md,
    gap: theme.space.md,
  },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.md,
  },
  // Half the row at most, so the title keeps room on a small phone.
  board: (aspectRatio: number) => ({
    width: '50%',
    maxWidth: BOARD_WIDTH,
    aspectRatio,
  }),
  boardClip: {
    flex: 1,
    borderRadius: theme.radii.md,
    overflow: 'hidden',
  },
  side: {
    flex: 1,
    minWidth: 0,
    alignItems: 'flex-start',
    gap: theme.space.xs,
  },
  titleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.xxs,
    minHeight: theme.touch.minTarget,
  },
  title: {
    ...theme.type.title2,
    flexShrink: 1,
    color: theme.colors.text,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.xs,
    paddingHorizontal: theme.space.md,
    paddingVertical: 6,
    borderRadius: theme.radii.pill,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceWell,
  },
  chipText: {
    ...theme.type.caption,
    fontWeight: '500',
    color: theme.colors.text,
  },
  games: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.space.sm,
  },
  // Four equal buttons a row; two a row with a large font.
  game: (brass: boolean) => ({
    flexGrow: 1,
    flexBasis: rt.fontScale > TWO_ROWS_FONT_SCALE ? '40%' : 0,
    minHeight: 76,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.space.xxs,
    paddingVertical: theme.space.sm,
    paddingHorizontal: theme.space.xs,
    borderRadius: theme.radii.lg,
    ...(brass
      ? {
          backgroundColor: theme.colors.accent,
          backgroundImage: `linear-gradient(180deg, ${theme.colors.accentLight} 0%, ${theme.colors.accent} 100%)`,
        }
      : {
          borderWidth: 1,
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.surfaceWell,
        }),
  }),
  gameName: (brass: boolean) => ({
    ...theme.type.title4,
    textAlign: 'center',
    color: brass ? theme.colors.onAccent : theme.colors.text,
  }),
  gameAlt: (brass: boolean) => ({
    ...theme.type.footnote,
    textAlign: 'center',
    color: brass ? theme.colors.onAccent : theme.colors.textDim,
  }),
  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.97 }],
  },
  picker: {
    gap: theme.space.md,
  },
  pickerTitle: {
    ...theme.type.title2,
    color: theme.colors.text,
  },
}));

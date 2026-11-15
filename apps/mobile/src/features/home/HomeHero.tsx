/**
 * The big card at the top of Home (#342): a board picture over a short text,
 * with a brass call to action on its right (#517: no empty half under the
 * text; with a large font the button wraps under it). Home shows your most
 * important game here (`heroPick.ts`, #517): an online game, a friend's
 * invite, the saved game ("Continue game"), Play ranked, or "Play vs bot"
 * over the start position. The whole card is one button; the picture is hidden from
 * screen readers, so the card's label says it all.
 */
import type { BoardState, Direction, PlayerId } from '@tavli/engine';
import { withAlpha } from '@tavli/ui';
import { Text, View, Pressable } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { Icon } from '@/components/Icon';
import { boardLayout, useBoardTheme, useHomeBoardSide } from '@/features/board/BoardCanvas';
import { StaticBoard } from '@/features/board/StaticBoard';

/** A position to draw. */
export interface HeroBoard {
  readonly board: BoardState;
  readonly direction: Direction;
  /** The side at the bottom (default White): your side in an online game. */
  readonly viewer?: PlayerId;
}

export interface HomeHeroProps {
  /** Small caps line over the title, for example "CONTINUE GAME". */
  eyebrow: string;
  title: string;
  /** Lines under the title, dim. */
  lines?: readonly string[];
  /** The text on the brass pill, for example "Continue". */
  action: string;
  /** What a screen reader reads for the whole card. */
  accessibilityLabel: string;
  /** No board: the card has no picture. */
  board?: HeroBoard;
  onPress: () => void;
  testID?: string;
}

export function HomeHero({
  eyebrow,
  title,
  lines = [],
  action,
  accessibilityLabel,
  board,
  onPress,
  testID,
}: HomeHeroProps) {
  const { theme } = useUnistyles();
  const boardTheme = useBoardTheme();
  const homeSide = useHomeBoardSide();
  // The board as on a table: wide and low, so it fits in a card.
  const aspectRatio = boardLayout(boardTheme, 'classic', homeSide).aspectRatio;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
      {board ? (
        <View
          style={styles.picture}
          collapsable={false}
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants">
          <View style={styles.board(aspectRatio)}>
            <StaticBoard
              board={board.board}
              view={{ viewer: board.viewer ?? 'white', direction: board.direction }}
              layout="classic"
              testID={testID ? `${testID}-board` : undefined}
            />
          </View>
        </View>
      ) : null}
      <View style={styles.body}>
        <View style={styles.texts}>
          <Text style={styles.eyebrow}>{eyebrow}</Text>
          <Text style={styles.title}>{title}</Text>
          {lines.map((line) => (
            <Text key={line} style={styles.line}>
              {line}
            </Text>
          ))}
        </View>
        <View style={styles.action}>
          <Icon name="play" size={16} color={theme.colors.onAccent} />
          <Text style={styles.actionText}>{action}</Text>
        </View>
      </View>
    </Pressable>
  );
}

/** Above this text size the button goes under the text. */
const SIDE_BY_SIDE_MAX_FONT_SCALE = 1.3;

const styles = StyleSheet.create((theme, rt) => ({
  card: {
    borderRadius: theme.radii.xl + 8,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    // A warm light from the top left, as from a kafeneio window.
    backgroundImage: `linear-gradient(160deg, ${theme.colors.surfaceSelected} 0%, ${theme.colors.surface} 55%, ${theme.colors.backgroundDeep} 100%)`,
    boxShadow: '0px 14px 32px rgba(0, 0, 0, 0.45)',
    padding: theme.space.md,
    gap: theme.space.md,
  },
  pressed: {
    opacity: 0.9,
    transform: [{ scale: 0.985 }],
  },
  picture: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radii.xl,
    overflow: 'hidden',
    paddingVertical: theme.space.md,
    paddingHorizontal: theme.space.sm,
    backgroundColor: theme.colors.backgroundDeep,
    backgroundImage: `radial-gradient(circle at 50% 35%, ${theme.colors.surfaceSelected} 0%, ${theme.colors.backgroundDeep} 75%)`,
  },
  // Width follows the card; the height stops at about a quarter of the
  // screen, so the play buttons stay in reach on a small phone.
  board: (aspectRatio: number) => ({
    width: '100%',
    maxWidth: (rt.screen.height * 0.24 - theme.space.xl) * aspectRatio,
    aspectRatio,
  }),
  // The text and the button side by side. With a large font the button
  // goes under the text, so neither is squeezed.
  body: {
    ...(rt.fontScale > SIDE_BY_SIDE_MAX_FONT_SCALE
      ? { flexDirection: 'column' as const, alignItems: 'flex-start' as const }
      : { flexDirection: 'row' as const, alignItems: 'center' as const }),
    gap: theme.space.md,
    paddingHorizontal: theme.space.sm,
    paddingBottom: theme.space.sm,
  },
  texts: {
    flexShrink: 1,
    flexGrow: 1,
    gap: theme.space.xs,
  },
  eyebrow: {
    ...theme.type.section,
    color: theme.colors.accent,
  },
  title: {
    ...theme.type.title2,
    color: theme.colors.text,
  },
  line: {
    ...theme.type.caption,
    color: theme.colors.textDim,
  },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.sm,
    minHeight: theme.touch.minTarget,
    paddingHorizontal: theme.space.lg,
    borderRadius: theme.radii.pill,
    backgroundColor: theme.colors.accent,
    boxShadow: `0px 4px 14px ${withAlpha(theme.colors.accent, 0.33)}`,
  },
  actionText: {
    ...theme.type.bodyStrong,
    color: theme.colors.onAccent,
  },
}));

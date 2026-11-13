/**
 * The Play ranked table (#532, Figma 81:2): the kafeneio table with two
 * chairs. Your chair is on the right. The other chair is empty (a dashed
 * brass outline) while the app looks for a player, and filled when a
 * player sits down. The avatars are `CheckerAvatar`s over the chairs.
 *
 * Drawn with Skia on a 150 × 85 grid. It only decorates: screen readers
 * skip it (the screen says the same in text), and it takes no touches.
 */
import {
  Canvas,
  DashPathEffect,
  Group,
  RadialGradient,
  Rect,
  RoundedRect,
  vec,
} from '@shopify/react-native-skia';
import { withAlpha } from '@tavli/ui';
import { View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { CheckerAvatar, type CheckerAvatarSize } from '@/components/CheckerAvatar';

/** The grid of the drawing. */
const GRID_WIDTH = 150;
const GRID_HEIGHT = 85;

/** A player at the table: the avatar's wood comes from `key`, the initials from `name`. */
export interface TablePlayer {
  readonly key: string;
  readonly name: string | null;
}

export interface RankedTableProps {
  /** Width in points; the height follows. */
  width: number;
  /** You, on the right chair. */
  me: TablePlayer;
  /** The other player, or `null` for the empty chair. */
  opponent: TablePlayer | null;
  testID?: string;
}

/** The height of the table at a width. */
export function rankedTableHeight(width: number): number {
  return (width * GRID_HEIGHT) / GRID_WIDTH;
}

/** The avatar size that fits the chair back at this scale (20 grid units across). */
function avatarSize(scale: number): CheckerAvatarSize {
  const want = 20 * scale;
  if (want >= 56) return 56;
  if (want >= 40) return 40;
  if (want >= 32) return 32;
  return 24;
}

/** The left edges of the two chairs, and their avatars' centers. */
const LEFT_CHAIR = 11;
const RIGHT_CHAIR = 110;
const CHAIR_WIDTH = 29;
const AVATAR_Y = 20;

export function RankedTable({ width, me, opponent, testID }: RankedTableProps) {
  const { theme } = useUnistyles();
  const height = rankedTableHeight(width);
  const scale = width / GRID_WIDTH;
  const size = avatarSize(scale);
  const { colors, board } = theme;

  const chair = (x: number, filled: boolean) => (
    <Group>
      <RoundedRect
        x={x}
        y={26}
        width={CHAIR_WIDTH}
        height={35}
        r={4}
        color={filled ? colors.border : withAlpha(colors.accent, 0)}
      />
      <RoundedRect
        x={x}
        y={26}
        width={CHAIR_WIDTH}
        height={35}
        r={4}
        style="stroke"
        strokeWidth={filled ? 1 : 1.5}
        color={filled ? board.frame : colors.accent}>
        {filled ? null : <DashPathEffect intervals={[3, 3]} />}
      </RoundedRect>
      <Rect
        x={x + 4}
        y={61}
        width={3}
        height={17}
        color={filled ? colors.backgroundLamp : colors.accentLine}
      />
      <Rect
        x={x + 22}
        y={61}
        width={3}
        height={17}
        color={filled ? colors.backgroundLamp : colors.accentLine}
      />
    </Group>
  );

  const avatar = (centerX: number, player: TablePlayer, you: boolean) => (
    <View
      style={styles.avatar(centerX * scale - size / 2, AVATAR_Y * scale - size / 2)}
      pointerEvents="none">
      <CheckerAvatar
        testID={you ? 'ranked-table-me' : 'ranked-table-opponent'}
        playerKey={player.key}
        name={player.name}
        size={size}
        you={you}
      />
    </View>
  );

  return (
    <View
      testID={testID}
      style={{ width, height }}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants">
      <Canvas style={{ width, height }}>
        <Group transform={[{ scale }]}>
          {/* The lamp's glow over the table. */}
          <Rect x={0} y={0} width={GRID_WIDTH} height={GRID_HEIGHT}>
            <RadialGradient
              c={vec(GRID_WIDTH / 2, 40)}
              r={70}
              colors={[withAlpha(board.brassLight, 0.35), withAlpha(board.brassLight, 0)]}
            />
          </Rect>
          <Rect x={0} y={79} width={GRID_WIDTH} height={1} color={colors.separator} />
          {chair(LEFT_CHAIR, opponent !== null)}
          {chair(RIGHT_CHAIR, true)}
          {/* The table, its legs and the closed board on it. */}
          <Rect x={52} y={50} width={4} height={29} color={board.frame} />
          <Rect x={94} y={50} width={4} height={29} color={board.frame} />
          <RoundedRect x={46} y={44} width={58} height={6} r={2} color={board.field} />
          <RoundedRect
            x={46}
            y={44}
            width={58}
            height={6}
            r={2}
            style="stroke"
            strokeWidth={1}
            color={board.frame}
          />
          <RoundedRect x={56} y={36} width={38} height={9} r={1.5} color={board.frame} />
          <RoundedRect x={58} y={37.6} width={34} height={6} r={1} color={board.field} />
          <Rect x={74} y={37.6} width={2} height={6} color={board.frame} />
        </Group>
      </Canvas>
      {opponent !== null ? avatar(LEFT_CHAIR + CHAIR_WIDTH / 2, opponent, false) : null}
      {avatar(RIGHT_CHAIR + CHAIR_WIDTH / 2, me, true)}
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: (left: number, top: number) => ({
    position: 'absolute',
    left,
    top,
  }),
});

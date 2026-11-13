/**
 * The Play ranked table (#532, Figma 81:2): a kafeneio table with a tavli
 * board under a hanging lamp, and two chairs. Your chair is on the right.
 * The other chair is an outline in dashed brass while the app looks for a
 * player, and a wooden chair when a player sits down. The chairs stand side
 * on, so the players face each other over the board. Each player is a stick
 * figure in a cap with a komboloi and a Greek coffee (`seatedFigure.ts`).
 * While the other chair is empty, you wait: the komboloi swings and now and
 * then you sip the coffee, in a loop. With Reduce motion, or once a player
 * sits down, the figures keep still.
 *
 * It is drawn in the line style of the Home scene ("Grab a chair", #509):
 * brass lines on wood, and the same table and board (`SCENE_PATHS`). Drawn
 * with Skia on a 270 × 153 grid. It only decorates: screen readers skip it
 * (the screen says the same in text), and it takes no touches.
 */
import {
  Canvas,
  Circle,
  DashPathEffect,
  Group,
  Path,
  RadialGradient,
  Rect,
  vec,
} from '@shopify/react-native-skia';
import { withAlpha } from '@tavli/ui';
import { useEffect } from 'react';
import { View } from 'react-native';
import {
  cancelAnimation,
  Easing,
  useDerivedValue,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { useUnistyles } from 'react-native-unistyles';

import { avatarWood } from '@/components/avatar';
import { BOARD_POINTS, SCENE_PATHS } from '@/features/intro/tableMotion';

import {
  FIGURE_LOOP_MS,
  FIGURE_PATHS,
  figurePose,
  HEAD,
  NECK,
  type FigurePose,
} from './seatedFigure';

/** The grid of the drawing. */
const GRID_WIDTH = 270;
const GRID_HEIGHT = 153;
/** The Home scene's table sits at x 54–186; this moves it to the middle. */
const SHIFT_X = 15;
const SHIFT_Y = -8;

/**
 * A player at the table. `key` picks the wood of the other player's cap
 * (yours is brass). The drawing shows no name: the screen says it in text.
 */
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

/**
 * A kafeneio chair seen from the side, facing right, so the two players
 * face each other over the board. x 0 is the back post at the floor
 * (y 150); the seat reaches to x 36. The left chair draws it as is, the
 * right chair mirrors it.
 */
const CHAIR = {
  frame: [
    // The back post leans back a little, from the floor to the top rail.
    'M2 150 L4 100 Q3 66 -1 34',
    // The two back rails, seen end on.
    'M-4 38 Q1 36 6 38',
    'M-2 51 Q3 49 7 51',
    'M0 100 H36 L35 105 H1 Z',
    'M33 105 V150',
  ],
  rung: 'M3 132 H33',
  weave: 'M3 102.5 H33',
  seat: 'M0 100 H36 L35 105 H1 Z',
} as const;
/** Where the back posts stand, before `SHIFT_X`: the chairs mirror around the table's middle (x 120). */
const LEFT_CHAIR_X = 12;
const RIGHT_CHAIR_X = 228;

/** The hanging lamp, over the table's middle. */
const LAMP = {
  cord: 'M120 8 V24',
  shade: 'M106 38 Q107 24 120 24 Q133 24 134 38 Z',
  bulb: 'M115 38 Q120 43 125 38',
} as const;

const LINE = 2.5;

export function RankedTable({ width, me, opponent, testID }: RankedTableProps) {
  const { theme } = useUnistyles();
  const height = rankedTableHeight(width);
  const scale = width / GRID_WIDTH;
  const reduceMotion = useReducedMotion();
  const { colors, board } = theme;
  const brass = colors.accentLight;
  const wood = colors.surfaceRaised;

  const stroke = (path: string, strokeWidth = LINE, color: string = brass) => (
    <Path
      key={path}
      path={path}
      style="stroke"
      strokeWidth={strokeWidth}
      strokeCap="round"
      strokeJoin="round"
      color={color}
    />
  );

  /** A chair with its back post at `postX`; `facing` is 1 for the left chair, -1 for the right. */
  const chair = (postX: number, facing: 1 | -1, filled: boolean) => (
    <Group transform={[{ translateX: postX }, { scaleX: facing }]}>
      {filled ? (
        <>
          <Path path={CHAIR.seat} color={wood} />
          {stroke(CHAIR.weave, 1, withAlpha(brass, 0.7))}
          {CHAIR.frame.map((p) => stroke(p))}
          {stroke(CHAIR.rung, 1.75)}
        </>
      ) : (
        // The empty chair: the same lines, dashed and faint.
        <Group opacity={0.75}>
          {[...CHAIR.frame, CHAIR.rung].map((p) => (
            <Path
              key={p}
              path={p}
              style="stroke"
              strokeWidth={1.75}
              strokeCap="round"
              color={colors.accent}>
              <DashPathEffect intervals={[4, 4]} />
            </Path>
          ))}
        </Group>
      )}
    </Group>
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
              c={vec(GRID_WIDTH / 2, 50)}
              r={110}
              colors={[withAlpha(board.brassLight, 0.3), withAlpha(board.brassLight, 0)]}
            />
          </Rect>
          <Group transform={[{ translateX: SHIFT_X }, { translateY: SHIFT_Y }]}>
            <Path
              path="M-6 150 H246"
              style="stroke"
              strokeWidth={1}
              color={withAlpha(brass, 0.35)}
            />
            {chair(LEFT_CHAIR_X, 1, opponent !== null)}
            {chair(RIGHT_CHAIR_X, -1, true)}
            {/* The lamp. */}
            {stroke(LAMP.cord, 1.5)}
            <Path path={LAMP.shade} color={brass} />
            {stroke(LAMP.bulb, 1.5, board.brassLight)}
            {/* The table and the open board on it, as on Home. */}
            {SCENE_PATHS.table.backLegs.map((p) => stroke(p))}
            {SCENE_PATHS.table.fills.map((p) => (
              <Path key={p} path={p} color={wood} />
            ))}
            {SCENE_PATHS.table.strokes.map((p) => stroke(p))}
            <Path path={SCENE_PATHS.board.top} color={colors.accentMuted} />
            <Path path={BOARD_POINTS.light} color={colors.text} />
            <Path path={BOARD_POINTS.dark} color={colors.backgroundDeep} />
            {stroke(SCENE_PATHS.board.top, 1.5)}
            {stroke(SCENE_PATHS.board.bar, 1.5)}
            <Path path={SCENE_PATHS.board.frontFill} color={colors.accentMuted} />
            {stroke(SCENE_PATHS.board.front, 1.5)}
            {/* The players, over the table: their hands reach onto it. */}
            {opponent !== null ? (
              <Group transform={[{ translateX: LEFT_CHAIR_X }]}>
                <SeatedFigure waiting={false} cap={theme.avatar[avatarWood(opponent.key)].face} />
              </Group>
            ) : null}
            <Group transform={[{ translateX: RIGHT_CHAIR_X }, { scaleX: -1 }]}>
              <SeatedFigure waiting={opponent === null && !reduceMotion} cap={theme.avatar.you} />
            </Group>
          </Group>
        </Group>
      </Canvas>
    </View>
  );
}

/**
 * One player on the chair's grid (see `seatedFigure.ts`). With `waiting`
 * the loop runs; else the figure keeps the rest pose.
 */
function SeatedFigure({ waiting, cap }: { waiting: boolean; cap: string }) {
  const { theme } = useUnistyles();
  const { colors, board } = theme;
  const time = useSharedValue(0);

  useEffect(() => {
    if (!waiting) return;
    time.set(
      withRepeat(
        withTiming(FIGURE_LOOP_MS, { duration: FIGURE_LOOP_MS, easing: Easing.linear }),
        -1,
      ),
    );
    return () => {
      cancelAnimation(time);
      time.set(0);
    };
  }, [waiting, time]);

  const pose = useDerivedValue(() => figurePose(time.get()));
  const cupArm = useDerivedValue(() => pose.get().cupArm);
  const beadArm = useDerivedValue(() => pose.get().beadArm);
  const beads = useDerivedValue(() => pose.get().beads);
  const legs = useDerivedValue(() => pose.get().legs);
  const head = useDerivedValue(() => [
    { translateX: NECK.x },
    { translateY: NECK.y },
    { rotate: (pose.get().head * Math.PI) / 180 },
    { translateX: HEAD.x },
    { translateY: HEAD.y },
  ]);
  const cup = useDerivedValue(() => {
    const c = pose.get().cup;
    return [{ translateX: c.x }, { translateY: c.y }, { rotate: (c.tilt * Math.PI) / 180 }];
  });

  const ink = colors.text;
  const line = (path: string | typeof cupArm, width = LINE, color: string = ink) => (
    <Path
      path={path}
      style="stroke"
      strokeWidth={width}
      strokeCap="round"
      strokeJoin="round"
      color={color}
    />
  );

  return (
    <Group>
      {/* The arm with the cup is the far one: under the body. */}
      {line(cupArm)}
      {line(legs)}
      {line(FIGURE_PATHS.torso)}
      <Group transform={head}>
        <Circle cx={0} cy={0} r={HEAD.r} style="stroke" strokeWidth={LINE} color={ink} />
        {/* An eye and a kafeneio moustache, looking at the board. */}
        <Circle cx={FIGURE_PATHS.eye.x} cy={FIGURE_PATHS.eye.y} r={1.1} color={ink} />
        {line(FIGURE_PATHS.moustache, 1.5)}
        <Path path={FIGURE_PATHS.cap.crown} color={cap} />
        {line(FIGURE_PATHS.cap.crown, 1.5)}
        {line(FIGURE_PATHS.cap.brim, 2)}
      </Group>
      {line(FIGURE_PATHS.saucer, 1.25, colors.accentLight)}
      {[0, 1].map((i) => (
        <Steam key={i} index={i} pose={pose} color={colors.textDim} />
      ))}
      <Group transform={cup}>
        <Path path={FIGURE_PATHS.cup.body} color={board.pointLight} />
        {line(FIGURE_PATHS.cup.body, 1, colors.accentLight)}
        {line(FIGURE_PATHS.cup.coffee, 1.5, board.pointDark)}
        {line(FIGURE_PATHS.cup.handle, 1, colors.accentLight)}
      </Group>
      {/* The komboloi hand is the near one: over the body. */}
      {line(beadArm)}
      <Path path={beads} color={colors.accent} />
    </Group>
  );
}

/** One wisp of steam over the cup: it rises and fades in and out. */
function Steam({
  index,
  pose,
  color,
}: {
  index: number;
  pose: SharedValue<FigurePose>;
  color: string;
}) {
  const transform = useDerivedValue(() => {
    const wisp = pose.get().steam[index]!;
    return [{ translateX: wisp.x }, { translateY: wisp.y }];
  });
  const opacity = useDerivedValue(() => pose.get().steam[index]!.opacity);
  return (
    <Group transform={transform} opacity={opacity}>
      <Path
        path={FIGURE_PATHS.steam}
        style="stroke"
        strokeWidth={1}
        strokeCap="round"
        color={color}
      />
    </Group>
  );
}

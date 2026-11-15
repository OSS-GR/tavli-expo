/**
 * "Grab a chair" (#509): the kafeneio table scene, drawn with Skia. It
 * builds up piece by piece (#512): the table, their chair, the board, then
 * your chair (the timeline is `tableFrame` in `tableMotion.ts`).
 *
 * With `play` it runs once from the start when it mounts (after `delayMs`,
 * on its first frame); without it, or
 * with "Reduce motion" on, it shows the last frame. It only decorates:
 * screen readers skip it, and it takes no touches.
 */
import { Canvas, Circle, Group, Path } from '@shopify/react-native-skia';
import { useEffect } from 'react';
import { View } from 'react-native';
import {
  Easing,
  useDerivedValue,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { useUnistyles } from 'react-native-unistyles';

import {
  BOARD_ORIGIN,
  BOARD_POINTS,
  CHAIR_ORIGIN,
  dustPuffs,
  SCENE_HEIGHT,
  SCENE_PATHS,
  SCENE_WIDTH,
  TABLE_ORIGIN,
  TABLE_SCENE_MS,
  tableFrame,
  type TableFrame,
} from './tableMotion';

export interface TableSceneProps {
  /** Width in points; the height follows (4:3). */
  width: number;
  /** Run the scene once from the start. Else (or with Reduce motion) the last frame. */
  play: boolean;
  /** With `play`: wait this long on the first frame before the scene runs. */
  delayMs?: number;
  testID?: string;
}

/** The height of the scene at a width. */
export function tableSceneHeight(width: number): number {
  return (width * SCENE_HEIGHT) / SCENE_WIDTH;
}

const LINE = 2.5;

export function TableScene({ width, play, delayMs = 0, testID }: TableSceneProps) {
  const { theme } = useUnistyles();
  const reduceMotion = useReducedMotion();
  const animate = play && !reduceMotion;
  const time = useSharedValue(animate ? 0 : TABLE_SCENE_MS);

  useEffect(() => {
    if (!animate) return;
    time.set(
      withDelay(
        delayMs,
        withTiming(TABLE_SCENE_MS, { duration: TABLE_SCENE_MS, easing: Easing.linear }),
      ),
    );
  }, [animate, delayMs, time]);

  const frame = useDerivedValue(() => tableFrame(time.get()));
  const floorOpacity = useDerivedValue(() => 0.25 * frame.get().floor);
  const tableTransform = useDerivedValue(() => {
    const f = frame.get();
    return [
      { translateX: f.tableX },
      { translateY: f.tableDip },
      { rotate: (f.tableRotate * Math.PI) / 180 },
    ];
  });
  const theirTransform = useDerivedValue(() => {
    const f = frame.get();
    return [{ translateX: f.theirX }, { translateY: f.theirY }];
  });
  const boardTransform = useDerivedValue(() => {
    const f = frame.get();
    return [
      { translateY: f.boardY + f.tableDip },
      { scaleX: f.boardScaleX },
      { scaleY: f.boardScaleY },
    ];
  });
  const linesTransform = useDerivedValue(() => [{ translateY: frame.get().boardY }]);
  const linesOpacity = useDerivedValue(() => frame.get().lines);
  const dustOpacity = useDerivedValue(() => frame.get().dust);
  const chairTransform = useDerivedValue(() => {
    const f = frame.get();
    return [
      { translateX: f.chairX },
      { translateY: f.chairY },
      { rotate: (f.chairRotate * Math.PI) / 180 },
      { scale: f.chairScale },
    ];
  });

  const brass = theme.colors.accentLight;
  const wood = theme.colors.surfaceRaised;
  const box = { width, height: tableSceneHeight(width) };
  const stroke = (path: string, strokeWidth = LINE) => (
    <Path
      key={path}
      path={path}
      style="stroke"
      strokeWidth={strokeWidth}
      strokeCap="round"
      strokeJoin="round"
      color={brass}
    />
  );

  return (
    // `collapsable={false}`: the canvas keeps one native parent (#173).
    <View
      testID={testID}
      style={box}
      collapsable={false}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants">
      <Canvas style={box}>
        <Group transform={[{ scale: width / SCENE_WIDTH }]}>
          <Path
            path={SCENE_PATHS.floor}
            style="stroke"
            strokeWidth={1}
            color={brass}
            opacity={floorOpacity}
          />
          <Group transform={theirTransform}>
            <Path path={SCENE_PATHS.theirChair.fill} color={wood} />
            {SCENE_PATHS.theirChair.strokes.map((p) => stroke(p))}
          </Group>
          <Group transform={tableTransform} origin={TABLE_ORIGIN}>
            {SCENE_PATHS.table.backLegs.map((p) => stroke(p))}
            {SCENE_PATHS.table.fills.map((p) => (
              <Path key={p} path={p} color={wood} />
            ))}
            {SCENE_PATHS.table.strokes.map((p) => stroke(p))}
          </Group>
          <Group transform={linesTransform} opacity={linesOpacity}>
            {SCENE_PATHS.speedLines.map((p) => stroke(p, 1.5))}
          </Group>
          <Group transform={boardTransform} origin={BOARD_ORIGIN}>
            <Path path={SCENE_PATHS.board.top} color={theme.colors.accentMuted} />
            <Path path={BOARD_POINTS.light} color={theme.colors.text} />
            <Path path={BOARD_POINTS.dark} color={theme.colors.backgroundDeep} />
            {stroke(SCENE_PATHS.board.top, 1.5)}
            {stroke(SCENE_PATHS.board.bar, 1.5)}
            <Path path={SCENE_PATHS.board.frontFill} color={theme.colors.accentMuted} />
            {stroke(SCENE_PATHS.board.front, 1.5)}
          </Group>
          <Group opacity={dustOpacity}>
            {[0, 1, 2, 3].map((i) => (
              <Puff key={i} index={i} frame={frame} color={brass} />
            ))}
          </Group>
          <Group transform={chairTransform} origin={CHAIR_ORIGIN}>
            <Path path={SCENE_PATHS.yourChair.fill} color={wood} />
            {SCENE_PATHS.yourChair.weave.map((p) => (
              <Path
                key={p}
                path={p}
                style="stroke"
                strokeWidth={1.25}
                strokeCap="round"
                color={brass}
                opacity={0.7}
              />
            ))}
            {SCENE_PATHS.yourChair.strokes.map((p) => stroke(p, 3))}
            {stroke(SCENE_PATHS.yourChair.rung)}
          </Group>
        </Group>
      </Canvas>
    </View>
  );
}

/** One dust puff: a small ring that drifts out from the landing. */
function Puff({
  index,
  frame,
  color,
}: {
  index: number;
  frame: SharedValue<TableFrame>;
  color: string;
}) {
  const cx = useDerivedValue(() => dustPuffs(frame.get().dustSpread)[index]!.x);
  const cy = useDerivedValue(() => dustPuffs(frame.get().dustSpread)[index]!.y);
  const r = dustPuffs(0)[index]!.r;
  return <Circle cx={cx} cy={cy} r={r} style="stroke" strokeWidth={1.5} color={color} />;
}

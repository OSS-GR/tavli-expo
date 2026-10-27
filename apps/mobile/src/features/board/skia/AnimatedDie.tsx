/**
 * A die that tumbles and lands on `value` (Skia + Reanimated, UI thread).
 * A new `rollKey` starts a new roll. `used` fades the die.
 *
 * A die of a double can start in the pair (`pairAt`, big) and slide to its
 * place in the grid (`x`, `y`, `size`) when `split` turns on (#177).
 */
import { Group } from '@shopify/react-native-skia';
import type { DiceStyle } from '@tavli/themes';
import { useEffect } from 'react';
import {
  Easing,
  useDerivedValue,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import {
  DOUBLE_SPLIT_MS,
  FADE_MS,
  ROLL_MS,
  ROLL_STAGGER_MS,
  USED_OPACITY,
  tumble,
  tumbleFace,
  type DicePlace,
} from '../diceMotion';

import { DieBody, DiePips } from './DieShape';

export interface AnimatedDieProps {
  style: DiceStyle;
  x: number;
  y: number;
  size: number;
  value: number;
  /** Place in the row: later dice land a bit later and spin the other way. */
  index: number;
  tilt: number;
  used: boolean;
  /** Changes on every new roll. `null`: show the die at rest, no roll. */
  rollKey: string | null;
  /** Called on the JS thread when this die lands. */
  onLand?: () => void;
  /**
   * A double (#177): the die's place in the pair of rolled dice. It sits
   * there until `split`, then slides to `x`, `y`, `size`.
   */
  pairAt?: DicePlace;
  /** With `pairAt`: `false` keeps the die in the pair. Default `true`. */
  split?: boolean;
  /** With `pairAt`: the die appears at the split and slides out of the pair. */
  slideIn?: boolean;
}

function Face({
  face,
  k,
  style,
  size,
}: {
  face: SharedValue<number>;
  k: number;
  style: DiceStyle;
  size: number;
}) {
  const opacity = useDerivedValue(() => (face.get() === k ? 1 : 0));
  return (
    <Group opacity={opacity}>
      <DiePips style={style} size={size} value={k} />
    </Group>
  );
}

const FACES = [1, 2, 3, 4, 5, 6];

export function AnimatedDie({
  style,
  x,
  y,
  size,
  value,
  index,
  tilt,
  used,
  rollKey,
  onLand,
  pairAt,
  split = true,
  slideIn = false,
}: AnimatedDieProps) {
  const progress = useSharedValue(1);
  const fade = useSharedValue(used ? USED_OPACITY : 1);
  // 0: in the pair, 1: at x, y, size.
  const moved = useSharedValue(pairAt !== undefined && (!split || slideIn) ? 0 : 1);

  useEffect(() => {
    if (rollKey === null) return;
    progress.set(0);
    progress.set(
      withTiming(
        1,
        { duration: ROLL_MS + index * ROLL_STAGGER_MS, easing: Easing.out(Easing.quad) },
        (finished) => {
          if (finished && onLand) scheduleOnRN(onLand);
        },
      ),
    );
    // Only a new roll restarts the animation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rollKey]);

  useEffect(() => {
    fade.set(withTiming(used ? USED_OPACITY : 1, { duration: FADE_MS }));
  }, [used, fade]);

  useEffect(() => {
    if (split && moved.get() < 1) {
      moved.set(withTiming(1, { duration: DOUBLE_SPLIT_MS, easing: Easing.out(Easing.cubic) }));
    }
  }, [split, moved]);

  // Draw at the larger size and scale down: a die that shrinks stays sharp.
  const drawSize = Math.max(size, pairAt?.size ?? 0);
  const transform = useDerivedValue(() => {
    const m = moved.get();
    const from = pairAt ?? { x, y, size };
    const s = from.size + (size - from.size) * m;
    const f = tumble(progress.get(), index, s, tilt);
    return [
      { translateX: from.x + (x - from.x) * m },
      { translateY: from.y + (y - from.y) * m + f.dy },
      { rotate: f.rotate },
      { scale: (f.scale * s) / drawSize },
    ];
  });
  const face = useDerivedValue(() => tumbleFace(progress.get(), index, value));
  // A die that slides in stays hidden under its pair die until the split starts.
  const opacity = useDerivedValue(() => (slideIn && moved.get() === 0 ? 0 : fade.get()));

  return (
    <Group transform={transform} opacity={opacity}>
      <DieBody style={style} size={drawSize} />
      {FACES.map((k) => (
        <Face key={k} face={face} k={k} style={style} size={drawSize} />
      ))}
    </Group>
  );
}

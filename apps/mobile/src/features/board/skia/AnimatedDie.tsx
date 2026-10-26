/**
 * A die that tumbles and lands on `value` (Skia + Reanimated, UI thread).
 * A new `rollKey` starts a new roll. `used` fades the die.
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

import { FADE_MS, ROLL_MS, ROLL_STAGGER_MS, USED_OPACITY, tumble, tumbleFace } from '../diceMotion';

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
}: AnimatedDieProps) {
  const progress = useSharedValue(1);
  const fade = useSharedValue(used ? USED_OPACITY : 1);

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

  const transform = useDerivedValue(() => {
    const f = tumble(progress.get(), index, size, tilt);
    return [{ translateX: x }, { translateY: y + f.dy }, { rotate: f.rotate }, { scale: f.scale }];
  });
  const face = useDerivedValue(() => tumbleFace(progress.get(), index, value));

  return (
    <Group transform={transform} opacity={fade}>
      <DieBody style={style} size={size} />
      {FACES.map((k) => (
        <Face key={k} face={face} k={k} style={style} size={size} />
      ))}
    </Group>
  );
}

/**
 * A thrown die on the board (Skia + Reanimated, #183 spike). It plays one
 * `DieTrack` of a `ThrowPlan` back: `clock` is the time into the throw in
 * ms. The pose and the face are read on the UI thread (`sampleAt`).
 */
import { Group } from '@shopify/react-native-skia';
import type { DiceStyle } from '@tavli/themes';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';

import { DieBody, DiePips } from '@/features/board/skia/DieShape';

import { sampleAt, type DieTrack } from './throwPath';

export interface ThrownDieProps {
  style: DiceStyle;
  track: DieTrack;
  sampleMs: number;
  size: number;
  clock: SharedValue<number>;
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

export function ThrownDie({ style, track, sampleMs, size, clock }: ThrownDieProps) {
  const transform = useDerivedValue(() => {
    const p = sampleAt(track, sampleMs, clock.get());
    return [{ translateX: p.x }, { translateY: p.y }, { rotate: p.angle }, { scale: p.scale }];
  });
  const face = useDerivedValue(() => sampleAt(track, sampleMs, clock.get()).face);
  return (
    <Group transform={transform}>
      <DieBody style={style} size={size} />
      {FACES.map((k) => (
        <Face key={k} face={face} k={k} style={style} size={size} />
      ))}
    </Group>
  );
}

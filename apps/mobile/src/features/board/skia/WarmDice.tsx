/**
 * The dice warm-up for the web (#679).
 *
 * Safari builds a drawing program (a shader) the first time a kind of shape
 * is drawn in a canvas, and that blocks the page (about 280 ms on the first
 * roll of a game). `WarmDice` draws the dice once, in the first moments of
 * a canvas, so the programs are ready before the first roll:
 *
 * - two dice at rest, as the dice row draws them (one used and lost, for
 *   the faded die and its slash);
 * - one die in each of `POSES`: a roll and a throw turn and scale the die,
 *   and a turned or scaled shape needs other programs than one at rest.
 *
 * The poses are fixed, not a real roll: an animation that starts when its
 * canvas mounts does not run on the web, so only the first frame was drawn.
 *
 * The caller keeps the warm-up out of sight: under the board art, or in a
 * canvas with opacity 0. A small clip does not work: Skia then draws simpler
 * shapes, and the real programs are still missing.
 */
import { Group } from '@shopify/react-native-skia';
import type { DiceStyle } from '@tavli/themes';
import { useEffect, useState } from 'react';

import { WEB_BOARD } from '../webBoard';

import { AnimatedDie } from './AnimatedDie';
import { DieBody, DiePips } from './DieShape';

/** Long enough for the canvas to draw a few frames. */
export const WARM_MS = 1000;

/**
 * Turns (radians) and scales that a roll (`tumble`: scale 0.72 to 1) and a
 * throw (`ThrownDie`: a little over 1) pass through.
 */
export const POSES: readonly { rotate: number; scale: number }[] = [
  { rotate: 1.0, scale: 0.72 },
  { rotate: 2.4, scale: 0.86 },
  { rotate: 4.1, scale: 0.95 },
  { rotate: 0.7, scale: 1.18 },
];

/** True for the first moments after the caller mounts, on the web only. */
export function useWarming(): boolean {
  const [on, setOn] = useState(WEB_BOARD);
  useEffect(() => {
    if (!on) return undefined;
    const timer = setTimeout(() => setOn(false), WARM_MS);
    return () => clearTimeout(timer);
  }, [on]);
  return on;
}

export interface WarmDiceProps {
  style: DiceStyle;
  size: number;
  x: number;
  y: number;
}

export function WarmDice({ style, size, x, y }: WarmDiceProps) {
  if (size <= 0) return null;
  return (
    <>
      <AnimatedDie
        style={style}
        x={x}
        y={y}
        size={size}
        value={5}
        index={0}
        tilt={11}
        used={false}
        rollKey={null}
      />
      <AnimatedDie
        style={style}
        x={x}
        y={y}
        size={size}
        value={3}
        index={1}
        tilt={-9}
        used
        lost
        rollKey={null}
      />
      {POSES.map((pose) => (
        <Group
          key={pose.rotate}
          transform={[
            { translateX: x },
            { translateY: y },
            { rotate: pose.rotate },
            { scale: pose.scale },
          ]}>
          <DieBody style={style} size={size} />
          <DiePips style={style} size={size} value={6} />
        </Group>
      ))}
    </>
  );
}

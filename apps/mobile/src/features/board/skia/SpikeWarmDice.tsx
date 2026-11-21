// SPIKE (#640): Safari builds a drawing program (shader) the first time a
// kind of shape is drawn, and that blocks the page (about 280 ms on the
// first roll). This rolls real dice once, out of sight, in the first moments
// of a canvas, so the programs are ready before the first roll. The caller
// hides them: under the board art, or with an invisible canvas. (A small
// clip does not work: Skia then draws simpler shapes.)
import type { DiceStyle } from '@tavli/themes';
import { useEffect, useState } from 'react';

import { SPIKE } from '@/spikeFlags';

import { AnimatedDie } from './AnimatedDie';

/** True for the first moments after the caller mounts. */
export function useSpikeWarming(ms = 1500): boolean {
  const [on, setOn] = useState(SPIKE.warm);
  useEffect(() => {
    if (!on) return undefined;
    const timer = setTimeout(() => setOn(false), ms);
    return () => clearTimeout(timer);
  }, [on, ms]);
  return on;
}

export function SpikeWarmDice({
  style,
  size,
  x,
  y,
}: {
  style: DiceStyle;
  size: number;
  x: number;
  y: number;
}) {
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
        tilt={0.2}
        used={false}
        rollKey="warm"
      />
      <AnimatedDie
        style={style}
        x={x}
        y={y}
        size={size}
        value={3}
        index={1}
        tilt={-0.2}
        used
        lost
        rollKey="warm"
      />
    </>
  );
}

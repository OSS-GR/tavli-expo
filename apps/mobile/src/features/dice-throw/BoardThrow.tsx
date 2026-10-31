/**
 * The dice throw in a real game (issue #183, the step after the spike).
 *
 * A roll in a real game — by swipe, tap on the board, or the Roll button —
 * plays the same throw the dev board screen plays: `planThrow` works out a
 * path that ends on the rolled values (they come from the engine, the
 * animation never picks a value), and Reanimated plays it back on the UI
 * thread over the board. Then the normal dice row takes over (the screen
 * shows it only after `onDone`, so the roll tumbles once, not twice).
 *
 * One component instance is one throw: the screen mounts it with a `key`
 * that changes on each roll. With Reduce Motion on, the screen never mounts
 * it: the dice appear as before.
 *
 * The roll sound plays from the store event (`gameFeedback`); this
 * component plays only the knocks of the flight.
 */
import type { ThemeManifest } from '@tavli/themes';
import { useEffect, useState } from 'react';
import { Easing, useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import type { BoardGeometry } from '@/features/board/geometry';
import type { GameFeedback } from '@/features/feedback/feedback';

import { boardThrowBox, throwBar, throwDieSize } from './throwField';
import {
  THROW_TUNING,
  buttonThrow,
  hitCues,
  planThrow,
  settlePlan,
  swipeToThrow,
  tapThrow,
  type Box,
  type SettleTarget,
  type ThrowBar,
  type ThrowPlan,
  type ThrowStart,
} from './throwPath';
import { ThrownDie } from './ThrownDie';

/**
 * The touch that caused the roll, in the board's points. A swipe carries
 * where the finger went down (`x`, `y`), its translation (`dx`, `dy`) and
 * finger speed (`vx`, `vy`); a tap carries only its position. The opening
 * card sends neither: it never throws.
 */
export interface ThrowSwipe {
  readonly x?: number;
  readonly y?: number;
  readonly dx?: number;
  readonly dy?: number;
  readonly vx?: number;
  readonly vy?: number;
}

export interface BoardThrowProps {
  theme: ThemeManifest;
  /** The rolled values: the animation lands on them, never picks them. */
  values: readonly [number, number];
  geo: BoardGeometry;
  /** `null`: the throw comes from the near wall (the button, a tap, the bot). */
  swipe: ThrowSwipe | null;
  /**
   * The roller's wall, so a tap-to-roll comes from the side the roller looks at
   * the board from (the viewer's wall) rather than a fixed edge (#183).
   */
  nearEnd: 'top' | 'bottom';
  /**
   * Where each die glides after the throw, into its place in the dice row
   * (`settleTargets`, in the same points as `geo`). `null`: the row takes
   * over where the dice stopped (landscape: the row is outside the canvas).
   */
  settle?: readonly [SettleTarget, SettleTarget] | null;
  feedback: GameFeedback;
  /** The throw ended: the screen shows the dice row. */
  onDone: () => void;
}

/** Button throws alternate their slight sideways angle. */
let buttonTurns = 0;

/**
 * The throw a touch asks for: a swipe comes in from the wall closest to
 * where the finger went down, a tap from the roller's wall under the tap
 * (`nearEnd`), and the button (also the bot) from the middle, a bit to the side.
 */
function throwStart(
  swipe: ThrowSwipe | null,
  box: Box,
  dieSize: number,
  bar: ThrowBar | undefined,
  nearEnd: 'top' | 'bottom',
): ThrowStart {
  if (swipe === null) return buttonThrow(box, buttonTurns++);
  if (swipe.dx !== undefined && swipe.dy !== undefined) {
    return swipeToThrow(
      swipe.x === undefined || swipe.y === undefined ? undefined : { x: swipe.x, y: swipe.y },
      { x: swipe.dx, y: swipe.dy },
      swipe.vx === undefined || swipe.vy === undefined ? undefined : { x: swipe.vx, y: swipe.vy },
      box,
      dieSize,
      bar,
    );
  }
  if (swipe.x !== undefined && swipe.y !== undefined) {
    return tapThrow({ x: swipe.x, y: swipe.y }, box, dieSize, THROW_TUNING, nearEnd);
  }
  return buttonThrow(box, buttonTurns++);
}

export function BoardThrow({
  theme,
  values,
  geo,
  swipe,
  nearEnd,
  settle,
  feedback,
  onDone,
}: BoardThrowProps) {
  // One throw per mount: the plan never changes.
  const [plan] = useState<ThrowPlan>(() => {
    const box = boardThrowBox(geo);
    const dieSize = throwDieSize(geo);
    const bar = throwBar(geo);
    const start = throwStart(swipe, box, dieSize, bar, nearEnd);
    const plan = planThrow({ box, bar, start, dieSize, values, tilts: geo.layout.dice.tilt });
    return settle ? settlePlan(plan, settle, dieSize) : plan;
  });
  const clock = useSharedValue(0);

  useEffect(
    () => {
      const timers = hitCues(plan.hits).map((ms) =>
        setTimeout(() => feedback.event('diceLand'), ms),
      );
      clock.set(0);
      clock.set(
        withTiming(
          plan.durationMs,
          { duration: plan.durationMs, easing: Easing.linear },
          (finished) => {
            'worklet';
            if (finished) scheduleOnRN(onDone);
          },
        ),
      );
      return () => timers.forEach(clearTimeout);
    },
    // One throw per mount: the plan and the cues never change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  return plan.dice.map((track, i) => (
    <ThrownDie
      key={i}
      style={theme.dice}
      track={track}
      sampleMs={plan.sampleMs}
      size={throwDieSize(geo)}
      clock={clock}
    />
  ));
}

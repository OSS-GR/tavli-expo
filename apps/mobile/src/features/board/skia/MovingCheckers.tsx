/**
 * Checkers that move on the UI thread (Skia + Reanimated): a checker in
 * flight (a move, a hit, an undo) and the checker under the finger.
 */
import { Group } from '@shopify/react-native-skia';
import type { PlayerId } from '@tavli/engine';
import type { ThemeManifest } from '@tavli/themes';
import { useEffect } from 'react';
import {
  Easing,
  useDerivedValue,
  useSharedValue,
  withDelay,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { toneOf } from '../boardModel';
import { FLIGHT_MS, flightMs, type Flight } from '../flights';

import { CheckerShape } from './CheckerShape';

/** A checker drawn around (0, 0) with radius 1; the parent scales it. */
function UnitChecker({ theme, owner }: { theme: ThemeManifest; owner: PlayerId }) {
  return (
    <CheckerShape
      cx={0}
      cy={0}
      r={1}
      style={theme.checkers[toneOf(owner)]}
      shadow={theme.checkers.shadow}
    />
  );
}

/** The lift in the middle of a flight: a little bigger, as if picked up. */
export function flightPose(flight: Flight, p: number) {
  'worklet';
  const t = Math.min(1, Math.max(0, p));
  const via = flight.via ?? [];
  if (via.length === 0) {
    const lift = Math.sin(t * Math.PI) * 0.12;
    return {
      x: flight.from.x + (flight.to.x - flight.from.x) * t,
      y: flight.from.y + (flight.to.y - flight.from.y) * t,
      r: (flight.fromR + (flight.toR - flight.fromR) * t) * (1 + lift),
    };
  }
  // A path (#180): `p` runs evenly over the legs. Each leg slows down at its
  // end, so the checker visibly stops on each middle point.
  const start = { x: flight.from.x, y: flight.from.y, r: flight.fromR };
  const stops = [start, ...via, { x: flight.to.x, y: flight.to.y, r: flight.toR }];
  const legs = stops.length - 1;
  const leg = Math.min(legs - 1, Math.floor(t * legs));
  const local = t * legs - leg;
  const eased = 1 - (1 - local) * (1 - local) * (1 - local);
  const a = stops[leg] ?? start;
  const b = stops[leg + 1] ?? a;
  const lift = Math.sin(eased * Math.PI) * 0.12;
  return {
    x: a.x + (b.x - a.x) * eased,
    y: a.y + (b.y - a.y) * eased,
    r: (a.r + (b.r - a.r) * eased) * (1 + lift),
  };
}

export function FlightChecker({
  theme,
  flight,
  onDone,
}: {
  theme: ThemeManifest;
  flight: Flight;
  onDone: (id: string) => void;
}) {
  const progress = useSharedValue(0);
  const shown = useSharedValue(flight.hiddenMs === undefined ? 1 : 0);
  useEffect(() => {
    if (flight.hiddenMs !== undefined) {
      shown.set(withDelay(flight.hiddenMs, withTiming(1, { duration: 0 })));
    }
    progress.set(
      withDelay(
        flight.delay,
        withTiming(
          1,
          // A path eases each leg itself (`flightPose`), so its clock runs evenly.
          flight.via?.length
            ? { duration: flightMs(flight), easing: Easing.linear }
            : { duration: FLIGHT_MS, easing: Easing.out(Easing.cubic) },
          (finished) => {
            if (finished) scheduleOnRN(onDone, flight.id);
          },
        ),
      ),
    );
    // A flight runs once, when it mounts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const transform = useDerivedValue(() => {
    const pose = flightPose(flight, progress.get());
    return [{ translateX: pose.x }, { translateY: pose.y }, { scale: pose.r }];
  });
  return (
    <Group transform={transform} opacity={shown}>
      <UnitChecker theme={theme} owner={flight.owner} />
    </Group>
  );
}

/** The checker under the finger. `visible` is 0 or 1. */
export function DragChecker({
  theme,
  owner,
  x,
  y,
  r,
  visible,
}: {
  theme: ThemeManifest;
  owner: PlayerId;
  x: SharedValue<number>;
  y: SharedValue<number>;
  r: SharedValue<number>;
  visible: SharedValue<number>;
}) {
  const transform = useDerivedValue(() => [
    { translateX: x.get() },
    { translateY: y.get() },
    // A picked-up checker is a little bigger.
    { scale: r.get() * 1.1 },
  ]);
  return (
    <Group transform={transform} opacity={visible}>
      <UnitChecker theme={theme} owner={owner} />
    </Group>
  );
}

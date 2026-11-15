/**
 * The turn clock ring around a seat's checker or avatar (#530, Figma
 * "14 Play ranked", screens 5 to 7). The track is the sunken surface; the
 * arc is the time left. It empties clockwise from 12 o'clock.
 *
 * The ring only decorates: the seat's label says the time left. It has no
 * animation of its own: the screen draws it again each second, with
 * Reduce Motion too.
 *
 * The wrapper always holds its children (`collapsable={false}`), and the
 * ring comes and goes beside them, so the avatar keeps its native parent
 * when the turn moves to the other seat (#173).
 */
import { Canvas, Path } from '@shopify/react-native-skia';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

/** The ring's line width in points. */
export const RING_STROKE = 3;
/** The gap between the ring and the checker inside it. */
const RING_GAP = 4;

/** The ring's outer size around a checker of `size` points. */
export function ringSize(size: number): number {
  return size + 2 * (RING_GAP + RING_STROKE);
}

/** A circle that starts at 12 o'clock and goes clockwise, as an SVG path. */
export function ringPath(outer: number): string {
  const c = outer / 2;
  const r = (outer - RING_STROKE) / 2;
  return `M ${c} ${c - r} A ${r} ${r} 0 1 1 ${c} ${c + r} A ${r} ${r} 0 1 1 ${c} ${c - r}`;
}

export interface TurnRingProps {
  /** The checker or avatar inside, `size` points wide. */
  children: ReactNode;
  size: number;
  /**
   * The ring: the share of the turn left (1 to 0) and its colors. `null`:
   * no ring, but the same room, so the seat does not move when the turn
   * passes.
   */
  ring: { readonly left: number; readonly color: string; readonly track: string } | null;
  testID?: string;
}

export function TurnRing({ children, size, ring, testID }: TurnRingProps) {
  const outer = ringSize(size);
  const path = ringPath(outer);
  return (
    <View style={styles.box(outer)} collapsable={false}>
      {ring !== null ? (
        <View
          testID={testID}
          style={styles.ring(outer)}
          collapsable={false}
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants">
          <Canvas style={styles.canvas(outer)}>
            <Path path={path} style="stroke" strokeWidth={RING_STROKE} color={ring.track} />
            {ring.left > 0 ? (
              <Path
                path={path}
                style="stroke"
                strokeWidth={RING_STROKE}
                strokeCap="round"
                color={ring.color}
                // The part used up runs from 12 o'clock, clockwise.
                start={1 - ring.left}
                end={1}
              />
            ) : null}
          </Canvas>
        </View>
      ) : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  box: (outer: number) => ({
    width: outer,
    height: outer,
    alignItems: 'center',
    justifyContent: 'center',
  }),
  ring: (outer: number) => ({
    position: 'absolute',
    left: 0,
    top: 0,
    width: outer,
    height: outer,
  }),
  canvas: (outer: number) => ({
    width: outer,
    height: outer,
  }),
});

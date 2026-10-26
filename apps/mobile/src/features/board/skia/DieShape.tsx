/**
 * One die (Skia), from the theme `DiceStyle`. Lengths in die units.
 *
 * `DieBody` and `DiePips` draw around (0, 0), so a parent `Group` can move,
 * turn and scale the die (the roll animation does). `DieShape` is a still die.
 */
import { BlurMask, Circle, Group, RadialGradient, RoundedRect } from '@shopify/react-native-skia';
import type { DiceStyle } from '@tavli/themes';

import { radialProps, rgba } from '../paint';

/** Pip places for each face, in pip-spacing steps from the center. */
export const PIP_LAYOUT: Readonly<Record<number, readonly (readonly [number, number])[]>> = {
  1: [[0, 0]],
  2: [
    [-1, -1],
    [1, 1],
  ],
  3: [
    [-1, -1],
    [0, 0],
    [1, 1],
  ],
  4: [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ],
  5: [
    [-1, -1],
    [1, -1],
    [0, 0],
    [-1, 1],
    [1, 1],
  ],
  6: [
    [-1, -1],
    [1, -1],
    [-1, 0],
    [1, 0],
    [-1, 1],
    [1, 1],
  ],
};

/** The top face box of a die of `size`, centered on (0, 0). */
function faceBox(style: DiceStyle, size: number) {
  const h = size / 2;
  const inset = style.faceInset * size;
  const width = size - 2.5 * inset;
  return { x: -h + inset, y: -h + inset * 0.7, width, height: width };
}

export function DieBody({ style, size }: { style: DiceStyle; size: number }) {
  const h = size / 2;
  const corner = style.cornerRadius * size;
  const face = faceBox(style, size);
  return (
    <Group>
      <RoundedRect
        x={-h + style.shadow.dx * size}
        y={-h + style.shadow.dy * size}
        width={size}
        height={size}
        r={corner}
        color={rgba(style.shadow.color, style.shadow.opacity)}>
        <BlurMask blur={style.shadow.blur * size} style="normal" />
      </RoundedRect>
      <RoundedRect x={-h} y={-h} width={size} height={size} r={corner} color={style.side} />
      <RoundedRect {...face} r={corner * 0.85} color={style.face} />
      <RoundedRect {...face} r={corner * 0.85} opacity={style.highlightOpacity}>
        <RadialGradient {...radialProps(style.highlight, face)} />
      </RoundedRect>
      <RoundedRect
        x={-h + 0.5}
        y={-h + 0.5}
        width={size - 1}
        height={size - 1}
        r={corner}
        style="stroke"
        strokeWidth={style.edgeWidth * size}
        color={style.edge}
      />
    </Group>
  );
}

export function DiePips({ style, size, value }: { style: DiceStyle; size: number; value: number }) {
  const face = faceBox(style, size);
  const cx = face.x + face.width / 2;
  const cy = face.y + face.height / 2;
  const step = style.pipSpacing * size;
  return (
    <Group>
      {(PIP_LAYOUT[value] ?? []).map(([u, v], i) => (
        <Circle
          key={i}
          cx={cx + u * step}
          cy={cy + v * step}
          r={style.pipRadius * size}
          color={value === 1 ? style.acePip : style.pip}
        />
      ))}
    </Group>
  );
}

export interface DieShapeProps {
  style: DiceStyle;
  x: number;
  y: number;
  size: number;
  value: number;
  /** Resting angle in degrees. */
  tilt?: number;
  opacity?: number;
}

/** A still die centered on (x, y). */
export function DieShape({ style, x, y, size, value, tilt = 0, opacity = 1 }: DieShapeProps) {
  return (
    <Group
      opacity={opacity}
      transform={[{ translateX: x }, { translateY: y }, { rotate: (tilt * Math.PI) / 180 }]}>
      <DieBody style={style} size={size} />
      <DiePips style={style} size={size} value={value} />
    </Group>
  );
}

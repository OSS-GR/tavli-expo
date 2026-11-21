/**
 * The browser twin of `Icon` (#677): the same path data (`icons.ts`), drawn
 * as inline SVG.
 *
 * Why not Skia here: on the web every Skia canvas is a WebGL context, and a
 * browser keeps only about 16 of them. Home alone has more icons than that,
 * so the oldest canvases (the board among them) went blank. SVG has no such
 * limit, and it stays sharp at any zoom.
 *
 * Icons only decorate: screen readers skip them (`aria-hidden`), so the
 * button or link around one needs its own label.
 */
import { createElement } from 'react';
import { View } from 'react-native';

import { ICONS, type IconName } from './icons';

export interface IconProps {
  name: IconName;
  color: string;
  /** Width and height in points. Icons keep their size with a large font. */
  size?: number;
  /** Line width on the 24 pt grid. Default 2; the empty-state medallion uses 1.6. */
  strokeWidth?: number;
  testID?: string;
}

export function Icon({ name, color, size = 24, strokeWidth = 2, testID }: IconProps) {
  const shape: { strokes: readonly string[]; fills?: readonly string[] } = ICONS[name];
  return (
    <View testID={testID} style={{ width: size, height: size }} pointerEvents="none" aria-hidden>
      {createElement(
        'svg',
        { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', focusable: 'false' },
        ...shape.strokes.map((d) =>
          createElement('path', {
            key: `s${d}`,
            d,
            stroke: color,
            strokeWidth,
            strokeLinecap: 'round',
            strokeLinejoin: 'round',
          }),
        ),
        ...(shape.fills ?? []).map((d) => createElement('path', { key: `f${d}`, d, fill: color })),
      )}
    </View>
  );
}

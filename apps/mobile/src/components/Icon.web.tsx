/**
 * SPIKE (#637): the web twin of `Icon`. A browser allows about 16 WebGL
 * contexts, and each Skia canvas uses one, so icons are inline SVG here.
 */
import { createElement } from 'react';
import { View } from 'react-native';

import { ICONS, type IconName } from './icons';

export interface IconProps {
  name: IconName;
  color: string;
  size?: number;
  strokeWidth?: number;
  testID?: string;
}

export function Icon({ name, color, size = 24, strokeWidth = 2, testID }: IconProps) {
  const shape: { strokes: readonly string[]; fills?: readonly string[] } = ICONS[name];
  return (
    <View testID={testID} style={{ width: size, height: size }} pointerEvents="none" aria-hidden>
      {createElement(
        'svg',
        { width: size, height: size, viewBox: '0 0 24 24', fill: 'none' },
        ...shape.strokes.map((d) =>
          createElement('path', {
            key: d,
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

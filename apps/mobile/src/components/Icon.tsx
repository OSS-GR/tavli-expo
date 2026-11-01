/**
 * A small line icon drawn with Skia (`icons.ts`). Icons only decorate:
 * screen readers skip them, so the button or link around one needs its own
 * label.
 */
import { Canvas, Group, Path } from '@shopify/react-native-skia';
import { View } from 'react-native';

import { ICONS, type IconName } from './icons';

export interface IconProps {
  name: IconName;
  color: string;
  /** Width and height in points. Icons keep their size with a large font. */
  size?: number;
  testID?: string;
}

export function Icon({ name, color, size = 24, testID }: IconProps) {
  const shape: { strokes: readonly string[]; fills?: readonly string[] } = ICONS[name];
  const box = { width: size, height: size };
  return (
    // `collapsable={false}`: the canvas keeps one native parent (#173).
    <View
      testID={testID}
      style={box}
      collapsable={false}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants">
      <Canvas style={box}>
        <Group transform={[{ scale: size / 24 }]}>
          {shape.strokes.map((path) => (
            <Path
              key={path}
              path={path}
              style="stroke"
              strokeWidth={2}
              strokeCap="round"
              strokeJoin="round"
              color={color}
            />
          ))}
          {shape.fills?.map((path) => (
            <Path key={path} path={path} style="fill" color={color} />
          ))}
        </Group>
      </Canvas>
    </View>
  );
}

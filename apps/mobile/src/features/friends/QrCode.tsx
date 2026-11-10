/**
 * A QR code (#406), drawn with Skia: dark modules on white, with the
 * quiet zone. The colors stay the same in every theme: a camera reads
 * dark on light best. Screen readers read `label`, not the drawing.
 */
import { Canvas, Group, Path, Rect } from '@shopify/react-native-skia';
import { useMemo } from 'react';
import { View } from 'react-native';

import { qrModules, qrPath } from './qr';

/** The code's own colors, not theme colors (see above). */
const DARK = '#000000';
const LIGHT = '#FFFFFF';

export interface QrCodeProps {
  /** The text in the code. */
  value: string;
  /** Width and height in points. */
  size: number;
  /** What a screen reader reads. */
  label: string;
  testID?: string;
}

export function QrCode({ value, size, label, testID }: QrCodeProps) {
  const code = useMemo(() => qrPath(qrModules(value)), [value]);
  const box = { width: size, height: size };
  return (
    // `collapsable={false}`: the canvas keeps one native parent (#173).
    <View
      testID={testID}
      style={box}
      collapsable={false}
      accessible
      accessibilityRole="image"
      accessibilityLabel={label}>
      <Canvas style={box}>
        <Rect x={0} y={0} width={size} height={size} color={LIGHT} />
        <Group transform={[{ scale: size / code.size }]}>
          <Path path={code.path} color={DARK} />
        </Group>
      </Canvas>
    </View>
  );
}

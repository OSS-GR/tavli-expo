/**
 * The dice in the controls row (wireframes 6c–6f): two dice side by side,
 * or four smaller dice in a 2 x 2 grid for a double. Used dice fade.
 * The values always come from the engine flow.
 */
import { Canvas } from '@shopify/react-native-skia';
import type { ThemeManifest } from '@tavli/themes';
import { useTranslation } from 'react-i18next';

import type { DieView } from '@/features/game/gameStore';

import { AnimatedDie } from './skia/AnimatedDie';

/** Size of one die when two are shown, in points. */
export const DIE_SIZE = 44;
/** Doubles show four dice at this fraction of the size. */
const GRID_SCALE = 0.62;

export interface DicePlace {
  readonly x: number;
  readonly y: number;
  readonly size: number;
}

/** Where each die sits in the row. Pure, so tests can check it. */
export function dicePlaces(
  count: number,
  size = DIE_SIZE,
): {
  places: DicePlace[];
  width: number;
  height: number;
} {
  const pad = size * 0.3; // room for the hop and the shadow
  if (count === 4) {
    const s = size * GRID_SCALE;
    const gap = s * 0.18;
    const cell = s + gap;
    const width = 2 * cell + 2 * pad;
    const height = Math.max(size + 2 * pad, 2 * cell + pad);
    const x0 = width / 2 - cell / 2;
    const y0 = height / 2 - cell / 2;
    return {
      places: [0, 1, 2, 3].map((i) => ({
        x: x0 + (i % 2) * cell,
        y: y0 + Math.floor(i / 2) * cell,
        size: s,
      })),
      width,
      height,
    };
  }
  const gap = size * 0.3;
  const width = count * size + (count - 1) * gap + 2 * pad;
  const height = size + 2 * pad;
  return {
    places: Array.from({ length: count }, (_, i) => ({
      x: pad + size / 2 + i * (size + gap),
      y: height / 2,
      size,
    })),
    width,
    height,
  };
}

export interface DiceRowProps {
  theme: ThemeManifest;
  dice: readonly DieView[];
  /** Changes on each new roll; `null` shows the dice at rest. */
  rollKey: string | null;
  /** Called once when the last die lands. */
  onLanded?: () => void;
  size?: number;
  testID?: string;
}

export function DiceRow({ theme, dice, rollKey, onLanded, size = DIE_SIZE, testID }: DiceRowProps) {
  const { t } = useTranslation();
  const { places, width, height } = dicePlaces(dice.length, size);
  const tilt = theme.layouts['portrait-rotated'].dice.tilt;
  const label = t('game.dice.label', {
    values: dice.map((d) => String(d.value)).join('-'),
    left: dice.filter((d) => !d.used).length,
  });
  return (
    <Canvas
      testID={testID}
      accessible
      accessibilityRole="image"
      accessibilityLabel={label}
      style={{ width, height }}>
      {dice.map((d, i) => {
        const place = places[i];
        if (place === undefined) return null;
        return (
          <AnimatedDie
            key={`${rollKey ?? 'rest'}:${i}`}
            style={theme.dice}
            x={place.x}
            y={place.y}
            size={place.size}
            value={d.value}
            index={i}
            tilt={tilt[i % 2] ?? 0}
            used={d.used}
            rollKey={rollKey}
            {...(i === dice.length - 1 && onLanded ? { onLand: onLanded } : {})}
          />
        );
      })}
    </Canvas>
  );
}

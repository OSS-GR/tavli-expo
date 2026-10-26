/**
 * The dice in the controls row (wireframes 6c–6f): two dice side by side,
 * or four smaller dice in a 2 x 2 grid for a double. Used dice fade.
 * The values always come from the engine flow.
 */
import { Canvas } from '@shopify/react-native-skia';
import type { ThemeManifest } from '@tavli/themes';
import { useTranslation } from 'react-i18next';

import type { DieView } from '@/features/game/gameStore';

import { DIE_SIZE, dicePlaces } from './diceMotion';
import { AnimatedDie } from './skia/AnimatedDie';

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

/**
 * The dice (wireframes 6c–6f): two dice side by side,
 * or four smaller dice in a 2 x 2 grid for a double. Used dice fade.
 * The values always come from the engine flow.
 *
 * A double (#177) first shows the two rolled dice, like any roll. With
 * `split` it turns into four: each rolled die slides to the top row of the
 * grid, and a copy of it slides out from under it to the bottom row. The
 * screen decides when (`useDoubleReveal`). On the board the pair keeps
 * the size of any roll (`pairSize`) and the grid dice are a bit larger.
 */
import { Canvas } from '@shopify/react-native-skia';
import type { ThemeManifest } from '@tavli/themes';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import type { DieView } from '@/features/game/gameStore';

import { DIE_SIZE, dicePlaces, doublePlaces, type DicePlace } from './diceMotion';
import { AnimatedDie } from './skia/AnimatedDie';

export interface DiceRowProps {
  theme: ThemeManifest;
  dice: readonly DieView[];
  /** Changes on each new roll; `null` shows the dice at rest. */
  rollKey: string | null;
  /**
   * A double: `false` shows only the two rolled dice, `true` the four dice
   * to play. Default `true`. A change to `true` plays the split. Dice at
   * rest (`rollKey` null) always show four.
   */
  split?: boolean;
  /** Called once when the last rolled die lands. */
  onLanded?: () => void;
  /**
   * Show the roll without playing it: the dice have just been thrown on the
   * board (issue #183), so the row must not tumble again. It keeps until
   * the next roll changes `rollKey`.
   */
  rest?: boolean;
  size?: number;
  /** A double: the size of its two rolled dice before the split. Default `size`. */
  pairSize?: number;
  testID?: string;
}

interface Slot {
  readonly place: DicePlace;
  /** A double: the die's place in the pair before the split. */
  readonly pairAt?: DicePlace;
  /** This die rolls (a double rolls only its first two dice). */
  readonly rolls: boolean;
}

export function DiceRow({
  theme,
  dice,
  rollKey,
  split: givenSplit = true,
  onLanded,
  rest = false,
  size = DIE_SIZE,
  pairSize = size,
  testID,
}: DiceRowProps) {
  const { t } = useTranslation();
  const double = dice.length === 4;
  // Dice at rest (no roll) always show all four of a double. A thrown roll
  // (`rest`) keeps the reveal of a double: only its tumble is off.
  const split = givenSplit || (!rest && rollKey === null);
  // Did this row show the pair of this roll? Then the split slides the new
  // dice out of the pair. Otherwise (a double at rest) the grid shows at once.
  const [pairShown, setPairShown] = useState<string | null>(null);
  const pairKey = rollKey ?? 'rest';
  if (double && !split && pairShown !== pairKey) setPairShown(pairKey);
  const slideIn = double && pairShown === pairKey;

  let slots: Slot[];
  let width: number;
  let height: number;
  if (double) {
    const box = doublePlaces(size, pairSize);
    ({ width, height } = box);
    slots = box.grid.map((place, i) => ({ place, pairAt: box.pair[i % 2], rolls: i < 2 }));
  } else {
    const row = dicePlaces(dice.length, size);
    ({ width, height } = row);
    slots = row.places.map((place) => ({ place, rolls: true }));
  }
  // The last die that rolls calls `onLanded`.
  const lastRoller = double ? 1 : dice.length - 1;

  const tilt = theme.layouts['portrait-rotated'].dice.tilt;
  const label = t('game.dice.label', {
    values: dice.map((d) => String(d.value)).join('-'),
    left: dice.filter((d) => !d.used).length,
  });
  return (
    // The canvas always sits in this native view (`collapsable={false}`), so
    // it never moves to another native parent when a view around it changes.
    // On iOS a Skia canvas that moves loses its drawing (#173). The split of a
    // double happens inside this one canvas.
    <View collapsable={false} style={{ width, height }}>
      <Canvas
        testID={testID}
        accessible
        accessibilityRole="image"
        accessibilityLabel={label}
        style={{ width, height }}>
        {dice.map((d, i) => {
          const slot = slots[i];
          if (slot === undefined) return null;
          // Before the split a double draws only its two rolled dice.
          if (!slot.rolls && !split) return null;
          return (
            <AnimatedDie
              key={`${rollKey ?? 'rest'}:${i}`}
              style={theme.dice}
              x={slot.place.x}
              y={slot.place.y}
              size={slot.place.size}
              value={d.value}
              index={i}
              tilt={tilt[i % 2] ?? 0}
              used={d.used}
              rollKey={rest ? null : slot.rolls ? rollKey : null}
              {...(slot.pairAt ? { pairAt: slot.pairAt, split } : {})}
              {...(!slot.rolls && slideIn ? { slideIn: true } : {})}
              {...(i === lastRoller && onLanded ? { onLand: onLanded } : {})}
            />
          );
        })}
      </Canvas>
    </View>
  );
}

/**
 * When a double shows its four dice (#177). The owner's play test: "the 4
 * dice show up before the user can understand he rolled doubles."
 *
 * So a double first shows the two rolled dice, like any roll. They land
 * (`DICE_LAND_MS`), stay a beat (`DOUBLE_BEAT_MS`), then split into four
 * (`DOUBLE_SPLIT_AT_MS` after the roll). A short "Doubles!" label shows
 * from the split on, for `DOUBLE_LABEL_MS`.
 *
 * Dice at rest (`rollKey` null: the pass card, the tutorial) show the four
 * dice at once. So does a double with a used die: the player was quicker
 * than the beat, and a faded die must be one of the four. Once split, the
 * dice stay split for that roll, also after an undo.
 */
import { useEffect, useState } from 'react';

import type { DieView } from '@/features/game/gameStore';

import { DOUBLE_SPLIT_AT_MS } from './diceMotion';

/** How long the "Doubles!" label shows, from the split on. */
export const DOUBLE_LABEL_MS = 1500;

export interface DoubleReveal {
  /** `false`: show only the two rolled dice. Always `true` for a roll that is not a double. */
  readonly split: boolean;
  /** Show the "Doubles!" label. */
  readonly label: boolean;
}

/** `early`: split by a quick move. `label`: split, with the label. `done`: split, no label. */
type Stage = 'early' | 'label' | 'done';

export function useDoubleReveal(rollKey: string | null, dice: readonly DieView[]): DoubleReveal {
  const double = dice.length === 4;
  const [stage, setStage] = useState<{ key: string; stage: Stage } | null>(null);
  useEffect(() => {
    if (!double || rollKey === null) return;
    const atSplit = setTimeout(
      () => setStage({ key: rollKey, stage: 'label' }),
      DOUBLE_SPLIT_AT_MS,
    );
    const atEnd = setTimeout(
      () => setStage({ key: rollKey, stage: 'done' }),
      DOUBLE_SPLIT_AT_MS + DOUBLE_LABEL_MS,
    );
    return () => {
      clearTimeout(atSplit);
      clearTimeout(atEnd);
    };
  }, [double, rollKey]);

  if (!double || rollKey === null) return { split: true, label: false };
  const now = stage?.key === rollKey ? stage.stage : null;
  // A used die splits the dice at once, and they stay split (an undo too).
  if (now === null && dice.some((d) => d.used)) setStage({ key: rollKey, stage: 'early' });
  return {
    split: now !== null || dice.some((d) => d.used),
    label: now === 'label',
  };
}

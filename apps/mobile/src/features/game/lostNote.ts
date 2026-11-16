/**
 * The words for a die you cannot play (#579, Figma 17 v2): a short line
 * ("The 5 can't be played") and the reason. The engine picks the reason
 * (`lostDiceWithReason`); this file only turns it into text.
 */
import type { DieValue, LostDice } from '@tavli/engine';
import type { TFunction } from 'i18next';

/** "The 5 can't be played", or for a double "Two 3s can't be played". */
export function lostLine(t: TFunction, lost: LostDice): string {
  const value = lost.dice[0];
  if (lost.reason === 'double') {
    const count = lost.dice.length;
    const key =
      count >= 3
        ? 'game.lostNote.double3'
        : count === 2
          ? 'game.lostNote.double2'
          : 'game.lostNote.double1';
    return t(key, { value });
  }
  if (lost.dice.length > 1) return t('game.dice.lost', { count: lost.dice.length, value });
  return t('game.lostNote.die', { value });
}

/** Why the dice are lost, as one sentence. `roll` is this turn's roll. */
export function lostReason(
  t: TFunction,
  lost: LostDice,
  roll: readonly [DieValue, DieValue],
): string {
  const value = lost.dice[0];
  if (lost.reason === 'higherDie') {
    return t('game.lostNote.reason.higherDie', { high: Math.max(roll[0], roll[1]) });
  }
  return t(`game.lostNote.reason.${lost.reason}`, { value });
}

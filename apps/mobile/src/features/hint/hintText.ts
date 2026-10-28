/**
 * The words of a hint (#209), in the move list's notation: "13 → 8, 6 → 5"
 * on screen, and the full sentences of the move list for screen readers.
 * The game review (#215) names its turns with the same helpers.
 */
import type { Move } from '@tavli/engine';
import type { TFunction } from 'i18next';

import { choiceLabel, choiceShortLabel } from '@/features/accessibility/moveChoices';

import { hintGroups } from './hint';

/** Moves on screen, one group per checker run: "13 → 8, 6 → 5". */
export function movesShortText(t: TFunction, moves: readonly Move[]): string {
  return hintGroups(moves)
    .map((group) => choiceShortLabel(t, group))
    .join(', ');
}

/** Moves for a screen reader: "Checker from point 13 to point 8; …". */
export function movesSpokenText(t: TFunction, moves: readonly Move[]): string {
  return hintGroups(moves)
    .map((group) => choiceLabel(t, group))
    .join('; ');
}

/** The short text on screen: "Hint: 13 → 8, 6 → 5". */
export function hintShortText(t: TFunction, moves: readonly Move[]): string {
  return t('game.hint.text', { moves: movesShortText(t, moves) });
}

/** What a screen reader says: "Hint: Checker from point 13 to point 8; …". */
export function hintSpokenText(t: TFunction, moves: readonly Move[]): string {
  return t('game.hint.text', { moves: movesSpokenText(t, moves) });
}

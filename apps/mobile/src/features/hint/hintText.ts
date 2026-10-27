/**
 * The words of a hint (#209), in the move list's notation: "13 → 8, 6 → 5"
 * on screen, and the full sentences of the move list for screen readers.
 */
import type { Move } from '@tavli/engine';
import type { TFunction } from 'i18next';

import { choiceLabel, choiceShortLabel } from '@/features/accessibility/moveList';

import { hintGroups } from './hint';

/** The short text on screen: "Hint: 13 → 8, 6 → 5". */
export function hintShortText(t: TFunction, moves: readonly Move[]): string {
  const list = hintGroups(moves)
    .map((group) => choiceShortLabel(t, group))
    .join(', ');
  return t('game.hint.text', { moves: list });
}

/** What a screen reader says: "Hint: Checker from point 13 to point 8; …". */
export function hintSpokenText(t: TFunction, moves: readonly Move[]): string {
  const list = hintGroups(moves)
    .map((group) => choiceLabel(t, group))
    .join('; ');
  return t('game.hint.text', { moves: list });
}

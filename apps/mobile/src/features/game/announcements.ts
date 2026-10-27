/**
 * What the board screen reads to screen reader users as the game goes on
 * (#134). Pure.
 *
 * - After a roll: "Bob rolled 5-3." (or "You rolled 5-3.").
 * - After another player's turn: "Bob played: Checker from point 13 to
 *   point 8; …. Your turn." Vs the bot that is the bot's turn; in
 *   pass-and-play every turn, so the next player hears what happened.
 *
 * Other parts read themselves, so nothing here says it twice: the opening
 * card (who starts), the pass card (the roll and why nothing moved), the
 * mother question, the game-end sheet and the match-end screen.
 */
import { matchPhase, type MatchFlow, type PlayerId } from '@tavli/engine';
import type { TFunction } from 'i18next';

import { moveLabel } from '@/features/accessibility/moveList';

export interface Announcement {
  /** One per event, so the same text is read again for a new event. */
  readonly key: string;
  readonly text: string;
}

export interface AnnouncementNames {
  readonly nameOf: (player: PlayerId) => string;
  /** The person holding the phone vs the bot ("You rolled …"). */
  readonly isYou: (player: PlayerId) => boolean;
}

export function turnAnnouncement(
  flow: MatchFlow,
  t: TFunction,
  { nameOf, isYou }: AnnouncementNames,
): Announcement | null {
  if (matchPhase(flow) !== 'playing') return null;
  const game = flow.game;
  const key = `${flow.match.games.length}:${game.state.turnNumber}`;
  const dice = game.state.dice;
  // The opening dice: the opening card already said who starts and with what.
  const fromOpening = game.opening !== null && game.lastTurn === null;
  if (game.phase === 'moving' && game.played.length === 0 && dice !== null && !fromOpening) {
    const player = game.state.toMove;
    const vars = { name: nameOf(player), dice: dice.join('-') };
    return {
      key: `${key}:roll`,
      text: isYou(player) ? t('game.announce.rolled_you', vars) : t('game.announce.rolled', vars),
    };
  }
  const last = game.lastTurn;
  if (game.phase !== 'awaiting-roll' || last === null || last.moves.length === 0) return null;
  if (isYou(last.player)) return null;
  const moves = last.moves.map((move) => moveLabel(t, move)).join('; ');
  const lines = [t('game.announce.played', { name: nameOf(last.player), moves })];
  // An Asodio extra roll keeps the same player: then there is no "next".
  const next = game.state.toMove;
  if (next !== last.player) {
    lines.push(isYou(next) ? t('game.pass.next_you') : t('game.pass.next', { name: nameOf(next) }));
  }
  return { key: `${key}:played`, text: lines.join(' ') };
}

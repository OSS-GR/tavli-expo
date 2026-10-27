/**
 * What the board screen reads to screen reader users as the game goes on
 * (#134). Pure.
 *
 * - After a roll: "Bob rolled 5-3." (or "You rolled 5-3."). A double:
 *   "You rolled double 4: four moves of 4." (#177). Greek names each double
 *   by its value ("Έφερες τεσσάρες: …"), so the name is a key per value
 *   (`game.doubles.name.N`).
 * - A chosen double (Acey-Deucey Asodio, after a 1-2): "You chose double 4:
 *   four moves of 4." Nothing was rolled (#202). For another player it
 *   first reads the 1-2 they played: "Bob played: …. Bob chose double 4:
 *   four moves of 4." The question comes between that turn and this one, so
 *   that turn has no line of its own.
 * - After another player's turn: "Bob played: Checker from point 13 to
 *   point 8; …. Your turn." Vs the bot that is the bot's turn; in
 *   pass-and-play every turn, so the next player hears what happened.
 *
 * - After the players picked who starts (house rule `chosenStarterRolls`,
 *   #207): "Maria starts." (or "You start.").
 *
 * Other parts read themselves, so nothing here says it twice: the opening
 * card (who starts), the pass card (the roll and why nothing moved), the
 * mother question, the game-end sheet and the match-end screen.
 */
import { isDouble, matchPhase, type MatchFlow, type PlayerId } from '@tavli/engine';
import type { TFunction } from 'i18next';

import { moveLabel } from '@/features/accessibility/moveList';

import { openingDiceInPlay } from './opening';
import { diceWereRolled } from './rolledDice';

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
  // With `rerollBoth` (#207) the starter rolls again: that roll is read.
  const fromOpening = openingDiceInPlay(flow);
  if (game.phase === 'moving' && game.played.length === 0 && dice !== null && !fromOpening) {
    const player = game.state.toMove;
    const name = nameOf(player);
    // A chosen double (#202): the player picked these dice, nobody rolled.
    if (!diceWereRolled(flow) && isDouble(dice)) {
      const value = dice[0];
      const vars = { name, value, double: t(`game.doubles.name.${value}`) };
      if (isYou(player)) {
        return { key: `${key}:chosen`, text: t('game.announce.choseDouble_you', vars) };
      }
      const lines = [t('game.announce.choseDouble', vars)];
      const last = game.lastTurn;
      if (last !== null && last.player === player && last.moves.length > 0) {
        const moves = last.moves.map((move) => moveLabel(t, move)).join('; ');
        lines.unshift(t('game.announce.played', { name, moves }));
      }
      return { key: `${key}:chosen`, text: lines.join(' ') };
    }
    // A double says that it plays four times (#177): the dice row shows the
    // two dice first and the four a moment later, but this is read once.
    if (isDouble(dice)) {
      const value = dice[0];
      const vars = { name, value, double: t(`game.doubles.name.${value}`) };
      return {
        key: `${key}:roll`,
        text: isYou(player)
          ? t('game.announce.rolledDouble_you', vars)
          : t('game.announce.rolledDouble', vars),
      };
    }
    const vars = { name, dice: dice.join('-') };
    return {
      key: `${key}:roll`,
      text: isYou(player) ? t('game.announce.rolled_you', vars) : t('game.announce.rolled', vars),
    };
  }
  // The starter card (`chosenStarterRolls`, #207) closed: say who starts.
  if (game.phase === 'awaiting-roll' && flow.log[flow.log.length - 1]?.type === 'chooseStarter') {
    const player = game.state.toMove;
    return {
      key: `${key}:starter`,
      text: isYou(player)
        ? t('game.announce.chosenStarter_you')
        : t('game.announce.chosenStarter', { name: nameOf(player) }),
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

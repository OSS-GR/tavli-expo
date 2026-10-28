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
import { isDouble, matchPhase, type GameFlow, type MatchFlow, type PlayerId } from '@tavli/engine';
import type { TFunction } from 'i18next';

import { moveLabel } from '@/features/accessibility/moveList';

import { openingDiceInPlay } from './opening';
import { diceWereRolled } from './rolledDice';

export interface Announcement {
  /**
   * One per event in the match, so the same text is read again for a new
   * event. The game screen adds the match (`matchKey`, #216).
   */
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

// ---------------------------------------------------------------------------
// Online games (#255)

/** Asodio's chosen double after a 1-2: the state keeps it in `variantData`. */
export function stateHasChosenDouble(game: GameFlow): boolean {
  const data = game.state.variantData;
  return typeof data === 'object' && data !== null && 'chosenDouble' in data;
}

/**
 * Online, the server rolls the opening: "You start with 6-3." while the
 * starter's first turn plays the opening dice. `null` at any other time.
 */
export function onlineOpeningLine(
  game: GameFlow,
  t: TFunction,
  { nameOf, isYou }: AnnouncementNames,
): string | null {
  const { opening, starter } = game;
  if (
    opening === null ||
    starter === null ||
    opening.white === null ||
    opening.black === null ||
    game.lastTurn !== null ||
    game.state.dice === null ||
    game.state.rules.match.openingRoll !== 'useOpeningDice'
  ) {
    return null;
  }
  const high = Math.max(opening.white, opening.black);
  const low = Math.min(opening.white, opening.black);
  return isYou(starter)
    ? t('game.opening.result_you', { high, low })
    : t('game.opening.result', { name: nameOf(starter), high, low });
}

/**
 * Online, the server passes a roll with no legal move by itself. The last
 * turn was such a pass: "Opponent rolled 6-6. No checker can move."
 */
export function onlinePassLine(
  game: GameFlow,
  t: TFunction,
  { nameOf, isYou }: AnnouncementNames,
): string | null {
  const last = game.lastTurn;
  if (last === null || last.moves.length > 0) return null;
  const dice = last.dice.join('-');
  return isYou(last.player)
    ? t('game.pass.body_you', { dice })
    : t('game.pass.body', { name: nameOf(last.player), dice });
}

/**
 * Online (#255): what screen readers hear when a new view arrives. The
 * other player's whole turn comes at once, with the roll after it, so one
 * text says both: "Opponent played: …. You rolled 5-3." A pass and the
 * opening roll (the server does both) are read too. The game screen keys
 * the text on the game and the view's version, so each view is read once.
 * Your own moves on the phone are not read again: the text goes once you
 * move, and comes back with the same key after an undo.
 */
export function onlineTurnAnnouncement(
  flow: MatchFlow,
  t: TFunction,
  names: AnnouncementNames,
): string | null {
  if (matchPhase(flow) !== 'playing') return null;
  const { nameOf, isYou } = names;
  const game = flow.game;
  const lines: string[] = [];
  const last = game.lastTurn;
  const pass = onlinePassLine(game, t, names);
  if (pass !== null) {
    lines.push(pass);
  } else if (last !== null && !isYou(last.player)) {
    const moves = last.moves.map((move) => moveLabel(t, move)).join('; ');
    lines.push(t('game.announce.played', { name: nameOf(last.player), moves }));
  }
  const dice = game.state.dice;
  if (game.phase === 'moving' && game.played.length === 0 && dice !== null) {
    const opening = onlineOpeningLine(game, t, names);
    const player = game.state.toMove;
    const you = isYou(player);
    const name = nameOf(player);
    if (opening !== null) {
      lines.push(opening);
    } else if (isDouble(dice)) {
      const value = dice[0];
      const vars = { name, value, double: t(`game.doubles.name.${value}`) };
      const chosen = stateHasChosenDouble(game);
      if (chosen) {
        lines.push(
          you ? t('game.announce.choseDouble_you', vars) : t('game.announce.choseDouble', vars),
        );
      } else {
        lines.push(
          you ? t('game.announce.rolledDouble_you', vars) : t('game.announce.rolledDouble', vars),
        );
      }
    } else {
      const vars = { name, dice: dice.join('-') };
      lines.push(you ? t('game.announce.rolled_you', vars) : t('game.announce.rolled', vars));
    }
  }
  return lines.length > 0 ? lines.join(' ') : null;
}

/**
 * Were the dice of this turn rolled? (#177) Pure.
 *
 * Most dice come from a roll. In the Acey-Deucey presets of Asodio the
 * player chooses a double after a 1-2 (`answer`): the dice become that
 * double with no roll. Such dice are not thrown on screen: they show at
 * rest, all four at once, with no split and no "Doubles!" label. The bot
 * does the same: its first move gets no time for a roll (`botTurn.ts`).
 *
 * The flow log has the dice of every roll. The dice were rolled when the
 * last roll of this game has the dice the state holds now. A chosen double
 * follows a 1-2, so its last roll is that 1-2.
 */
import type { Dice, FlowEvent, MatchFlow } from '@tavli/engine';

/** Events that start a game: no roll of this game comes before them. */
const GAME_START: ReadonlySet<FlowEvent['type']> = new Set(['start', 'nextGame']);

const sameDice = (a: Dice, b: Dice) =>
  (a[0] === b[0] && a[1] === b[1]) || (a[0] === b[1] && a[1] === b[0]);

export function diceWereRolled(flow: MatchFlow): boolean {
  const dice = flow.game.state.dice;
  if (dice === null) return false;
  for (let i = flow.log.length - 1; i >= 0; i--) {
    const event = flow.log[i]!;
    if (event.type === 'roll') return event.dice !== undefined && sameDice(event.dice, dice);
    if (GAME_START.has(event.type)) return false;
  }
  return false;
}

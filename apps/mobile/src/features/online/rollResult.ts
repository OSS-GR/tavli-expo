/**
 * The roll a player asked for in an online game (#355). Pure.
 *
 * The server rolls only when the player to move asks (`rollDice`). Its
 * next view holds the dice: the turn goes on (`moving`, the same player
 * with dice), or the roll had no legal move and the engine passed it
 * (`awaiting-roll` again, `lastTurn` is the pass with its dice). A pass
 * changes no other field of the view, so the other phone reads the dice
 * and the pass from `game.lastTurn`, as for any turn.
 */
import type { OnlineGameView } from '@tavli/contracts';
import type { Dice, PlayerId } from '@tavli/engine';

/**
 * The dice of the roll of `side` that leads from `before` to `after`, or
 * `null` when `after` is not that roll's view: not the next version, not
 * the same game, or `before` did not wait for that roll.
 */
export function rollResult(
  before: OnlineGameView,
  after: OnlineGameView,
  side: PlayerId,
): Dice | null {
  if (after.version !== before.version + 1) return null;
  if (before.status !== 'active' || after.status !== 'active') return null;
  if (before.waitingFor !== side || before.prompt !== null) return null;
  if (after.match.games.length !== before.match.games.length) return null;
  const was = before.game;
  if (was.phase !== 'awaiting-roll' || was.state.toMove !== side) return null;
  const now = after.game;
  if (now.phase === 'moving' && now.state.toMove === side) return now.state.dice;
  const last = now.lastTurn;
  if (now.phase === 'awaiting-roll' && last !== null && last.player === side) {
    return last.moves.length === 0 ? last.dice : null;
  }
  return null;
}

/**
 * The roll a player asked for in an online game (#355). Pure.
 *
 * The server rolls only when the player to move asks (`rollDice`). Its
 * next view holds the dice: the turn goes on (`moving`, the same player
 * with dice), or the roll had no legal move and the engine passed it
 * (`awaiting-roll` again, `lastTurn` is the pass with its dice). A pass
 * changes no other field of the view, so the other phone reads the dice
 * and the pass from `game.lastTurn`, as for any turn.
 *
 * The opening die of a new match (#379) is the same: the server rolls a
 * player's die only when that player asks (`openingRollResult`).
 */
import type { OnlineGameView } from '@tavli/contracts';
import type { Dice, DieValue, PlayerId } from '@tavli/engine';

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

/**
 * The opening die of `side` that leads from `before` to `after` (#379),
 * or `null` when `after` is not that roll's view: not the next version,
 * not the same game, or `before` did not wait for that die. The die is in
 * `after.game.opening`, also when it decided the opening; after a tie the
 * engine has cleared both dice, and the tied value is the newest tie.
 */
export function openingRollResult(
  before: OnlineGameView,
  after: OnlineGameView,
  side: PlayerId,
): DieValue | null {
  if (after.version !== before.version + 1) return null;
  if (before.status !== 'active') return null;
  if (after.match.games.length !== before.match.games.length) return null;
  const was = before.game.opening;
  if (before.game.phase !== 'opening-roll' || was === null || was[side] !== null) return null;
  const now = after.game.opening;
  if (now === null) return null;
  if (now[side] !== null) return now[side];
  if (now.ties.length > was.ties.length) return now.ties.at(-1) ?? null;
  return null;
}

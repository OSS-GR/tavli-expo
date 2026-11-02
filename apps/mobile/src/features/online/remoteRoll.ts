/**
 * The other player's roll in an online game (#373). Pure.
 *
 * The server rolls only when the player to move asks (#355). The other
 * phone learns of the roll from the next view: their turn goes on
 * (`moving`, the same player with dice), or the roll had no legal move
 * and the engine passed it (`awaiting-roll`, `lastTurn` is the pass with
 * its dice). The screen throws those dice over the board from the other
 * player's wall, so it looks like they threw them.
 *
 * Only the view that follows the wait for that roll counts. A missed view,
 * a new game, a double chosen after a 1-2 (no roll) or your own roll gives
 * `null`: the dice row shows the dice as before.
 */
import type { Dice, MatchFlow, PlayerId } from '@tavli/engine';

import { stateHasChosenDouble } from '@/features/game/announcements';

export interface RemoteRoll {
  /** Who rolled: the other player. */
  readonly player: PlayerId;
  readonly dice: Dice;
  /** The roll had no legal move: the pass card shows after the dice. */
  readonly pass: boolean;
}

/**
 * The other player's roll that leads from `before` (the flow the board
 * showed) to `after` (a new view), for the player `me`, or `null`.
 */
export function remoteRoll(before: MatchFlow, after: MatchFlow, me: PlayerId): RemoteRoll | null {
  if (before === after) return null;
  if (before.match.status === 'finished' || after.match.status === 'finished') return null;
  if (after.match.games.length !== before.match.games.length) return null;
  const was = before.game;
  if (was.phase !== 'awaiting-roll') return null;
  const player = was.state.toMove;
  if (player === me) return null;
  const now = after.game;
  if (now.phase === 'moving' && now.state.toMove === player) {
    if (now.state.turnNumber !== was.state.turnNumber) return null;
    if (now.state.dice === null || stateHasChosenDouble(now)) return null;
    return { player, dice: now.state.dice, pass: false };
  }
  const last = now.lastTurn;
  if (
    now.phase === 'awaiting-roll' &&
    last !== null &&
    last.player === player &&
    last.moves.length === 0
  ) {
    return { player, dice: last.dice, pass: true };
  }
  return null;
}

/**
 * Random play through the turn flow, used only in tests. Not exported from
 * the package. Picks a random legal action for the current phase, with
 * some undos and (rarely) resignations mixed in.
 */

import { canUndo, currentPrompt, legalNextMoves } from '../flow/game-flow';
import type { FlowContext } from '../flow/game-flow';
import { matchPhase } from '../flow/match-flow';
import type { MatchAction, MatchFlow } from '../flow/match-flow';
import { PLAYERS } from '../player';
import type { Rng } from '../rng';

export interface RandomPlayOptions {
  /** Chance to take back a move when one can be taken back. */
  readonly undo?: number;
  /** Chance per action that a player resigns the game. */
  readonly resignGame?: number;
  /** Chance per action that a player resigns the match. */
  readonly resignMatch?: number;
}

function chance(rng: Rng): number {
  return rng.nextUint32() / 0x1_0000_0000;
}

function pick<T>(rng: Rng, items: readonly T[]): T {
  const item = items[rng.nextUint32() % items.length];
  if (item === undefined) throw new Error('nothing to pick');
  return item;
}

/** A random legal action, or `null` when the match is over. */
export function randomAction(
  flow: MatchFlow,
  rng: Rng,
  options: RandomPlayOptions = {},
  ctx: FlowContext = {},
): MatchAction | null {
  const phase = matchPhase(flow);
  if (phase === 'match-over') return null;
  if (phase === 'game-over') return { type: 'nextGame' };
  const game = flow.game;
  const someone = pick(rng, PLAYERS);
  if (chance(rng) < (options.resignMatch ?? 0)) return { type: 'resignMatch', player: someone };
  if (game.phase !== 'opening-roll' && chance(rng) < (options.resignGame ?? 0)) {
    return { type: 'resign', player: someone };
  }
  const player = game.state.toMove;
  switch (game.phase) {
    case 'opening-roll': {
      if (game.opening === null) return { type: 'chooseStarter', player: someone };
      const roller = PLAYERS.find((p) => game.opening?.[p] === null) ?? 'white';
      return { type: 'rollOpening', player: roller };
    }
    case 'awaiting-roll':
      return { type: 'roll', player };
    case 'moving': {
      if (canUndo(game) && chance(rng) < (options.undo ?? 0)) return { type: 'undo', player };
      const moves = legalNextMoves(game, ctx).flatMap((source) => source.moves);
      return { type: 'move', player, move: pick(rng, moves) };
    }
    case 'awaiting-confirm':
      if (chance(rng) < (options.undo ?? 0)) return { type: 'undo', player };
      return { type: 'confirm', player };
    case 'awaiting-answer': {
      const prompt = currentPrompt(game, ctx);
      if (prompt === null) throw new Error('no prompt');
      return { type: 'answer', player: prompt.player, choice: pick(rng, prompt.choices) };
    }
    case 'game-over':
      return { type: 'nextGame' };
  }
}

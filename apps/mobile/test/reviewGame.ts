/**
 * Scripted games for the game review tests (#215). Each turn rolls fixed
 * dice and plays a turn picked from the Analyzer's ranking (best first),
 * through the real match flow, so the log is the one the app keeps.
 */
import { createAnalyzer, type RankedTurn } from '@tavli/bot';
import {
  applyMatchAction,
  createMatchFlow,
  type DieValue,
  type MatchFlow,
  type PlayerId,
  type RuleSet,
} from '@tavli/engine';

import { gameRuleSet } from '@/features/match/setup';

export const testAnalyzer = createAnalyzer();

/** Picks the turn to play from the ranking, best first. */
export type Pick = (ranked: readonly RankedTurn[]) => RankedTurn;

export const best: Pick = (ranked) => ranked[0]!;
/** The turn that loses the most. */
export const worst: Pick = (ranked) =>
  ranked.reduce((a, b) => (b.equityLoss > a.equityLoss ? b : a));

/** A new match flow: White starts, no opening roll. */
export function startFlow(
  rules: RuleSet = gameRuleSet('portes'),
  players = { white: 'Maria', black: 'Bob' },
): MatchFlow {
  return createMatchFlow({ rules, players, starter: 'white', targetPoints: 3 });
}

/**
 * Rolls `dice` for the player to move and plays the picked turn (a pass
 * plays itself). Returns the flow after the turn and the ranking.
 */
export function playTurn(
  flow: MatchFlow,
  dice: [DieValue, DieValue],
  pick: Pick = best,
): { flow: MatchFlow; ranked: readonly RankedTurn[]; player: PlayerId } {
  const player = flow.game.state.toMove;
  let next = applyMatchAction(flow, { type: 'roll', player, dice });
  if (next.game.phase !== 'moving') return { flow: next, ranked: [], player };
  return { ...playRolled(next, pick), player };
}

/** Plays the picked turn for the dice already on the board (`state.dice`). */
export function playRolled(
  flow: MatchFlow,
  pick: Pick = best,
): { flow: MatchFlow; ranked: readonly RankedTurn[] } {
  const { state } = flow.game;
  const player = state.toMove;
  const ranked = testAnalyzer.rankTurns(state, state.dice!);
  let next = flow;
  for (const move of pick(ranked).turn.moves) {
    next = applyMatchAction(next, { type: 'move', player, move });
  }
  next = applyMatchAction(next, { type: 'confirm', player });
  return { flow: next, ranked };
}

/** The rolls of the scripted Portes game: White, Black, White, … */
export const ROLLS: readonly [DieValue, DieValue][] = [
  [3, 1],
  [6, 4],
  [5, 2],
  [6, 3],
  [6, 5],
  [4, 2],
  [5, 3],
  [2, 1],
];

/**
 * A Portes game of `ROLLS` that White's picks decide (Black, the bot,
 * always plays its worst turn), then Black resigns: the game is over.
 * `whitePick(i)` picks White's i-th turn (from 0).
 */
export function scriptedGame(whitePick: (i: number) => Pick, rules?: RuleSet): MatchFlow {
  let flow = startFlow(rules);
  let white = 0;
  for (const dice of ROLLS) {
    const mover = flow.game.state.toMove;
    const pick = mover === 'white' ? whitePick(white++) : worst;
    flow = playTurn(flow, dice, pick).flow;
  }
  return applyMatchAction(flow, { type: 'resign', player: 'black' });
}

/** White's third turn (index 2) is her worst one; every other turn of hers is the best. */
export const BAD_TURN = 2;
export const oneBadTurn = () => scriptedGame((i) => (i === BAD_TURN ? worst : best));
export const allBest = () => scriptedGame(() => best);

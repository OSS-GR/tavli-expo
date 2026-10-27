/**
 * Checks the fast Asodio generator two ways, in random positions from
 * random games, for every preset and a mix of flags:
 *
 * 1. Against the slow, simple rules model in `src/testing/asodio-oracle.ts`
 *    (every order of the dice, every checker, no pruning).
 * 2. `nextMoves`, walked one move at a time in every order, must reach
 *    exactly the end positions of `legalTurns`, and `applyTurn` must accept
 *    every walked sequence.
 */

import { describe, expect, it } from 'vitest';

import { applyMoveToBoard } from '../../board';
import type { BoardState } from '../../board';
import type { Dice } from '../../dice';
import { formatMove } from '../../move';
import type { Move } from '../../move';
import type { GameState } from '../../state';
import { formatAsodio } from '../../testing/asodio-notation';
import { referenceFinals, sideKey, sideOf } from '../../testing/asodio-oracle';
import { ASODIO_RULE_MIX, mixRules, randomAsodioPositions } from '../../testing/random-asodio';
import { asodio } from './index';

function board(state: GameState, moves: readonly Move[]): BoardState {
  return moves.reduce((b, m) => applyMoveToBoard(b, state.toMove, m, 'contrary'), state.board);
}

function engineFinals(state: GameState, dice: Dice): Set<string> {
  return new Set(
    asodio.legalTurns(state, dice).map((t) => sideKey(sideOf(board(state, t.moves), state.toMove))),
  );
}

/** Every end position the `nextMoves` walk reaches; also checks `applyTurn` on each. */
function walkFinals(state: GameState, dice: Dice): Set<string> {
  const out = new Set<string>();
  // The moves left only depend on the board so far and the dice left.
  const seen = new Set<string>();
  const walk = (played: Move[]): void => {
    const left = played.map((m) => m.die).sort();
    const key = `${sideKey(sideOf(board(state, played), state.toMove))}|${left.join('')}`;
    if (seen.has(key)) return;
    seen.add(key);
    const next = asodio.nextMoves(state, dice, played);
    if (next.length === 0) {
      const after = asodio.applyTurn(state, { player: state.toMove, dice, moves: played });
      out.add(sideKey(sideOf(after.board, state.toMove)));
      return;
    }
    for (const move of next) walk([...played, move]);
  };
  walk([]);
  return out;
}

function where(state: GameState, dice: Dice): string {
  return `${formatAsodio(state.board)}, ${state.toMove} to move, dice ${dice.join('-')}`;
}

// The walk tries every move order, so one rule mix takes about 1.2 s alone.
// On a busy machine (CI, or the whole repo's tests at once) that can pass the
// 5 s default, so this suite gets more time. The checks stay the same.
const ORACLE_TIMEOUT_MS = 30_000;

describe('Asodio generator against the rules oracle', { timeout: ORACLE_TIMEOUT_MS }, () => {
  it.each(ASODIO_RULE_MIX.map(([name, preset, overrides]) => [name, preset, overrides] as const))(
    '%s: legalTurns finds the same end positions',
    (_name, preset, overrides) => {
      const rules = mixRules(preset, overrides);
      for (const state of randomAsodioPositions(11, 150, rules)) {
        const dice = state.dice as Dice;
        const expected = [...referenceFinals(state, dice)].sort();
        const actual = [...engineFinals(state, dice)].sort();
        if (actual.join('\n') !== expected.join('\n')) {
          const listed = asodio
            .legalTurns(state, dice)
            .map((t) => t.moves.map(formatMove).join(' '));
          expect({ where: where(state, dice), listed, actual }).toEqual({
            where: where(state, dice),
            listed,
            actual: expected,
          });
        }
      }
    },
  );

  it.each(ASODIO_RULE_MIX.map(([name, preset, overrides]) => [name, preset, overrides] as const))(
    '%s: the nextMoves walk reaches exactly the legalTurns end positions',
    (_name, preset, overrides) => {
      const rules = mixRules(preset, overrides);
      for (const state of randomAsodioPositions(23, 25, rules)) {
        const dice = state.dice as Dice;
        const expected = [...engineFinals(state, dice)].sort();
        const walked = [...walkFinals(state, dice)].sort();
        expect({ where: where(state, dice), walked }).toEqual({
          where: where(state, dice),
          walked: expected,
        });
      }
    },
  );
});

/**
 * Checks the fast Plakoto generator two ways, in random positions and with
 * every mother rule:
 *
 * 1. Against the slow, simple rules model in `src/testing/plakoto-oracle.ts`
 *    (every order of the dice, every checker, no pruning; then the mid-turn
 *    mother rule cuts a play short at the move that ends the game).
 * 2. `nextMoves`, walked one move at a time in every order, must reach
 *    exactly the end positions of `legalTurns`, and `applyTurn` must accept
 *    every walked sequence.
 */

import { describe, expect, it } from 'vitest';

import { applyMoveToBoard } from '../../board';
import type { BoardState } from '../../board';
import { rollDice } from '../../dice';
import type { Dice } from '../../dice';
import { formatMove } from '../../move';
import type { Move } from '../../move';
import { resolveRules } from '../../presets';
import type { MotherRules, RuleSet } from '../../rules';
import { createSeededRng } from '../../rng';
import type { GameState } from '../../state';
import { formatPlakoto } from '../../testing/plakoto-notation';
import { referenceFinals, sideKey, sideOf } from '../../testing/plakoto-oracle';
import { plakoto } from './index';

// ---------------------------------------------------------------------------
// Random positions

function randomPositions(seed: number, count: number, rules: RuleSet): GameState[] {
  const rng = createSeededRng(seed);
  const out: GameState[] = [];
  let state = plakoto.initialState({ startingPlayer: 'white', rules });
  let turn = 0;
  while (out.length < count) {
    if (plakoto.isGameOver(state)) state = plakoto.initialState({ startingPlayer: 'white', rules });
    const question = plakoto.prompt?.(state) ?? null;
    if (question !== null) {
      state = plakoto.answerPrompt?.(state, question.player, 'playOn') as GameState;
      continue;
    }
    const dice = rollDice(rng);
    if (turn % 5 === 0) out.push({ ...state, dice });
    const turns = plakoto.legalTurns(state, dice);
    const pick = turns[rng.nextUint32() % turns.length];
    if (pick === undefined) throw new Error('no legal turn');
    state = plakoto.applyTurn(state, pick);
    turn += 1;
  }
  return out;
}

// ---------------------------------------------------------------------------

function board(state: GameState, moves: readonly Move[]): BoardState {
  return moves.reduce((b, m) => applyMoveToBoard(b, state.toMove, m, 'contrary'), state.board);
}

/** Every full sequence `nextMoves` allows, walked one move at a time. */
function walk(state: GameState, dice: Dice): { finals: Set<string>; sequences: Move[][] } {
  const finals = new Set<string>();
  const sequences: Move[][] = [];
  const seen = new Set<string>();
  const go = (played: Move[]): void => {
    const options = plakoto.nextMoves(state, dice, played);
    if (options.length === 0) {
      sequences.push(played);
      finals.add(formatPlakoto(board(state, played)));
      return;
    }
    for (const move of options) {
      const after = [...played, move];
      const key = `${formatPlakoto(board(state, after))}|${after.map((m) => m.die).join('')}`;
      if (seen.has(key)) continue;
      seen.add(key);
      go(after);
    }
  };
  go([]);
  return { finals, sequences };
}

/** Name, mother flags, seed, and whether some plays must be cut short by the mother rule. */
const CONFIGS: readonly [string, Partial<MotherRules>, number, boolean][] = [
  ['offerConcede', { motherRule: 'offerConcede' }, 101, false],
  ['federation', { motherRule: 'federation' }, 7, true],
  [
    'federation endOfTurn',
    { motherRule: 'federation', motherCheckTiming: 'endOfTurn' },
    303,
    false,
  ],
  ['instant', { motherRule: 'instant' }, 404, true],
];

describe('Plakoto generator vs. the slow reference and nextMoves', () => {
  for (const [name, mother, seed, someCut] of CONFIGS) {
    it(`${name}: same end positions in 40 random positions`, { timeout: 30_000 }, () => {
      const rules = resolveRules('plakoto', {
        mother,
        capture: { intermediatePinBlocks: seed === 303 },
        bearOff: { bearOffWhilePinned: seed === 404 },
      });
      let cut = 0;
      randomPositions(seed, 40, rules).forEach((position, i) => {
        const dice = position.dice as Dice;
        const state = { ...position, dice: null };
        const listed = plakoto.legalTurns(state, dice);
        const expected = new Set(
          listed.map((t) => formatPlakoto(plakoto.applyTurn(state, t).board)),
        );
        // One listed play per end position.
        expect(expected.size).toBe(listed.length);
        const lengths = listed.map((t) => t.moves.length);
        if (Math.min(...lengths) < Math.max(...lengths)) cut += 1;
        const sides = listed.map((t) =>
          sideKey(sideOf(plakoto.applyTurn(state, t).board, t.player)),
        );
        expect(referenceFinals(state, dice)).toEqual(new Set(sides));
        // Walking every order with nextMoves is slow: do it in every fourth position.
        if (i % 4 !== 0) return;

        const { finals, sequences } = walk(state, dice);
        expect(finals).toEqual(expected);
        for (const moves of sequences) {
          const turn = { player: state.toMove, dice, moves };
          expect(plakoto.applyTurn(state, turn).board).toEqual(board(state, moves));
        }
        // Listed plays can be played one move at a time (a few of them: it is slow).
        for (const turn of listed.slice(0, 6)) {
          turn.moves.forEach((move, j) => {
            const options = plakoto.nextMoves(state, dice, turn.moves.slice(0, j));
            expect(options.map(formatMove)).toContain(formatMove(move));
          });
        }
      });
      // The positions reach the mother rule (plays cut short) where it can happen.
      expect(cut > 0).toBe(someCut);
    });
  }
});

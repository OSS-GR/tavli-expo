/**
 * The Asodio bot: levels, legal and repeatable turns, the fast path, a win
 * now is never missed, the `chooseDouble` question of the Acey-Deucey
 * presets, and whole games with roll chains.
 */

import { describe, expect, it } from 'vitest';

import {
  asodio,
  createBoard,
  createSeededRng,
  getPreset,
  resolveRules,
  sameTurn,
} from '@tavli/engine';
import type { Dice, GameState, PlayerId, RuleSet, SideLayout, Turn } from '@tavli/engine';

import { scoreAnswers } from './answer';
import { asodioHeuristic, createBot, scoreTurns, simulate } from './index';
import type { BotLevel, Evaluator } from './index';
import { randomAsodioPositions } from './testing/random-asodio-positions';

const bot = createBot();
const LONG = { timeout: 60_000 };

function position(
  white: SideLayout,
  black: SideLayout,
  toMove: PlayerId = 'white',
  rules: RuleSet = getPreset('asodio.kafeneio'),
): GameState {
  const start = asodio.initialState({ startingPlayer: toMove, rules });
  return { ...start, board: createBoard({ white, black }, 'contrary') };
}

/** The same evaluator without its fast path: the bot then plays each turn with the engine. */
const enginePath: Evaluator = {
  id: 'asodio-engine-path',
  variant: 'asodio',
  evaluate: (state) => asodioHeuristic.evaluate(state),
};

/** Rule sets with no roll chain, so the fast path runs (it falls back to the engine otherwise). */
const FAST_RULES: readonly RuleSet[] = [
  getPreset('asodio.kafeneio'),
  resolveRules('asodio.kafeneio', { entry: { moveWhileLoading: true } }),
  resolveRules('asodio.kafeneio', { quarters: { moveInsideFrozenQuarter: true } }),
  resolveRules('asodio.kafeneio', { capture: { captureMode: 'hit' } }),
  resolveRules('asodio.kafeneio', { bearOff: { exactBearOff: true, bearOffWhilePinned: true } }),
  resolveRules('asodio.kafeneio', { scoring: { method: 'perChecker' } }),
];

const CHAIN_RULES: readonly RuleSet[] = [
  getPreset('asodio.aceyDeuceyGreek'),
  getPreset('asodio.aceyDeuceyAmerican'),
];

describe('asodio levels', () => {
  it('plays easy and medium (hard not yet)', () => {
    expect(bot.supportedLevels('asodio')).toEqual(['easy', 'medium']);
    const start = asodio.initialState({ startingPlayer: 'white' });
    expect(() => bot.chooseTurn(start, [1, 2], 'hard', { rng: createSeededRng(1) })).toThrow(
      expect.objectContaining({ code: 'NOT_IMPLEMENTED' }),
    );
  });

  it('every level plays one of the legal turns, the same one for the same seed', LONG, () => {
    const levels: BotLevel[] = ['random', 'easy', 'medium'];
    for (const [i, rules] of [...FAST_RULES, ...CHAIN_RULES].entries()) {
      for (const state of randomAsodioPositions(10 + i, 25, 4, rules)) {
        const d = state.dice as Dice;
        const legal = asodio.legalTurns(state, d);
        for (const level of levels) {
          const turn = bot.chooseTurn(state, d, level, { rng: createSeededRng(9) });
          expect(legal.some((t) => sameTurn(t, turn))).toBe(true);
          const again = bot.chooseTurn(state, d, level, { rng: createSeededRng(9) });
          expect(sameTurn(again, turn)).toBe(true);
        }
      }
    }
  });

  it('the fast path scores like the engine path', LONG, () => {
    let compared = 0;
    let ended = 0;
    for (const [i, rules] of FAST_RULES.entries()) {
      for (const state of randomAsodioPositions(100 + i, 80, 2, rules)) {
        const d = state.dice as Dice;
        const turns = asodio.legalTurns(state, d);
        const fast = scoreTurns(asodio, asodioHeuristic, state, turns);
        const slow = scoreTurns(asodio, enginePath, state, turns);
        fast.forEach((score, j) => {
          expect(score.gameOver).toBe(slow[j]?.gameOver);
          expect(score.score).toBeCloseTo(slow[j]?.score ?? NaN, 12);
          if (score.gameOver) ended += 1;
          compared += 1;
        });
      }
    }
    expect(compared).toBeGreaterThan(1000);
    // Deadlocks (a draw) and bear-offs both come up in random play.
    expect(ended).toBeGreaterThan(0);
  });

  it('every level takes a turn that wins at once', () => {
    // White has two checkers left on own 1 and 2; Black is far behind. 2-1 bears both off.
    const white = { points: { 2: 1, 1: 1 }, off: 13 };
    const black = { points: { 12: 15 } };
    const state = { ...position(white, black), dice: [2, 1] as Dice };
    expect(asodio.legalTurns(state, [2, 1]).length).toBeGreaterThan(1);
    for (const level of ['easy', 'medium'] as const) {
      for (let seed = 1; seed <= 20; seed += 1) {
        const turn = bot.chooseTurn(state, [2, 1], level, { rng: createSeededRng(seed) });
        expect(asodio.result(asodio.applyTurn(state, turn))).toMatchObject({
          winner: 'white',
          points: 2,
        });
      }
    }
  });

  it('medium pins the lone lagging checker that freezes the other army', () => {
    // Black's last checker in its rear quarter (Black 13–18) is alone on Black 16 = White 9;
    // the other 14 wait, frozen, on Black 9. White's army is all in White 13–18, so a White
    // checker on 14 reaches 9 with a 5.
    const white = { points: { 14: 3, 13: 12 } };
    const black = { points: { 16: 1, 9: 14 } };
    const state = { ...position(white, black), dice: [5, 3] as Dice };
    const pins = (turn: Turn) => turn.moves.some((m) => m.to === 9 && m.capture === 'pin');
    expect(asodio.legalTurns(state, [5, 3]).some(pins)).toBe(true);
    expect(asodio.legalTurns(state, [5, 3]).some((t) => !pins(t))).toBe(true);
    for (let seed = 1; seed <= 20; seed += 1) {
      expect(pins(bot.chooseTurn(state, [5, 3], 'medium', { rng: createSeededRng(seed) }))).toBe(
        true,
      );
    }
  });
});

describe('a roll chain keeps the same player to move', () => {
  it('the engine path scores a turn that gives another roll as our own equity', () => {
    // aceyDeuceyGreek: a fully played double gives another roll.
    const rules = getPreset('asodio.aceyDeuceyGreek');
    const white = { points: { 20: 2, 13: 13 } };
    const black = { points: { 20: 2, 13: 13 } };
    const state = { ...position(white, black, 'white', rules), dice: [3, 3] as Dice };
    const turns = asodio.legalTurns(state, [3, 3]);
    const constant: Evaluator = {
      id: 'constant',
      variant: 'asodio',
      evaluate: () => ({ win: 0.75, winDouble: 0, loseDouble: 0, equity: 0.5 }),
    };
    const scores = scoreTurns(asodio, constant, state, turns);
    turns.forEach((turn, i) => {
      const after = asodio.applyTurn(state, turn);
      expect(after.toMove).toBe(turn.moves.length === 4 ? 'white' : 'black');
      expect(scores[i]?.score).toBe(after.toMove === 'white' ? 0.5 : -0.5);
    });
    expect(scores.some((s) => s.score === 0.5)).toBe(true);
  });
});

describe('the chooseDouble question (Acey-Deucey presets)', () => {
  /** White just played a 1-2 and must choose a double. */
  function askedState(): GameState {
    const rules = getPreset('asodio.aceyDeuceyAmerican');
    const white = { points: { 13: 15 } };
    const black = { points: { 13: 15 } };
    const before = { ...position(white, black, 'white', rules), dice: [1, 2] as Dice };
    const turn = asodio.legalTurns(before, [1, 2])[0];
    if (turn === undefined) throw new Error('no turn');
    return asodio.applyTurn(before, turn);
  }

  it('is asked of the player who rolled the 1-2; the kafeneio preset never asks', () => {
    expect(asodio.prompt?.(askedState())).toMatchObject({ player: 'white', kind: 'chooseDouble' });
    for (const state of randomAsodioPositions(3, 200, 1)) {
      expect(asodio.prompt?.(state) ?? null).toBeNull();
    }
  });

  it('scores each double by the best turn with it', () => {
    const asked = askedState();
    const prompt = asodio.prompt?.(asked);
    if (prompt === null || prompt === undefined) throw new Error('no prompt');
    const scores = scoreAnswers(asodio, asodioHeuristic, asked, prompt);
    prompt.choices.forEach((choice, i) => {
      const next = asodio.answerPrompt?.(asked, 'white', choice) as GameState;
      const dice = next.dice as Dice;
      const best = Math.max(
        ...scoreTurns(asodio, asodioHeuristic, next, asodio.legalTurns(next, dice)).map(
          (s) => s.score,
        ),
      );
      expect(scores[i]?.score).toBeCloseTo(best, 12);
    });
  });

  it('every level answers with one of the choices, the same one for the same seed', () => {
    const asked = askedState();
    for (const level of ['random', 'easy', 'medium'] as const) {
      for (let seed = 1; seed <= 10; seed += 1) {
        const choice = bot.chooseAnswer(asked, level, { rng: createSeededRng(seed) });
        expect(['1', '2', '3', '4', '5', '6']).toContain(choice);
        expect(bot.chooseAnswer(asked, level, { rng: createSeededRng(seed) })).toBe(choice);
      }
    }
  });

  it('whole games play the chosen double and the extra rolls, with no illegal turn', LONG, () => {
    for (const rules of CHAIN_RULES) {
      const kinds = new Set<string>();
      const result = simulate({
        variant: asodio,
        rules,
        bots: [
          { bot, difficulty: 'easy' },
          { bot, difficulty: 'random' },
        ],
        games: 4,
        seed: 5,
        onAnswer: (event) => kinds.add(event.kind),
      });
      expect(result.failures).toEqual([]);
      expect(result.completed).toBe(4);
      expect([...kinds]).toEqual(['chooseDouble']);
    }
  });
});

describe('asodio simulation', () => {
  it('plays whole owner-version games with no illegal turn', LONG, () => {
    const result = simulate({
      variant: asodio,
      bots: [
        { bot, difficulty: 'medium' },
        { bot, difficulty: 'random' },
      ],
      games: 20,
      seed: 3,
    });
    expect(result.failures).toEqual([]);
    expect(result.completed).toBe(20);
  });
});

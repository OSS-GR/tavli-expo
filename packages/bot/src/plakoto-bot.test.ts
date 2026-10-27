/**
 * The Plakoto bot: levels, legal turns, the fast path, and the answer to the
 * mother question (`motherRule: "offerConcede"`).
 */

import { describe, expect, it } from 'vitest';

import { BotCancelledError } from '@tavli/contracts';
import type { BotAnswerRequest } from '@tavli/contracts';
import {
  createBoard,
  createSeededRng,
  getPreset,
  plakoto,
  portes,
  resolveRules,
  sameTurn,
} from '@tavli/engine';
import type { Dice, GameState, PlayerId, RuleSet, SideLayout, Turn } from '@tavli/engine';

import { scoreAnswers } from './answer';
import {
  InlineBotRunner,
  createBot,
  plakotoHeuristic,
  playGame,
  scoreTurns,
  simulate,
} from './index';
import type { Bot, BotLevel, Evaluator } from './index';
import { randomPlakotoPositions } from './testing/random-plakoto-positions';

const bot = createBot();

function position(
  white: SideLayout,
  black: SideLayout,
  toMove: PlayerId = 'white',
  rules: RuleSet = getPreset('plakoto'),
): GameState {
  const start = plakoto.initialState({ startingPlayer: toMove, rules });
  return { ...start, board: createBoard({ white, black }, 'contrary') };
}

/** Black's mother is alone on Black's 24 (White's 1); a White checker 3 pips away. */
const motherInReach = {
  white: { points: { 24: 5, 13: 5, 8: 3, 4: 2 } },
  black: { points: { 24: 1, 13: 7, 18: 7 } },
};
const dice: Dice = [3, 5];

const pinsMother = (turn: Turn): boolean =>
  turn.moves.some((move) => move.to === 1 && move.capture === 'pin');

/** The state right after White pinned Black's mother: Black must answer. */
function askedState(): GameState {
  const before = position(motherInReach.white, motherInReach.black);
  const turn = plakoto.legalTurns(before, dice).find(pinsMother);
  if (turn === undefined) throw new Error('no pinning turn');
  return plakoto.applyTurn({ ...before, dice }, turn);
}

/** The same evaluator without its fast path: the bot then plays each turn with the engine. */
const enginePath: Evaluator = {
  id: 'plakoto-engine-path',
  variant: 'plakoto',
  evaluate: (state) => plakotoHeuristic.evaluate(state),
};

describe('plakoto levels', () => {
  it('plays easy, medium and hard (the Plakoto net)', () => {
    expect(bot.supportedLevels('plakoto')).toEqual(['easy', 'medium', 'hard']);
    const start = plakoto.initialState({ startingPlayer: 'white' });
    expect(() => bot.chooseTurn(start, [1, 2], 'hard', { rng: createSeededRng(1) })).not.toThrow();
    // A turn cannot start while the mother question waits (the engine says so).
    expect(() =>
      bot.chooseTurn(askedState(), [1, 2], 'medium', { rng: createSeededRng(1) }),
    ).toThrow(expect.objectContaining({ code: 'ILLEGAL_TURN' }));
  });

  it('every level plays one of the legal turns, the same one for the same seed', () => {
    const levels: BotLevel[] = ['random', 'easy', 'medium'];
    for (const state of randomPlakotoPositions(5, 120)) {
      const d = state.dice as Dice;
      const legal = plakoto.legalTurns(state, d);
      for (const level of levels) {
        const turn = bot.chooseTurn(state, d, level, { rng: createSeededRng(9) });
        expect(legal.some((t) => sameTurn(t, turn))).toBe(true);
        const again = bot.chooseTurn(state, d, level, { rng: createSeededRng(9) });
        expect(sameTurn(again, turn)).toBe(true);
      }
    }
  });

  it('the fast path scores like the engine path, for every mother rule', () => {
    const ruleSets: RuleSet[] = [
      getPreset('plakoto'),
      getPreset('plakoto.federation'),
      resolveRules('plakoto', { mother: { motherRule: 'instant' } }),
      resolveRules('plakoto', { mother: { motherRule: 'none' } }),
      resolveRules('plakoto', { mother: { motherCheckTiming: 'endOfTurn' } }),
    ];
    let compared = 0;
    let ended = 0;
    for (const [i, rules] of ruleSets.entries()) {
      for (const state of randomPlakotoPositions(100 + i, 60, 3, rules)) {
        const d = state.dice as Dice;
        const turns = plakoto.legalTurns(state, d);
        const fast = scoreTurns(plakoto, plakotoHeuristic, state, turns);
        const slow = scoreTurns(plakoto, enginePath, state, turns);
        fast.forEach((score, j) => {
          expect(score.gameOver).toBe(slow[j]?.gameOver);
          expect(score.score).toBeCloseTo(slow[j]?.score ?? NaN, 12);
          if (score.gameOver) ended += 1;
          compared += 1;
        });
      }
    }
    expect(compared).toBeGreaterThan(1000);
    expect(ended).toBeGreaterThan(0);
  });

  it('medium pins the mother when it can', () => {
    const state = { ...position(motherInReach.white, motherInReach.black), dice };
    for (let seed = 1; seed <= 20; seed += 1) {
      expect(
        pinsMother(bot.chooseTurn(state, dice, 'medium', { rng: createSeededRng(seed) })),
      ).toBe(true);
    }
  });

  it('every level takes a mother pin that wins at once (federation rule, own start empty)', () => {
    const rules = getPreset('plakoto.federation');
    const white = { points: { 13: 5, 8: 8, 4: 2 } };
    const state = { ...position(white, motherInReach.black, 'white', rules), dice };
    for (const level of ['easy', 'medium'] as const) {
      for (let seed = 1; seed <= 20; seed += 1) {
        const turn = bot.chooseTurn(state, dice, level, { rng: createSeededRng(seed) });
        expect(plakoto.result(plakoto.applyTurn(state, turn))).toMatchObject({
          winner: 'white',
          points: 2,
        });
      }
    }
  });
});

describe('the mother question (offerConcede)', () => {
  const asked = askedState();

  it('is asked of the pinned player', () => {
    expect(plakoto.prompt?.(asked)).toEqual({
      player: 'black',
      kind: 'motherPinned',
      choices: ['resign', 'playOn'],
    });
  });

  it('scores resign as −2 and play on by the evaluation', () => {
    const prompt = plakoto.prompt?.(asked);
    if (prompt === null || prompt === undefined) throw new Error('no prompt');
    const [resign, playOn] = scoreAnswers(plakoto, plakotoHeuristic, asked, prompt);
    expect(resign).toEqual({ score: -2, gameOver: true });
    expect(playOn?.gameOver).toBe(false);
    expect(playOn?.score).toBeGreaterThan(-2);
    expect(playOn?.score).toBeLessThan(-1.5);
  });

  it('medium plays on (it can never lose more than the 2 points of resigning)', () => {
    for (let seed = 1; seed <= 50; seed += 1) {
      expect(bot.chooseAnswer(asked, 'medium', { rng: createSeededRng(seed) })).toBe('playOn');
    }
  });

  it('random and easy answer with one of the choices, the same one for the same seed', () => {
    for (const level of ['random', 'easy'] as const) {
      const seen = new Set<string>();
      for (let seed = 1; seed <= 200; seed += 1) {
        const choice = bot.chooseAnswer(asked, level, { rng: createSeededRng(seed) });
        expect(['resign', 'playOn']).toContain(choice);
        expect(bot.chooseAnswer(asked, level, { rng: createSeededRng(seed) })).toBe(choice);
        seen.add(choice);
      }
      // Random picks both; easy mostly plays on but sometimes gives up a near-lost game.
      expect(seen.has('playOn')).toBe(true);
    }
  });

  it('throws for a state with no question, and for a level with no evaluator', () => {
    const rng = createSeededRng(1);
    const quiet = plakoto.initialState({ startingPlayer: 'white' });
    expect(() => bot.chooseAnswer(quiet, 'medium', { rng })).toThrow(
      expect.objectContaining({ code: 'INVALID_REQUEST' }),
    );
    expect(() =>
      bot.chooseAnswer(portes.initialState({ startingPlayer: 'white' }), 'easy', { rng }),
    ).toThrow(expect.objectContaining({ code: 'INVALID_REQUEST' }));
    const noHard = createBot({
      evaluators: new Map([['plakoto', { easy: plakotoHeuristic, medium: plakotoHeuristic }]]),
    });
    expect(() => noHard.chooseAnswer(asked, 'hard', { rng })).toThrow(
      expect.objectContaining({ code: 'NOT_IMPLEMENTED' }),
    );
    // Hard plays on, like medium: playing on never loses more than resigning.
    expect(bot.chooseAnswer(asked, 'hard', { rng })).toBe('playOn');
  });

  it('the inline runner answers like the bot, and can be cancelled', async () => {
    const runner = new InlineBotRunner();
    const request: BotAnswerRequest = {
      variant: 'plakoto',
      state: asked,
      difficulty: 'easy',
      seed: 4,
    };
    const direct = bot.chooseAnswer(asked, 'easy', { rng: createSeededRng(4) });
    await expect(runner.chooseAnswer(request)).resolves.toBe(direct);
    const copy = JSON.parse(JSON.stringify(request)) as BotAnswerRequest;
    await expect(runner.chooseAnswer(copy)).resolves.toBe(direct);
    const pending = runner.chooseAnswer(request);
    runner.cancel();
    await expect(pending).rejects.toBeInstanceOf(BotCancelledError);
    await expect(runner.chooseAnswer({ ...request, variant: 'portes' })).rejects.toMatchObject({
      code: 'INVALID_REQUEST',
    });
    const movesOnly: Bot = { chooseTurn: (...args) => bot.chooseTurn(...args) };
    await expect(new InlineBotRunner(movesOnly).chooseAnswer(request)).rejects.toMatchObject({
      code: 'NOT_IMPLEMENTED',
    });
  });
});

describe('plakoto simulation', () => {
  it('plays whole games with questions answered, and no illegal turn', { timeout: 30_000 }, () => {
    const answers: string[] = [];
    const result = simulate({
      variant: plakoto,
      bots: [
        { bot, difficulty: 'random' },
        { bot, difficulty: 'easy' },
      ],
      games: 60,
      seed: 3,
      onAnswer: (event) => {
        expect(event.kind).toBe('motherPinned');
        answers.push(event.choice);
      },
    });
    expect(result.failures).toEqual([]);
    expect(result.completed).toBe(60);
    expect(answers.length).toBeGreaterThan(0);
  });

  it('fails a game cleanly when a bot cannot answer', () => {
    const movesOnly: Bot = { chooseTurn: (...args) => bot.chooseTurn(...args) };
    let failed = 0;
    for (let game = 0; game < 20; game += 1) {
      const outcome = playGame(
        {
          variant: plakoto,
          bots: [
            { bot: movesOnly, difficulty: 'random' },
            { bot: movesOnly, difficulty: 'random' },
          ],
          game,
        },
        game + 1,
      );
      if (!outcome.ok) {
        expect(outcome.code).toBe('NOT_IMPLEMENTED');
        failed += 1;
      }
    }
    expect(failed).toBeGreaterThan(0);
  });
});

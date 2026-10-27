/**
 * The mother rule with `motherRule: "offerConcede"` (the app default), the
 * timing flag, and the mother rule through the turn flow.
 */

import { describe, expect, it } from 'vitest';

import type { Dice } from '../../dice';
import {
  applyGameAction,
  createGameFlow,
  currentPrompt,
  legalNextMoves,
} from '../../flow/game-flow';
import type { GameAction, GameFlow } from '../../flow/game-flow';
import { applyMatchAction, createMatchFlow, matchPhase, replay } from '../../flow/match-flow';
import type { MatchFlow } from '../../flow/match-flow';
import { createMatch, recordGameResult, startNextGame } from '../../match';
import { formatTurn } from '../../move';
import { getPreset, resolveRules } from '../../presets';
import { createSeededRng } from '../../rng';
import type { RuleOverrides } from '../../rules';
import type { GameState, JsonObject } from '../../state';
import { formatPlakoto, parsePlakotoTurn, plakotoState } from '../../testing/plakoto-notation';
import { randomAction } from '../../testing/random-flow';
import { plakoto } from './index';

const END_OF_TURN: RuleOverrides = { mother: { motherCheckTiming: 'endOfTurn' } };
const ASK_WHITE = { player: 'white', kind: 'motherPinned', choices: ['resign', 'playOn'] };
const PLAYED_ON: JsonObject = { offer: null, playOn: ['white'], conceded: null };

function black(text: string, rules: RuleOverrides = {}, variantData: JsonObject | null = null) {
  return plakotoState(text, { rules, toMove: 'black', variantData });
}

function play(s: GameState, dice: Dice, turn: string): GameState {
  return plakoto.applyTurn(s, parsePlakotoTurn(turn, s.toMove, dice));
}

const illegalAction = expect.objectContaining({ code: 'ILLEGAL_ACTION' });

describe('motherRule "offerConcede" (app default)', () => {
  // Black's 3/1* lands on White's 24 and pins White's mother.
  const PIN = 'w: 24 6x14 ; b: 10x14 3';

  it('is the default: offerConcede, checked after each move', () => {
    expect(getPreset('plakoto').mother).toEqual({
      motherRule: 'offerConcede',
      motherCheckTiming: 'afterEachMove',
      mutualMotherPin: 'draw',
    });
  });

  it('a pinned mother does not end the game; the pinned player is asked', () => {
    const s = black(PIN);
    // The game does not stop at the pin: the whole roll is played.
    const turns = plakoto.legalTurns(s, [5, 2]).map(formatTurn);
    expect(turns).toContain('10/5 3/1*');
    expect(turns).not.toContain('3/1*');
    const next = play(s, [5, 2], '3/1* 10/5');
    expect(formatPlakoto(next.board)).toBe('w: 24! 6x14 ; b: 10x13 5 1');
    expect(plakoto.result(next)).toBeNull();
    expect(plakoto.prompt?.(next)).toEqual(ASK_WHITE);
    expect(next.variantData).toEqual({ offer: 'white', playOn: [], conceded: null });
    // No move until the question is answered.
    expect(() => plakoto.legalTurns(next, [6, 5])).toThrow(
      expect.objectContaining({
        code: 'ILLEGAL_TURN',
        message: 'answer the mother question first',
      }),
    );
  });

  it('"resign": the opponent wins 2 points', () => {
    const asked = play(black(PIN), [5, 2], '3/1* 10/5');
    const over = plakoto.answerPrompt?.(asked, 'white', 'resign') as GameState;
    expect(plakoto.result(over)).toEqual({ winner: 'black', points: 2, reason: 'resigned' });
    expect(plakoto.isGameOver(over)).toBe(true);
    expect(plakoto.prompt?.(over)).toBeNull();
  });

  it('"play on": the game goes on, and that player is not asked again', () => {
    const asked = play(black(PIN), [5, 2], '3/1* 10/5');
    const on = plakoto.answerPrompt?.(asked, 'white', 'playOn') as GameState;
    expect(plakoto.result(on)).toBeNull();
    expect(plakoto.prompt?.(on)).toBeNull();
    expect(on.variantData).toEqual(PLAYED_ON);
    expect(plakoto.legalTurns(on, [6, 5]).length).toBeGreaterThan(0);
    // Black bears the pinner off (1/0) and pins the mother again (3/1*): no new question.
    const again = play(black('w: 24! 6x14 ; b: 3 1 offx13', {}, PLAYED_ON), [2, 1], '1/0 3/1*');
    expect(formatPlakoto(again.board)).toBe('w: 24! 6x14 ; b: 1 offx14');
    expect(plakoto.prompt?.(again)).toBeNull();
    // Without the earlier "play on", the same turn asks.
    expect(
      plakoto.prompt?.(play(black('w: 24! 6x14 ; b: 3 1 offx13'), [2, 1], '1/0 3/1*')),
    ).toEqual(ASK_WHITE);
  });

  it('answers are checked', () => {
    const asked = play(black(PIN), [5, 2], '3/1* 10/5');
    const answer = (s: GameState, player: 'white' | 'black', choice: string) =>
      plakoto.answerPrompt?.(s, player, choice);
    expect(() => answer(asked, 'black', 'resign')).toThrow(illegalAction);
    expect(() => answer(asked, 'white', 'maybe')).toThrow(illegalAction);
    expect(() => answer(black(PIN), 'white', 'resign')).toThrow(illegalAction);
  });

  it('afterEachMove asks about a pin that ended later in the turn; endOfTurn does not', () => {
    // Black pins with 3/1* and bears that checker off with the 1.
    const text = 'w: 24 6x14 ; b: 3 2 offx13';
    const each = play(black(text), [2, 1], '3/1* 1/0');
    expect(formatPlakoto(each.board)).toBe('w: 24 6x14 ; b: 2 offx14');
    expect(plakoto.prompt?.(each)).toEqual(ASK_WHITE);
    const end = play(black(text, END_OF_TURN), [2, 1], '3/1* 1/0');
    expect(plakoto.prompt?.(end)).toBeNull();
    // endOfTurn asks when the mother is still pinned at the end of the turn.
    expect(plakoto.prompt?.(play(black(PIN, END_OF_TURN), [5, 2], '3/1* 10/5'))).toEqual(ASK_WHITE);
  });

  it('both mothers pinned is a draw (mutualMotherPin "draw"), at once after the move', () => {
    // White played on; now White's 3/1* pins Black's mother too.
    const text = 'w: 24! 6x13 3 ; b: 24 10x13 1';
    const s = plakotoState(text, { variantData: PLAYED_ON });
    const turns = plakoto.legalTurns(s, [5, 2]).map(formatTurn);
    expect(turns).toContain('3/1*');
    const draw = play(s, [5, 2], '3/1*');
    expect(plakoto.result(draw)).toEqual({ winner: null, points: 0, reason: 'bothMothersPinned' });
    // endOfTurn: the whole roll is played first.
    const late = plakotoState(text, { variantData: PLAYED_ON, rules: END_OF_TURN });
    expect(plakoto.legalTurns(late, [5, 2]).map(formatTurn)).not.toContain('3/1*');
    expect(plakoto.result(play(late, [5, 2], '3/1* 6/1'))).toMatchObject({ winner: null });
  });

  it('checks state.variantData', () => {
    const bad = (variantData: JsonObject) => () => plakoto.result(black(PIN, {}, variantData));
    const invalid = expect.objectContaining({ code: 'INVALID_STATE', path: 'state.variantData' });
    expect(bad({ offer: null })).toThrow(invalid);
    expect(bad({ offer: 'red', playOn: [], conceded: null })).toThrow(invalid);
    expect(bad({ offer: null, playOn: ['white', 'white'], conceded: null })).toThrow(invalid);
    expect(bad({ offer: null, playOn: [], conceded: null, extra: 1 })).toThrow(invalid);
  });
});

describe('the mother rule in the turn flow', () => {
  function step(flow: GameFlow, ...actions: GameAction[]): GameFlow {
    return actions.reduce((f, action) => applyGameAction(f, action), flow);
  }

  const roll = (dice: Dice): GameAction => ({ type: 'roll', player: 'black', dice });
  const move = (from: number, to: number, die: 1 | 2 | 3 | 4 | 5 | 6): GameAction => ({
    type: 'move',
    player: 'black',
    move: { from, to, die },
  });
  const confirm: GameAction = { type: 'confirm', player: 'black' };

  it('offerConcede: after the turn the flow waits for the pinned player’s answer', () => {
    const flow = createGameFlow({ state: black('w: 24 6x14 ; b: 10x14 3'), starter: 'black' });
    const asked = step(flow, roll([5, 2]), move(3, 1, 2), move(10, 5, 5), confirm);
    expect(asked.phase).toBe('awaiting-answer');
    expect(asked.state.toMove).toBe('white');
    expect(currentPrompt(asked)).toEqual(ASK_WHITE);
    expect(() => applyGameAction(asked, { type: 'roll', player: 'white' })).toThrow(illegalAction);
    expect(() =>
      applyGameAction(asked, { type: 'answer', player: 'black', choice: 'resign' }),
    ).toThrow(illegalAction);

    const on = applyGameAction(asked, { type: 'answer', player: 'white', choice: 'playOn' });
    expect(on.phase).toBe('awaiting-roll');
    expect(currentPrompt(on)).toBeNull();

    const over = applyGameAction(asked, { type: 'answer', player: 'white', choice: 'resign' });
    expect(over.phase).toBe('game-over');
    expect(over.result).toEqual({ winner: 'black', points: 2, reason: 'resigned' });

    // Resigning instead of answering scores the same 2 points.
    const resigned = applyGameAction(asked, { type: 'resign', player: 'white' });
    expect(resigned.result).toEqual({ winner: 'black', points: 2, reason: 'resigned' });
  });

  it('federation, afterEachMove: the pin completes the turn; confirm ends the game', () => {
    const state = black('w: 24 6x14 ; b: 10x14 3', { mother: { motherRule: 'federation' } });
    const flow = step(createGameFlow({ state, starter: 'black' }), roll([5, 2]));
    const sources = legalNextMoves(flow).map((s) => s.from);
    expect(sources).toEqual([10, 3]);
    const pinned = step(flow, move(3, 1, 2));
    expect(pinned.phase).toBe('awaiting-confirm');
    const over = step(pinned, confirm);
    expect(over.phase).toBe('game-over');
    expect(over.result).toEqual({ winner: 'black', points: 2, reason: 'motherPinned' });
    expect(over.lastTurn?.moves).toHaveLength(1);
    // Undo works as for any other move before confirm.
    expect(step(pinned, { type: 'undo', player: 'black' }).phase).toBe('moving');
  });
});

describe('Plakoto in a match', () => {
  it('a Tavli match plays a real Plakoto game as game 2', () => {
    const match = createMatch({ rules: getPreset('tavli'), starter: 'white' });
    const after1 = recordGameResult(match, { winner: 'black', points: 1, reason: 'borneOff' });
    const state = startNextGame(after1, 'black');
    expect(state.variant).toBe('plakoto');
    expect(state.rules.mother.motherRule).toBe('offerConcede');
    expect(formatPlakoto(state.board)).toBe('w: 24x15 ; b: 24x15');
  });

  it('random Plakoto matches through the flow, with questions and undos, replay to the same JSON', () => {
    const configs = [
      resolveRules('plakoto', { match: { rotation: ['plakoto'], targetPoints: 2 } }),
      resolveRules('plakoto.federation', { match: { rotation: ['plakoto'], targetPoints: 2 } }),
    ];
    let answers = 0;
    configs.forEach((rules, seed) => {
      const dice = createSeededRng(seed + 10);
      const choices = createSeededRng(seed + 1010);
      let flow: MatchFlow = createMatchFlow({ rules, starter: null });
      for (let step = 0; step < 20_000 && matchPhase(flow) !== 'match-over'; step += 1) {
        const action = randomAction(flow, choices, { undo: 0.05 });
        if (action === null) break;
        if (action.type === 'answer') answers += 1;
        flow = applyMatchAction(flow, action, { rng: dice });
      }
      expect(matchPhase(flow)).toBe('match-over');
      expect(JSON.stringify(replay(flow.log))).toBe(JSON.stringify(flow));
    });
    expect(answers).toBeGreaterThan(0);
  }, 30_000);
});

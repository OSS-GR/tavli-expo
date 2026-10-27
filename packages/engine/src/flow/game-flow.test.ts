import { describe, expect, it } from 'vitest';

import type { Dice, DieValue } from '../dice';
import { formatMove } from '../move';
import type { Move } from '../move';
import type { PlayerId } from '../player';
import { resolveRules } from '../presets';
import { createSeededRng } from '../rng';
import type { RuleOverrides } from '../rules';
import type { GameState } from '../state';
import { formatPosition, parseTurn, portesState } from '../testing/position-notation';
import { raceVariant } from '../testing/race-variant';
import { createVariantRegistry } from '../variant';
import type { Variant } from '../variant';
import { portes } from '../variants';
import {
  applyGameAction,
  canConfirm,
  canUndo,
  createGameFlow,
  currentBoard,
  currentPrompt,
  legalNextMoves,
  remainingDice,
} from './game-flow';
import type { FlowContext, GameAction, GameFlow, MoveInput } from './game-flow';

const illegalAction = expect.objectContaining({ code: 'ILLEGAL_ACTION' });
const illegalMove = expect.objectContaining({ code: 'ILLEGAL_MOVE' });

function rules(overrides: RuleOverrides = {}) {
  return resolveRules('portes', overrides);
}

/** A flow at the start of the game, before the opening roll. */
function opening(overrides: RuleOverrides = {}): GameFlow {
  return createGameFlow({
    state: portes.initialState({ startingPlayer: 'white', rules: rules(overrides) }),
    starter: null,
  });
}

/** A flow in a position (notation), White to roll. */
function at(text: string, overrides: RuleOverrides = {}): GameFlow {
  return createGameFlow({
    state: portesState(text, { rules: rules(overrides) }),
    starter: 'white',
  });
}

function run(flow: GameFlow, actions: readonly GameAction[], ctx: FlowContext = {}): GameFlow {
  return actions.reduce((f, action) => applyGameAction(f, action, ctx), flow);
}

const roll = (player: PlayerId, dice: Dice): GameAction => ({ type: 'roll', player, dice });
const die = (player: PlayerId, value: DieValue): GameAction => ({
  type: 'rollOpening',
  player,
  die: value,
});

/** One move in notation (`13/8`, `13/8*`, `4/0:6`) as the UI would send it. */
function move(text: string, player: PlayerId = 'white'): GameAction {
  const parsed = parseTurn(text, player, [1, 1]).moves[0] as Move;
  const input: MoveInput = { from: parsed.from, to: parsed.to, die: parsed.die };
  return { type: 'move', player, move: input };
}

const names = (flow: GameFlow): string[] =>
  legalNextMoves(flow).flatMap((source) => source.moves.map(formatMove));

describe('tavli-match.md opening roll', () => {
  it('tavli-match.md #1: a tie is rolled again until the dice differ', () => {
    let flow = opening();
    expect(flow).toMatchObject({ phase: 'opening-roll', starter: null });
    flow = run(flow, [die('white', 4), die('black', 4)]);
    expect(flow.phase).toBe('opening-roll');
    expect(flow.opening).toEqual({ white: null, black: null, ties: [4] });
    flow = run(flow, [die('black', 2), die('white', 2), die('white', 6), die('black', 1)]);
    expect(flow.opening).toEqual({ white: 6, black: 1, ties: [4, 2] });
    expect(flow.starter).toBe('white');
  });

  it('tavli-match.md #2: useOpeningDice: opening dice 5 and 3 → the starter plays 5-3', () => {
    const flow = run(opening(), [die('white', 3), die('black', 5)]);
    expect(flow).toMatchObject({ phase: 'moving', starter: 'black' });
    expect(flow.state).toMatchObject({ toMove: 'black', dice: [5, 3], turnNumber: 1 });
    expect(remainingDice(flow)).toEqual([5, 3]);
    expect(() => applyGameAction(flow, roll('black', [6, 6]))).toThrow(illegalAction);
  });

  it('portes.md #15 / tavli-match.md #2: with useOpeningDice the first roll is never a double', () => {
    for (let seed = 1; seed <= 300; seed += 1) {
      const rng = createSeededRng(seed);
      let flow = opening();
      while (flow.phase === 'opening-roll') {
        const next = flow.opening?.white === null ? 'white' : 'black';
        flow = applyGameAction(flow, { type: 'rollOpening', player: next }, { rng });
      }
      const [a, b] = flow.state.dice as Dice;
      expect(a).not.toBe(b);
      // The starter rolled the higher die.
      expect(a).toBeGreaterThan(b);
    }
  });

  it('tavli-match.md #3: rerollBoth: the starter rolls again and may roll a double', () => {
    const flow = run(opening({ match: { openingRoll: 'rerollBoth' } }), [
      die('white', 6),
      die('black', 2),
    ]);
    expect(flow).toMatchObject({ phase: 'awaiting-roll', starter: 'white' });
    expect(flow.state.dice).toBeNull();
    const rolled = applyGameAction(flow, roll('white', [6, 6]));
    expect(rolled.state.dice).toEqual([6, 6]);
    expect(remainingDice(rolled)).toEqual([6, 6, 6, 6]);
  });

  it('tavli-match.md flag openingRoll "chosenStarterRolls": the players pick the starter', () => {
    const flow = opening({ match: { openingRoll: 'chosenStarterRolls' } });
    expect(flow).toMatchObject({ phase: 'opening-roll', opening: null });
    expect(() => applyGameAction(flow, die('white', 3))).toThrow(illegalAction);
    const chosen = applyGameAction(flow, { type: 'chooseStarter', player: 'black' });
    expect(chosen).toMatchObject({ phase: 'awaiting-roll', starter: 'black' });
    expect(chosen.state.toMove).toBe('black');
    expect(() => applyGameAction(opening(), { type: 'chooseStarter', player: 'black' })).toThrow(
      illegalAction,
    );
  });

  it('a player rolls one opening die per round; other actions wait', () => {
    const flow = applyGameAction(opening(), die('white', 3));
    expect(() => applyGameAction(flow, die('white', 4))).toThrow(illegalAction);
    expect(() => applyGameAction(flow, roll('white', [3, 1]))).toThrow(illegalAction);
    expect(() => applyGameAction(flow, { type: 'resign', player: 'white' })).toThrow(illegalAction);
  });
});

describe('turn phases', () => {
  const START = 'w: 24x2 13x5 8x3 6x5 ; b: 24x2 13x5 8x3 6x5';

  it('goes awaiting-roll → moving → awaiting-confirm → next player awaiting-roll', () => {
    let flow = at(START);
    expect(flow.phase).toBe('awaiting-roll');
    flow = applyGameAction(flow, roll('white', [3, 1]));
    expect(flow.phase).toBe('moving');
    flow = applyGameAction(flow, move('8/5'));
    expect(flow.phase).toBe('moving');
    expect(remainingDice(flow)).toEqual([1]);
    expect(canConfirm(flow)).toBe(false);
    flow = applyGameAction(flow, move('6/5'));
    expect(flow.phase).toBe('awaiting-confirm');
    expect(canConfirm(flow)).toBe(true);
    flow = applyGameAction(flow, { type: 'confirm', player: 'white' });
    expect(flow).toMatchObject({ phase: 'awaiting-roll', played: [] });
    expect(flow.state).toMatchObject({ toMove: 'black', dice: null, turnNumber: 2 });
    expect(formatPosition(flow.state.board)).toBe(
      'w: 24x2 13x5 8x2 6x4 5x2 ; b: 24x2 13x5 8x3 6x5',
    );
    expect(flow.lastTurn).toMatchObject({ player: 'white', dice: [3, 1] });
  });

  it('cannot confirm an incomplete turn', () => {
    const flow = run(at(START), [roll('white', [3, 1]), move('8/5')]);
    expect(() => applyGameAction(flow, { type: 'confirm', player: 'white' })).toThrow(
      illegalAction,
    );
  });

  it('undo goes back one move at a time, down to the turn start', () => {
    const rolled = applyGameAction(at(START), roll('white', [4, 4]));
    expect(canUndo(rolled)).toBe(false);
    expect(() => applyGameAction(rolled, { type: 'undo', player: 'white' })).toThrow(illegalAction);
    const moved = run(rolled, [move('24/20'), move('20/16'), move('13/9'), move('13/9')]);
    expect(moved.phase).toBe('awaiting-confirm');
    expect(remainingDice(moved)).toEqual([]);
    const undo: GameAction = { type: 'undo', player: 'white' };
    const back1 = applyGameAction(moved, undo);
    expect(back1.phase).toBe('moving');
    expect(back1.played.map(formatMove)).toEqual(['24/20', '20/16', '13/9']);
    const back = run(back1, [undo, undo, undo]);
    expect(back).toEqual(rolled);
    expect(currentBoard(back)).toEqual(rolled.state.board);
  });

  it('only the player to move may roll, move, undo and confirm', () => {
    const flow = at(START);
    expect(() => applyGameAction(flow, roll('black', [3, 1]))).toThrow(illegalAction);
    const rolled = applyGameAction(flow, roll('white', [3, 1]));
    expect(() => applyGameAction(rolled, move('8/5', 'black'))).toThrow(illegalAction);
    expect(() => applyGameAction(rolled, roll('white', [3, 1]))).toThrow(illegalAction);
  });

  it('a move that is not legal now is refused with ILLEGAL_MOVE', () => {
    const rolled = applyGameAction(at(START), roll('white', [3, 1]));
    expect(() => applyGameAction(rolled, move('13/9'))).toThrow(illegalMove);
    // 6/2 needs a 4, which was not rolled.
    expect(() => applyGameAction(rolled, move('6/2'))).toThrow(illegalMove);
  });

  it('prefix rule: a move that would make the full roll unplayable is refused', () => {
    // 7/1 (6) is legal alone, but then no 5 can be played. 20/14/9 plays both.
    const flow = applyGameAction(
      at('w: 24x13 20 7 ; b: 23x2 10x2 7x2 6x2 3x7'),
      roll('white', [6, 5]),
    );
    expect(names(flow)).toEqual(['20/14']);
    expect(() => applyGameAction(flow, move('7/1'))).toThrow(illegalMove);
    const done = run(flow, [move('20/14'), move('14/9')]);
    expect(done.phase).toBe('awaiting-confirm');
  });

  it('any order of a legal play works (6-1 as 13/12 12/6)', () => {
    const flow = run(at('w: 13x15 ; b: 1x15'), [
      roll('white', [6, 1]),
      move('13/12'),
      move('12/6'),
    ]);
    expect(flow.phase).toBe('awaiting-confirm');
  });

  it('tavli-match.md #13: no legal move → the turn passes by itself; the dice are kept', () => {
    const flow = applyGameAction(
      at('w: bar 13x14 ; b: 6x2 5x2 4x2 3x2 2x2 1x2 24x3'),
      roll('white', [4, 2]),
    );
    expect(flow.phase).toBe('awaiting-roll');
    expect(flow.state).toMatchObject({ toMove: 'black', turnNumber: 2, dice: null });
    expect(flow.lastTurn).toEqual({ player: 'white', dice: [4, 2], moves: [] });
  });

  it('tavli-match.md #9: when only one die can be played, the turn is complete after it', () => {
    const flow = run(at('w: 13x15 ; b: 18x2 23x2 24x11'), [roll('white', [6, 5]), move('13/8')]);
    expect(flow.phase).toBe('awaiting-confirm');
    // The 6 is lost; the UI can grey it out.
    expect(remainingDice(flow)).toEqual([6]);
  });

  it('autoConfirm ends the turn as soon as it is complete', () => {
    const flow = run(at(START), [roll('white', [3, 1]), move('8/5')]);
    const auto = applyGameAction(flow, {
      type: 'move',
      player: 'white',
      move: { from: 6, to: 5, die: 1 },
      autoConfirm: true,
    });
    expect(auto.phase).toBe('awaiting-roll');
    expect(auto.state.toMove).toBe('black');
  });

  it('rolls with the injected Rng, and refuses to roll without dice or an Rng', () => {
    const flow = at(START);
    expect(() => applyGameAction(flow, { type: 'roll', player: 'white' })).toThrow(illegalAction);
    const a = applyGameAction(flow, { type: 'roll', player: 'white' }, { rng: createSeededRng(9) });
    const b = applyGameAction(flow, { type: 'roll', player: 'white' }, { rng: createSeededRng(9) });
    expect(a).toEqual(b);
    expect(() => applyGameAction(flow, roll('white', [7, 1] as unknown as Dice))).toThrow(
      illegalAction,
    );
  });

  it('the game ends when a player bears off the last checker', () => {
    const flow = run(at('w: 1 offx14 ; b: 6x15'), [roll('white', [3, 1]), move('1/0:3')]);
    expect(flow.phase).toBe('awaiting-confirm');
    const over = applyGameAction(flow, { type: 'confirm', player: 'white' });
    expect(over).toMatchObject({
      phase: 'game-over',
      result: { winner: 'white', points: 2, reason: 'borneOff' },
    });
    expect(() => applyGameAction(over, roll('black', [3, 1]))).toThrow(illegalAction);
  });
});

describe('resign during a turn', () => {
  it('ends the game; the moves of the unfinished turn do not count', () => {
    const flow = run(at('w: 6x3 3x2 offx10 ; b: 24x14 offx1'), [
      roll('white', [6, 3]),
      move('6/0'),
    ]);
    expect(flow.played).toHaveLength(1);
    const over = applyGameAction(flow, { type: 'resign', player: 'black' });
    // Black has borne off one checker: White wins a mono.
    expect(over).toMatchObject({
      phase: 'game-over',
      played: [],
      result: { winner: 'white', points: 1, reason: 'resigned' },
    });
    expect(over.state.board).toEqual(flow.state.board);
  });

  it('the player to move may resign too; a player with nothing off gives a diplo', () => {
    const flow = applyGameAction(at('w: 24x2 13x5 8x3 6x5 ; b: 6x15'), roll('white', [3, 1]));
    const over = applyGameAction(flow, { type: 'resign', player: 'white' });
    expect(over.result).toEqual({ winner: 'black', points: 2, reason: 'resigned' });
  });
});

describe('timeout (online turn timers, #133)', () => {
  it('ends the game like a resign, with the reason timeout; unfinished moves do not count', () => {
    const flow = run(at('w: 6x3 3x2 offx10 ; b: 24x14 offx1'), [
      roll('white', [6, 3]),
      move('6/0'),
    ]);
    const over = applyGameAction(flow, { type: 'timeout', player: 'white' });
    // White has borne off ten checkers: Black wins a mono.
    expect(over).toMatchObject({
      phase: 'game-over',
      played: [],
      result: { winner: 'black', points: 1, reason: 'timeout' },
    });
    expect(over.state.board).toEqual(flow.state.board);
  });

  it('a player with nothing off gives a diplo', () => {
    const flow = applyGameAction(at('w: 24x2 13x5 8x3 6x5 ; b: 6x15'), roll('white', [3, 1]));
    const over = applyGameAction(flow, { type: 'timeout', player: 'white' });
    expect(over.result).toEqual({ winner: 'black', points: 2, reason: 'timeout' });
  });

  it('only the player the game waits for can time out, and not before the game starts', () => {
    const flow = applyGameAction(at('w: 24x2 13x5 8x3 6x5 ; b: 6x15'), roll('white', [3, 1]));
    expect(() => applyGameAction(flow, { type: 'timeout', player: 'black' })).toThrow(
      illegalAction,
    );
    expect(() => applyGameAction(opening(), { type: 'timeout', player: 'white' })).toThrow(
      illegalAction,
    );
    const over = applyGameAction(flow, { type: 'timeout', player: 'white' });
    expect(() => applyGameAction(over, { type: 'timeout', player: 'white' })).toThrow(
      illegalAction,
    );
  });
});

describe('UI helpers', () => {
  it('legalNextMoves groups the single moves by source', () => {
    const flow = applyGameAction(at('w: 13x14 bar ; b: 3x15'), roll('white', [6, 1]));
    // A checker on the bar enters first.
    expect(legalNextMoves(flow)).toEqual([
      {
        from: 'bar',
        moves: [
          { from: 'bar', to: 19, die: 6, capture: 'none' },
          { from: 'bar', to: 24, die: 1, capture: 'none' },
        ],
      },
    ]);
    const entered = applyGameAction(flow, move('25/19'));
    expect(legalNextMoves(entered).map((s) => s.from)).toEqual([19, 13]);
    expect(legalNextMoves(at('w: 13x15 ; b: 1x15'))).toEqual([]);
  });

  it('currentBoard shows the board in the middle of a turn, with hits', () => {
    const flow = run(at('w: 13 6x14 ; b: 17 24x14'), [roll('white', [5, 1]), move('13/8*')]);
    expect(formatPosition(currentBoard(flow))).toBe('w: 8 6x14 ; b: 24x14 bar');
    expect(formatPosition(flow.state.board)).toBe('w: 13 6x14 ; b: 24x14 17');
  });

  it('the flow is plain JSON', () => {
    const flow = run(at('w: 13 6x14 ; b: 17 24x14'), [roll('white', [5, 1]), move('13/8*')]);
    expect(JSON.parse(JSON.stringify(flow))).toEqual(flow);
  });
});

describe('variant prompts (hook for Plakoto "resign or play on")', () => {
  // A fake variant: after turn 1 the player to move is asked "resign or play on".
  const asking: Variant = {
    ...raceVariant,
    applyTurn(state, turn) {
      const next = raceVariant.applyTurn(state, turn);
      return next.turnNumber === 2 ? { ...next, variantData: { ask: next.toMove } } : next;
    },
    result(state) {
      if (state.variantData?.['resigned'] === true) {
        const loser = state.toMove;
        return { winner: loser === 'white' ? 'black' : 'white', points: 2, reason: 'resigned' };
      }
      return raceVariant.result(state);
    },
    isGameOver(state) {
      return this.result(state) !== null;
    },
    prompt(state: GameState) {
      const ask = state.variantData?.['ask'];
      if (ask !== 'white' && ask !== 'black') return null;
      return { player: ask, kind: 'motherPinned', choices: ['resign', 'playOn'] };
    },
    answerPrompt(state: GameState, _player: PlayerId, choice: string) {
      return { ...state, variantData: choice === 'resign' ? { resigned: true } : null };
    },
  };
  const ctx: FlowContext = { registry: createVariantRegistry([asking]) };
  const start = () =>
    run(
      createGameFlow({ state: asking.initialState({ startingPlayer: 'white' }), starter: 'white' }),
      [roll('white', [2, 1]), move('6/4'), move('6/5')],
      ctx,
    );

  it('waits for the answer after the turn, then plays on', () => {
    const flow = applyGameAction(start(), { type: 'confirm', player: 'white' }, ctx);
    expect(flow.phase).toBe('awaiting-answer');
    expect(currentPrompt(flow, ctx)).toEqual({
      player: 'black',
      kind: 'motherPinned',
      choices: ['resign', 'playOn'],
    });
    expect(() => applyGameAction(flow, roll('black', [2, 1]), ctx)).toThrow(illegalAction);
    expect(() =>
      applyGameAction(flow, { type: 'answer', player: 'white', choice: 'playOn' }, ctx),
    ).toThrow(illegalAction);
    expect(() =>
      applyGameAction(flow, { type: 'answer', player: 'black', choice: 'maybe' }, ctx),
    ).toThrow(illegalAction);
    const on = applyGameAction(flow, { type: 'answer', player: 'black', choice: 'playOn' }, ctx);
    expect(on.phase).toBe('awaiting-roll');
    expect(on.state.toMove).toBe('black');
  });

  it('the player asked the question can time out; the other player cannot', () => {
    const flow = applyGameAction(start(), { type: 'confirm', player: 'white' }, ctx);
    expect(() => applyGameAction(flow, { type: 'timeout', player: 'white' }, ctx)).toThrow(
      illegalAction,
    );
    const over = applyGameAction(flow, { type: 'timeout', player: 'black' }, ctx);
    expect(over).toMatchObject({
      phase: 'game-over',
      result: { winner: 'white', reason: 'timeout' },
    });
  });

  it('an answer can end the game', () => {
    const flow = applyGameAction(start(), { type: 'confirm', player: 'white' }, ctx);
    const over = applyGameAction(flow, { type: 'answer', player: 'black', choice: 'resign' }, ctx);
    expect(over).toMatchObject({
      phase: 'game-over',
      result: { winner: 'white', points: 2, reason: 'resigned' },
    });
  });
});

import {
  applyGameAction,
  asodio,
  createBoard,
  createGameFlow,
  getPreset,
  legalNextMoves,
  portes,
  type BoardState,
  type Dice,
  type GameFlow,
  type Move,
  type RuleSet,
} from '@tavli/engine';

import i18n from '@/i18n';

import { flowPaths } from '@/features/board/combined';

import {
  choiceLabel,
  choiceShortLabel,
  listChoices,
  moveChoices,
  moveLabel,
  moveShortLabel,
} from './moveChoices';
import { moveListShown } from './screenReader';

const t = i18n.t;
const m = (
  from: Move['from'],
  to: Move['to'],
  die: Move['die'],
  capture: Move['capture'] = 'none',
) => ({ from, to, die, capture }) as Move;

beforeEach(async () => {
  await i18n.changeLanguage('en');
});

function flowWith(
  board: BoardState,
  dice: Dice,
  rules: RuleSet = getPreset('portes'),
  variant = portes,
): GameFlow {
  const start = variant.initialState({ startingPlayer: 'white', rules });
  const flow = createGameFlow({ state: { ...start, board }, starter: 'white' });
  return applyGameAction(flow, { type: 'roll', player: 'white', dice });
}

describe('moveLabel', () => {
  it('names a move, a hit, the bar, bearing off and entering (Asodio)', () => {
    expect(moveLabel(t, m(13, 8, 5))).toBe('Checker from point 13 to point 8');
    expect(moveLabel(t, m(13, 8, 5, 'hit'))).toBe('Checker from point 13 to point 8, hits');
    expect(moveLabel(t, m(6, 1, 5, 'pin'))).toBe('Checker from point 6 to point 1, pins');
    expect(moveLabel(t, m('bar', 22, 3))).toBe('From the bar to point 22');
    expect(moveLabel(t, m('bar', 22, 3, 'hit'))).toBe('From the bar to point 22, hits');
    expect(moveLabel(t, m(6, 'off', 6))).toBe('Bear off from point 6');
    expect(moveLabel(t, m('outside', 22, 3))).toBe('Enter on point 22');
    expect(moveLabel(t, m('outside', 23, 2, 'pin'))).toBe('Enter on point 23, pins');
  });

  it('has a short form for the button', () => {
    expect(moveShortLabel(t, m(13, 8, 5))).toBe('13 → 8');
    expect(moveShortLabel(t, m(13, 8, 5, 'hit'))).toBe('13 → 8 · hit');
    expect(moveShortLabel(t, m('bar', 22, 3))).toBe('Bar → 22');
    expect(moveShortLabel(t, m(6, 'off', 6))).toBe('6 → Off');
    expect(moveShortLabel(t, m('outside', 22, 3, 'pin'))).toBe('Enter → 22 · pin');
  });

  it('speaks Greek', async () => {
    await i18n.changeLanguage('el');
    expect(moveLabel(t, m(13, 8, 5, 'hit'))).toBe('Πούλι από το σημείο 13 στο σημείο 8, χτυπάει');
    expect(moveLabel(t, m('outside', 22, 3))).toBe('Μπαίνει στο σημείο 22');
    expect(moveLabel(t, m(6, 'off', 6))).toBe('Μάζεμα από το σημείο 6');
  });
});

describe('moveChoices', () => {
  it('offers every legal move of the Portes start once, furthest back first', () => {
    const start = portes.initialState({ startingPlayer: 'white', rules: getPreset('portes') });
    const flow = flowWith(start.board, [5, 3]);
    const choices = moveChoices(legalNextMoves(flow));
    const all = legalNextMoves(flow).flatMap((g) => g.moves);
    expect(choices).toHaveLength(all.length);
    expect(choices.map((move) => `${String(move.from)}/${String(move.to)}`)).toEqual([
      '24/21',
      '13/10',
      '13/8',
      '8/5',
      '8/3',
      '6/3',
    ]);
  });

  it('keeps the lower die when two dice bear off the same checker', () => {
    const board = createBoard(
      { white: { points: { 4: 1, 2: 1 }, off: 13 }, black: { points: { 24: 15 } } },
      'contrary',
    );
    const flow = flowWith(board, [6, 4]);
    // The 4 and the 6 both bear off the checker on 4: the 4 is used, so the 6 stays.
    expect(legalNextMoves(flow)[0]?.moves).toHaveLength(2);
    expect(moveChoices(legalNextMoves(flow))).toEqual([m(4, 'off', 4)]);
  });

  it('labels the moves from the bar with the mover’s own points', () => {
    const board = createBoard(
      { white: { points: { 6: 14 }, bar: 1 }, black: { points: { 1: 15 } } },
      'contrary',
    );
    const flow = flowWith(board, [5, 3]);
    expect(moveChoices(legalNextMoves(flow)).map((move) => moveLabel(t, move))).toEqual([
      'From the bar to point 22',
      'From the bar to point 20',
    ]);
  });

  it('offers only entries while Asodio loads (from outside)', () => {
    const rules = getPreset('asodio.kafeneio');
    const start = asodio.initialState({ startingPlayer: 'white', rules });
    const flow = flowWith(start.board, [2, 1], rules, asodio);
    const labels = moveChoices(legalNextMoves(flow)).map((move) => moveLabel(t, move));
    expect(labels).toEqual(['Enter on point 24', 'Enter on point 23']);
  });

  it('is empty when nothing can move', () => {
    expect(moveChoices([])).toEqual([]);
  });
});

// #180: one checker with several dice gets its own button.
describe('listChoices', () => {
  it('adds the combined moves of the Portes start, in board order', () => {
    const start = portes.initialState({ startingPlayer: 'white', rules: getPreset('portes') });
    const flow = flowWith(start.board, [5, 3]);
    const choices = listChoices(legalNextMoves(flow), flowPaths(flow));
    // 13/10/5 and 13/8/5 hit nothing, so the 3 goes first. 24/19 and 6/1
    // land on Black's points, so 24/19/16 and 6/1 are not there.
    expect(choices.map((c) => choiceShortLabel(t, c.moves))).toEqual([
      '24 → 21',
      '24 → 21 → 16',
      '13 → 10',
      '13 → 8',
      '13 → 10 → 5',
      '8 → 5',
      '8 → 3',
      '6 → 3',
    ]);
    expect(choices.map((c) => c.key)).toContain('13>5:3+5');
    // Without paths: the single moves, as before.
    expect(listChoices(legalNextMoves(flow)).map((c) => c.moves)).toEqual(
      moveChoices(legalNextMoves(flow)).map((move) => [move]),
    );
  });

  it('reads each step, with the hit where it happens', () => {
    const steps = [m(13, 8, 5, 'hit'), m(8, 5, 3)];
    expect(choiceLabel(t, steps)).toBe('Checker from point 13 to point 8, hits, then to point 5');
    expect(choiceShortLabel(t, steps)).toBe('13 → 8 → 5 · hit');
    expect(choiceLabel(t, [m(13, 10, 3), m(10, 5, 5, 'pin')])).toBe(
      'Checker from point 13 to point 10, then to point 5, pins',
    );
    expect(choiceLabel(t, [m(5, 3, 2), m(3, 'off', 3)])).toBe(
      'Checker from point 5 to point 3, then bear off',
    );
    expect(choiceShortLabel(t, [m(5, 3, 2), m(3, 'off', 3)])).toBe('5 → 3 → Off');
    expect(choiceShortLabel(t, [m('bar', 22, 3), m(22, 17, 5)])).toBe('Bar → 22 → 17');
    // One move reads as before.
    expect(choiceLabel(t, [m(13, 8, 5)])).toBe(moveLabel(t, m(13, 8, 5)));
  });

  it('speaks Greek', async () => {
    await i18n.changeLanguage('el');
    expect(choiceLabel(t, [m(13, 10, 3), m(10, 5, 5)])).toBe(
      'Πούλι από το σημείο 13 στο σημείο 10, μετά στο σημείο 5',
    );
    expect(choiceShortLabel(t, [m(5, 3, 2), m(3, 'off', 3)])).toBe('5 → 3 → Μάζεμα');
  });
});

describe('moveListShown', () => {
  it('follows the screen reader in auto, and the setting otherwise', () => {
    expect(moveListShown('auto', false)).toBe(false);
    expect(moveListShown('auto', true)).toBe(true);
    expect(moveListShown('on', false)).toBe(true);
    expect(moveListShown('off', true)).toBe(false);
  });
});

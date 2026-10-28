/**
 * The Fevga generator against a slow, simple reference. The reference tries
 * every order of the dice, keeps every prefix, and applies "Order of checks
 * (engine)" from `docs/rules/fevga.md` step by step. It shares no code with
 * `moves.ts`.
 */

import { describe, expect, it } from 'vitest';

import type { BoardState } from '../../board';
import { DIE_VALUES, DISTINCT_ROLLS, diceMoves } from '../../dice';
import type { Dice, DieValue } from '../../dice';
import { formatTurn } from '../../move';
import { opponent } from '../../player';
import type { PlayerId } from '../../player';
import { resolveRules } from '../../presets';
import type { RuleOverrides, RuleSet } from '../../rules';
import { createSeededRng } from '../../rng';
import type { GameState } from '../../state';
import { formatFevgaPosition, parseFevgaPosition } from '../../testing/fevga-notation';
import { randomFevgaPositions } from '../../testing/random-fevga-positions';
import { fevga } from './index';

/** `player`'s own point `p` → absolute point, parallel movement. */
function abs(p: number, player: PlayerId): number {
  return player === 'white' ? p : p > 12 ? p - 12 : p + 12;
}

/** Index 0 = off, 1–24 = own points. */
function counts(board: BoardState, player: PlayerId): number[] {
  const out = [board.off[player]];
  for (let p = 1; p <= 24; p += 1) out.push(board.points[abs(p, player) - 1]?.[player] ?? 0);
  return out;
}

/**
 * The origins of every single move with `die` for a side with checkers
 * `own` (movement rules 1–5 and bearing off). `free(to)` says whether own
 * point `to` has no opponent checker.
 */
function singleMoves(
  own: readonly number[],
  die: number,
  rules: RuleSet,
  free: (to: number) => boolean,
): number[] {
  const target = rules.movement.runnerTarget === 'passMother' ? 11 : 12;
  const runnerOn =
    rules.movement.runnerRule && own[24] !== 15 && own.slice(0, target + 1).every((n) => n === 0);
  const home = own.slice(7).every((n) => n === 0);
  let highest = 0;
  for (let p = 1; p <= 6; p += 1) if ((own[p] ?? 0) > 0) highest = p;
  const out: number[] = [];
  for (let from = 24; from >= 1; from -= 1) {
    if (own[from] === 0 || (from === 24 && runnerOn)) continue;
    const to = from - die;
    if (to >= 1 ? free(to) : home && (to === 0 || from === highest)) out.push(from);
  }
  return out;
}

interface Seq {
  readonly own: readonly number[];
  readonly dice: readonly DieValue[];
}

/** The end positions of every legal play (mover's counts as text), and how many dice they use. */
function reference(state: GameState, dice: Dice): { finals: Set<string>; used: number } {
  const { rules } = state;
  const player = state.toMove;
  const other = opponent(player);
  const theirs = counts(state.board, other);
  // Opponent checkers on the mover's own point p: their own point is the other one.
  const oppOn = (p: number): number => theirs[p > 12 ? p - 12 : p + 12] ?? 0;

  // Every sequence of single moves, and every prefix. Same (position, dice
  // left) twice gives the same continuations, so it is walked once.
  const all: Seq[] = [];
  const walked = new Set<string>();
  const walk = (own: number[], left: DieValue[], used: DieValue[]): void => {
    const id = `${own.join(',')}|${left.join('')}`;
    if (walked.has(id)) return;
    walked.add(id);
    all.push({ own, dice: used });
    left.forEach((die, i) => {
      for (const from of singleMoves(own, die, rules, (to) => oppOn(to) === 0)) {
        const next = own.slice();
        next[from] = (next[from] ?? 0) - 1;
        const to = Math.max(from - die, 0);
        next[to] = (next[to] ?? 0) + 1;
        walk(
          next,
          left.filter((_, j) => j !== i),
          [...used, die],
        );
      }
    });
  };
  walk(counts(state.board, player), [...diceMoves(dice)], []);

  const primes = rules.primes;
  const on = !primes.primeRulesOff;
  const holds = (own: readonly number[], low: number, high: number): boolean => {
    for (let p = low; p <= high; p += 1) if (own[p] === 0) return false;
    return true;
  };
  const [low2, high2] = primes.p2Window === '6-11' ? [6, 11] : [7, 12];
  const banned = (s: Seq): boolean =>
    on &&
    ((primes.p1NoPrimeOwnStart && holds(s.own, 19, 24)) ||
      (primes.p2NoPrimeFrontOfMother && holds(s.own, low2, high2)));
  // P3: the opponent has a single-die move for some die. Their point q is the mover's other one.
  const leaves = (s: Seq): boolean =>
    DIE_VALUES.some(
      (die) =>
        singleMoves(theirs, die, rules, (q) => (s.own[q > 12 ? q - 12 : q + 12] ?? 0) === 0)
          .length > 0,
    );
  const p3 = (seqs: Seq[]): Seq[] => {
    const open = seqs.filter(leaves);
    return open.length > 0 ? open : seqs;
  };

  // Step 2, (P3 before), step 3, (P3 after).
  let seqs = all.filter((s) => !banned(s));
  const p3On = on && primes.p3MustLeaveMove;
  if (p3On && primes.p3Priority === 'beforeDiceRule') seqs = p3(seqs);
  const most = Math.max(...seqs.map((s) => s.dice.length));
  seqs = seqs.filter((s) => s.dice.length === most);
  if (most === 1 && dice[0] !== dice[1] && rules.movement.higherDieRule) {
    const withHigh = seqs.filter((s) => s.dice[0] === Math.max(dice[0], dice[1]));
    if (withHigh.length > 0) seqs = withHigh;
  }
  if (p3On && primes.p3Priority === 'afterDiceRule') seqs = p3(seqs);
  return { finals: new Set(seqs.map((s) => s.own.join(','))), used: most };
}

function compare(state: GameState, dice: Dice): void {
  const ref = reference(state, dice);
  const turns = fevga.legalTurns(state, dice);
  const finals = turns.map((turn) =>
    counts(fevga.applyTurn(state, turn).board, state.toMove).join(','),
  );
  const same = finals.length === ref.finals.size && finals.every((f) => ref.finals.has(f));
  if (!same) {
    const where = `${formatFevgaPosition(state.board)}, ${state.toMove} ${dice.join('-')}`;
    throw new Error(`${where}: engine ${JSON.stringify(turns.map(formatTurn))}`);
  }
  // Each end position is listed once, and every play uses the same dice.
  expect(new Set(finals).size).toBe(finals.length);
  for (const turn of turns) expect(turn.moves.length).toBe(ref.used);
}

function everyRoll(state: GameState): void {
  for (const { dice } of DISTINCT_ROLLS) compare(state, dice);
}

describe('Fevga generator vs. the slow reference', () => {
  it(
    'finds the same end positions, each once, in 300 random positions',
    { timeout: 60_000 },
    () => {
      for (const state of randomFevgaPositions(99, 300, 3)) compare(state, state.dice ?? [1, 1]);
    },
  );

  it.each<[string, RuleOverrides]>([
    ['default rules', {}],
    ['no runner rule', { movement: { runnerRule: false } }],
    ['reachQuarter', { movement: { runnerTarget: 'reachQuarter' } }],
    [
      'p2Window 7-12, beforeDiceRule',
      { primes: { p2Window: '7-12', p3Priority: 'beforeDiceRule' } },
    ],
    ['higherDieRule off', { movement: { higherDieRule: false } }],
  ])('agrees on every roll in 25 random positions (%s)', { timeout: 60_000 }, (_, overrides) => {
    const rules = resolveRules('fevga', overrides);
    for (const position of randomFevgaPositions(7, 25, 11)) {
      everyRoll({ ...position, rules, dice: null });
    }
  });

  it('agrees in random near-block positions, where P3 often decides', { timeout: 60_000 }, () => {
    // Black's movable checkers and the six points that would block them
    // (in White's numbering), as in fevga.md #15–#17.
    const shapes = [
      { black: 'b: 18 24x14', land: [1, 2, 3, 4, 5, 24], taken: [6, 12] },
      { black: 'b: 14 24x14', land: [1, 20, 21, 22, 23, 24], taken: [2, 12] },
      { black: 'b: 20x14 1', land: [2, 3, 4, 5, 6, 7], taken: [8, 13] },
    ];
    const rng = createSeededRng(5);
    const random = (n: number): number => rng.nextUint32() % n;
    const noP3 = resolveRules('fevga', { primes: { p3MustLeaveMove: false } });
    const start = fevga.initialState({ startingPlayer: 'white' });
    let decided = 0;
    for (let i = 0; i < 36; i += 1) {
      const shape = shapes[i % shapes.length] as (typeof shapes)[number];
      const white = new Map<number, number>();
      let n = 0;
      for (const p of shape.land) {
        if (random(5) === 0) continue;
        white.set(p, 1 + random(2));
        n += white.get(p) ?? 0;
      }
      while (n < 15) {
        const p = random(2) === 0 ? (shape.land[random(6)] as number) : 1 + random(24);
        if (shape.taken.includes(p)) continue;
        white.set(p, (white.get(p) ?? 0) + 1);
        n += 1;
      }
      const side = [...white].map(([p, c]) => `${p}x${c}`).join(' ');
      const state = { ...start, board: parseFevgaPosition(`w: ${side} ; ${shape.black}`) };
      everyRoll(state);
      for (const { dice } of DISTINCT_ROLLS) {
        const on = reference(state, dice).finals;
        const off = reference({ ...state, rules: noP3 }, dice).finals;
        if (on.size !== off.size) decided += 1;
      }
    }
    expect(decided).toBeGreaterThan(10);
  });

  it('agrees on every roll in the edge-case positions of fevga.md', { timeout: 60_000 }, () => {
    const start = fevga.initialState({ startingPlayer: 'white' });
    for (const text of [
      'w: 24x15 ; b: 24x15',
      'w: 24x14 13 ; b: 24x15',
      'w: 24x9 23x2 22 21 20 2 ; b: 6 5 4 3 2 24x10',
      'w: 24x10 23 22 21 20 2 ; b: 6 5 4 3 24x11',
      'w: 24x9 13 10 9 8 7 6 ; b: 5x15',
      'w: 24x10 5 4 3 2 1 ; b: 18 24x14',
    ]) {
      everyRoll({ ...start, board: parseFevgaPosition(text) });
    }
  });
});

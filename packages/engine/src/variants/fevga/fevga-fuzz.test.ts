/**
 * Fevga fuzz test: many seeded random games, with the invariants checked
 * after every single move and every turn.
 *
 * The checks are written apart from the engine code, from the rules in
 * `docs/rules/fevga.md`. They use plain `if` checks, not `expect`: they run
 * millions of times and must be cheap.
 */

import { describe, expect, it } from 'vitest';

import { applyMoveToBoard } from '../../board';
import type { BoardState } from '../../board';
import { rollDice } from '../../dice';
import type { Move } from '../../move';
import { PLAYERS, opponent } from '../../player';
import type { PlayerId } from '../../player';
import { resolveRules } from '../../presets';
import type { RuleOverrides, RuleSet } from '../../rules';
import { createSeededRng } from '../../rng';
import type { Rng } from '../../rng';
import { fevga } from './index';

/** Random play is slow to finish, but far below this. */
const MAX_TURNS = 3000;

function pick<T>(rng: Rng, items: readonly T[]): T {
  const item = items[rng.nextUint32() % items.length];
  if (item === undefined) throw new Error('empty list');
  return item;
}

function check(ok: boolean, seed: number, what: string): void {
  if (!ok) throw new Error(`game ${seed}: ${what}`);
}

/** Absolute point (1–24) of `player`'s own point `p`, parallel movement. */
function abs(p: number, player: PlayerId): number {
  return player === 'white' ? p : p > 12 ? p - 12 : p + 12;
}

/** `player`'s checkers by own point: index 0 = off, 1–24 = points. */
function counts(board: BoardState, player: PlayerId): number[] {
  const out = [board.off[player]];
  for (let p = 1; p <= 24; p += 1) out.push(board.points[abs(p, player) - 1]?.[player] ?? 0);
  return out;
}

function pips(board: BoardState, player: PlayerId): number {
  const own = counts(board, player);
  let total = 0;
  for (let p = 1; p <= 24; p += 1) total += (own[p] as number) * p;
  return total;
}

/** 15 checkers each, all on the points or off, never two colors on a point. */
function checkBoard(board: BoardState, seed: number): void {
  let white = board.off.white;
  let black = board.off.black;
  for (const point of board.points) {
    check(point.pinned === null, seed, 'a checker is pinned');
    check(point.white === 0 || point.black === 0, seed, 'a point holds both colors');
    white += point.white;
    black += point.black;
  }
  check(white === 15 && black === 15, seed, 'a player does not have 15 checkers');
  for (const player of PLAYERS) {
    check(board.bar[player] === 0 && board.outside[player] === 0, seed, 'a checker left the board');
  }
}

function holdsAll(own: readonly number[], low: number, high: number): boolean {
  for (let p = low; p <= high; p += 1) if (own[p] === 0) return false;
  return true;
}

/** The runner rule is still on: none off, none on own point ≤ target. */
function runnerOn(own: readonly number[], target: number): boolean {
  for (let p = 0; p <= target; p += 1) if ((own[p] as number) > 0) return false;
  return true;
}

/**
 * P3 (`fevga.md`): true when `player` has a legal single-die move for some
 * die 1–6, with their runner rule and bearing off.
 */
function hasSingleMove(board: BoardState, player: PlayerId, rules: RuleSet): boolean {
  const own = counts(board, player);
  const other = opponent(player);
  const target = rules.movement.runnerTarget === 'passMother' ? 11 : 12;
  const locked = rules.movement.runnerRule && own[24] !== 15 && runnerOn(own, target);
  let home = true;
  let highest = 0;
  for (let p = 24; p >= 1; p -= 1) {
    if (own[p] === 0) continue;
    if (p > 6) home = false;
    else if (highest === 0) highest = p;
  }
  for (let die = 1; die <= 6; die += 1) {
    for (let from = 24; from >= 1; from -= 1) {
      if (own[from] === 0 || (from === 24 && locked)) continue;
      const to = from - die;
      if (to >= 1 ? board.points[abs(to, player) - 1]?.[other] === 0 : home) {
        if (to >= 0 || from === highest) return true;
      }
    }
  }
  return false;
}

function sameBoard(a: BoardState, b: BoardState): boolean {
  if (a.off.white !== b.off.white || a.off.black !== b.off.black) return false;
  return a.points.every((p, i) => p.white === b.points[i]?.white && p.black === b.points[i]?.black);
}

function boardAfter(board: BoardState, player: PlayerId, moves: readonly Move[]): BoardState {
  return moves.reduce((b, m) => applyMoveToBoard(b, player, m, 'parallel'), board);
}

interface Stats {
  turns: number;
  passes: number;
  blocks: number;
}

/** Plays one random game to the end and checks the invariants after every move. */
function playRandomGame(seed: number, rules: RuleSet, stats: Stats): void {
  const rng = createSeededRng(seed);
  const target = rules.movement.runnerTarget === 'passMother' ? 11 : 12;
  const p2: [number, number] = rules.primes.p2Window === '6-11' ? [6, 11] : [7, 12];
  let state = fevga.initialState({ startingPlayer: seed % 2 === 0 ? 'white' : 'black', rules });
  while (!fevga.isGameOver(state)) {
    const dice = rollDice(rng);
    const rolled = { ...state, dice };
    const turns = fevga.legalTurns(rolled, dice);
    check(turns.length > 0, seed, 'no legal turn');

    const player = state.toMove;
    const other = opponent(player);
    const length = turns[0]?.moves.length ?? 0;
    for (const turn of turns) {
      check(turn.player === player, seed, 'wrong player');
      // Every legal play uses the same number of dice.
      check(turn.moves.length === length, seed, 'plays of different lengths');
    }
    const turn = pick(rng, turns);
    if (turn.moves.length === 0) stats.passes += 1;

    // Play the turn one move at a time and check every middle position.
    let board = state.board;
    const otherPips = pips(board, other);
    let before = pips(board, player);
    for (const move of turn.moves) {
      check(move.capture === 'none', seed, 'Fevga has no hits or pins');
      board = applyMoveToBoard(board, player, move, 'parallel');
      checkBoard(board, seed);
      // Pip math: a move saves its die; a bear-off with a larger die saves less.
      const now = pips(board, player);
      const saved = before - now;
      if (move.to === 'off') check(saved === move.from && saved <= move.die, seed, 'bad bear-off');
      else check(saved === move.die, seed, `pips went down by ${saved}, not ${move.die}`);
      before = now;
    }
    check(pips(board, other) === otherPips, seed, 'the opponent moved');

    const next = fevga.applyTurn(rolled, turn);
    check(sameBoard(next.board, board), seed, 'applyTurn board differs');
    check(next.turnNumber === state.turnNumber + 1, seed, 'turnNumber did not go up by 1');
    check(next.toMove === other && next.dice === null, seed, 'turn did not pass');

    // No illegal prime at the end of the turn (P1, P2).
    const mine = counts(next.board, player);
    if (rules.primes.p1NoPrimeOwnStart) check(!holdsAll(mine, 19, 24), seed, 'P1 prime');
    if (rules.primes.p2NoPrimeFrontOfMother) check(!holdsAll(mine, p2[0], p2[1]), seed, 'P2 prime');
    // Runner rule: while it is on, at most one checker has left point 24.
    if (rules.movement.runnerRule && runnerOn(mine, target)) {
      check((mine[24] as number) >= 14, seed, 'a second checker left 24 too early');
    }
    // P3: a play that leaves the opponent no move is legal only if every play does.
    if (rules.primes.p3MustLeaveMove && !fevga.isGameOver(next)) {
      if (!hasSingleMove(next.board, other, rules)) {
        stats.blocks += 1;
        for (const t of turns) {
          const after = boardAfter(state.board, player, t.moves);
          check(!hasSingleMove(after, other, rules), seed, 'P3: another play leaves a move');
        }
      }
    }

    state = next;
    stats.turns += 1;
    if (state.turnNumber > MAX_TURNS) throw new Error(`game ${seed} did not end`);
  }
  const result = fevga.result(state);
  if (result === null || result.winner === null) throw new Error('game over without a winner');
  check(state.board.off[result.winner] === 15, seed, 'the winner did not bear off 15');
  const loserOff = state.board.off[opponent(result.winner)];
  check(result.points === (loserOff === 0 ? 2 : 1), seed, 'wrong points');
}

function run(games: number, overrides: RuleOverrides = {}): Stats {
  const rules = resolveRules('fevga', overrides);
  const stats: Stats = { turns: 0, passes: 0, blocks: 0 };
  for (let seed = 1; seed <= games; seed += 1) playRandomGame(seed, rules, stats);
  return stats;
}

describe('Fevga fuzz', () => {
  it('plays 2000 random games to the end with all invariants', { timeout: 120_000 }, () => {
    const stats = run(2000);
    // Random play gives long games and some passes.
    expect(stats.turns / 2000).toBeGreaterThan(40);
    expect(stats.passes).toBeGreaterThan(0);
  });

  it.each<[string, RuleOverrides]>([
    ['no runner rule', { movement: { runnerRule: false } }],
    ['runnerTarget reachQuarter', { movement: { runnerTarget: 'reachQuarter' } }],
    ['p2Window 7-12', { primes: { p2Window: '7-12' } }],
    ['p3Priority beforeDiceRule', { primes: { p3Priority: 'beforeDiceRule' } }],
    [
      'primeRulesOff',
      {
        primes: {
          primeRulesOff: true,
          p1NoPrimeOwnStart: false,
          p2NoPrimeFrontOfMother: false,
          p3MustLeaveMove: false,
        },
      },
    ],
    ['higherDieRule off', { movement: { higherDieRule: false } }],
  ])('plays 100 random games with %s', { timeout: 60_000 }, (_, overrides) => {
    expect(run(100, overrides).turns).toBeGreaterThan(100 * 40);
  });
});

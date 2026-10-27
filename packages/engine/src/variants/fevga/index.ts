/**
 * Fevga (Φεύγα): the running game. Rules: `docs/rules/fevga.md` and
 * `docs/rules/tavli-match.md`.
 *
 * The move search is in `moves.ts`. This file wires it to the `Variant`
 * interface: start position, legal turns, applying a turn and the result.
 */

import { createBoard } from '../../board';
import type { SideLayout } from '../../board';
import { CHECKERS_PER_PLAYER } from '../../constants';
import { diceMoves, isDieValue } from '../../dice';
import type { Dice, DieValue } from '../../dice';
import { EngineError } from '../../errors';
import type { Move, Turn } from '../../move';
import { PLAYERS, opponent } from '../../player';
import { getPreset } from '../../presets';
import type { RuleSet } from '../../rules';
import { validateRules } from '../../rules-validate';
import { GAME_STATE_SCHEMA_VERSION } from '../../state';
import type { GameState } from '../../state';
import type { GameResult, Variant } from '../../variant';
import { canFinish, fullPlayIsLegal, generatePlays, isLegalMove, playMove } from './moves';
import type { Generated, MoveOptions } from './moves';
import { PositionMap, fromBoard, toBoard } from './position';
import type { Opponent, Position } from './position';
import { checkFevgaRules } from './rules-check';

const DIRECTION = 'parallel';

/** `fevga.md`, "Starting position": all 15 on own point 24. */
export const FEVGA_START: SideLayout = { points: { 24: 15 } };

const optionsCache = new WeakMap<RuleSet, MoveOptions>();

/** The search options for `rules`. Throws if Fevga cannot play them. */
function moveOptions(rules: RuleSet): MoveOptions {
  const cached = optionsCache.get(rules);
  if (cached !== undefined) return cached;
  const { movement, primes } = checkFevgaRules(rules);
  const on = !primes.primeRulesOff;
  const bannedPrimes: (readonly [number, number])[] = [];
  // P1: own points 19–24 (the starting quarter).
  if (on && primes.p1NoPrimeOwnStart) bannedPrimes.push([19, 24]);
  // P2: the six points in front of the opponent's mother.
  if (on && primes.p2NoPrimeFrontOfMother) {
    bannedPrimes.push(primes.p2Window === '6-11' ? [6, 11] : [7, 12]);
  }
  const options: MoveOptions = {
    higherDieRule: movement.higherDieRule,
    runnerTarget: movement.runnerRule ? (movement.runnerTarget === 'passMother' ? 11 : 12) : null,
    bannedPrimes,
    leaveMove: on && primes.p3MustLeaveMove ? primes.p3Priority : 'off',
  };
  optionsCache.set(rules, options);
  return options;
}

function checkDice(dice: Dice): void {
  if (!isDieValue(dice[0]) || !isDieValue(dice[1])) {
    throw new EngineError('OUT_OF_RANGE', `bad dice ${JSON.stringify(dice)}`);
  }
}

function generate(state: GameState, dice: Dice): Generated {
  checkDice(dice);
  const options = moveOptions(state.rules);
  const { pos, opp } = fromBoard(state.board, state.toMove);
  return generatePlays(pos, opp, diceMoves(dice), options);
}

function result(state: GameState): GameResult | null {
  const { board } = state;
  for (const winner of PLAYERS) {
    if (board.off[winner] !== CHECKERS_PER_PLAYER) continue;
    // fevga.md, "Winning & scoring": single if the loser bore off ≥ 1, else double.
    const points = board.off[opponent(winner)] > 0 ? 1 : 2;
    return { winner, points, reason: 'borneOff' };
  }
  return null;
}

function illegal(message: string): never {
  throw new EngineError('ILLEGAL_TURN', message);
}

function sameDice(a: Dice, b: Dice): boolean {
  return (a[0] === b[0] && a[1] === b[1]) || (a[0] === b[1] && a[1] === b[0]);
}

function checkTurnStart(state: GameState, dice: Dice): void {
  if (result(state) !== null) illegal('the game is over');
  if (state.dice !== null && !sameDice(state.dice, dice)) {
    illegal(`the dice are ${state.dice.join('-')}, not ${dice.join('-')}`);
  }
}

/**
 * Plays `moves` one by one from `start` and checks each one where it is
 * played: the die is still in `left`, the move is legal, and `to` and
 * `capture` are right. Moves the used dice from `left` to `used`.
 * Throws `ILLEGAL_TURN`.
 */
function playEach(
  start: Position,
  opp: Opponent,
  left: DieValue[],
  used: DieValue[],
  moves: readonly Move[],
  options: MoveOptions,
): Position {
  let pos = start;
  moves.forEach((move, i) => {
    const at = left.indexOf(move.die);
    if (at < 0) illegal(`move ${i + 1} uses die ${move.die}, which is not left`);
    left.splice(at, 1);
    used.push(move.die);
    const from = move.from;
    if (typeof from !== 'number' || !isLegalMove(pos, opp, from, move.die, options)) {
      illegal(`move ${i + 1} is not legal`);
    }
    const played = playMove(pos, from, move.die);
    if (played.move.to !== move.to || move.capture !== 'none') {
      illegal(`move ${i + 1} should be to ${played.move.to}, with no capture`);
    }
    pos = played.next;
  });
  return pos;
}

function legalTurns(state: GameState, dice: Dice): readonly Turn[] {
  const player = state.toMove;
  if (result(state) !== null) illegal('the game is over');
  return generate(state, dice).plays.map((play) => ({ player, dice, moves: play.moves }));
}

function nextMoves(state: GameState, dice: Dice, played: readonly Move[]): readonly Move[] {
  checkTurnStart(state, dice);
  const legal = generate(state, dice);
  const options = moveOptions(state.rules);
  if (played.length > legal.diceUsed) illegal(`this roll can use only ${legal.diceUsed} dice`);
  const { pos: start, opp } = fromBoard(state.board, state.toMove);
  const left: DieValue[] = [...diceMoves(dice)];
  const used: DieValue[] = [];
  const pos = playEach(start, opp, left, used, played, options);
  const more = legal.diceUsed - played.length;
  const failed = new PositionMap<true>();
  if (!canFinish(pos, opp, left, used, more, legal, options, failed)) {
    illegal('these moves cannot be finished as a legal play');
  }
  if (more === 0) return [];

  const out: Move[] = [];
  for (let i = 0; i < left.length; i += 1) {
    const die = left[i] as DieValue;
    if (i > 0 && left[i - 1] === die) continue; // the same die gives the same moves
    const rest = left.filter((_, j) => j !== i);
    for (let from = 24; from >= 1; from -= 1) {
      if (!isLegalMove(pos, opp, from, die, options)) continue;
      const { next, move } = playMove(pos, from, die);
      if (canFinish(next, opp, rest, [...used, die], more - 1, legal, options, failed)) {
        out.push(move);
      }
    }
  }
  return out;
}

function applyTurn(state: GameState, turn: Turn): GameState {
  const player = state.toMove;
  if (turn.player !== player) illegal(`it is ${player}'s turn`);
  if (!isDieValue(turn.dice[0]) || !isDieValue(turn.dice[1])) illegal('bad dice');
  checkTurnStart(state, turn.dice);
  const options = moveOptions(state.rules);
  const { pos: start, opp } = fromBoard(state.board, player);

  // Play the moves one by one. Each one must be legal where it is played.
  const left: DieValue[] = [...diceMoves(turn.dice)];
  const used: DieValue[] = [];
  const pos = playEach(start, opp, left, used, turn.moves, options);

  // A turn that uses every die, ends outside P1 and P2 and leaves the
  // opponent a move is legal. Any other turn needs the full search.
  if (left.length > 0 || !fullPlayIsLegal(pos, opp, options)) {
    const legal = generate(state, turn.dice);
    if (turn.moves.length !== legal.diceUsed) {
      illegal(`this roll can use ${legal.diceUsed} dice, the turn uses ${turn.moves.length}`);
    }
    if (!legal.isLegal(pos, used)) {
      illegal('the turn breaks the higher die rule or a prime rule (P1, P2 or P3)');
    }
  }

  return {
    ...state,
    board: toBoard(pos, opp, player),
    toMove: opponent(player),
    dice: null,
    turnNumber: state.turnNumber + 1,
  };
}

export const fevga: Variant = {
  id: 'fevga',
  direction: DIRECTION,

  initialState({ startingPlayer, rules = getPreset('fevga') }) {
    const checked = checkFevgaRules(validateRules(rules));
    return {
      schemaVersion: GAME_STATE_SCHEMA_VERSION,
      variant: 'fevga',
      rules: checked,
      board: createBoard({ white: FEVGA_START, black: FEVGA_START }, DIRECTION),
      toMove: startingPlayer,
      dice: null,
      turnNumber: 1,
      variantData: null,
    };
  },

  legalTurns,
  nextMoves,
  applyTurn,

  isGameOver(state: GameState): boolean {
    return result(state) !== null;
  },

  result,
};

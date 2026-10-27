/**
 * Asodio (Ασόδυο): all 15 checkers start off the board. Rules:
 * `docs/rules/asodio.md` and `docs/rules/tavli-match.md`. The default is the
 * owner version, preset `asodio.kafeneio`:
 *
 * 1. Loading: the board stays locked until a 1-2 or a double; then every
 *    die enters one checker on spot `d` (own point `25 - d`). Entered
 *    checkers wait until all 15 are in.
 * 2. Quarter by quarter: a checker that enters a new quarter is frozen
 *    there until the whole army has caught up.
 * 3. Pins instead of hits, as in Plakoto. A pinned lagging checker freezes
 *    its whole army (A6): that player passes until it is free.
 * 4. Bearing off and scoring as in Portes (A4). No one can ever move again:
 *    a draw (A5).
 *
 * The flags of the Acey-Deucey presets work too: hits and the bar, any die
 * enters, a 1-2 gives a chosen double (`Variant.prompt`), and extra rolls
 * (`roll-chain.ts`). The move search is in `moves.ts`.
 */

import { createBoard } from '../../board';
import type { BoardState, SideLayout } from '../../board';
import { CHECKERS_PER_PLAYER } from '../../constants';
import { diceMoves, isDieValue } from '../../dice';
import type { Dice, DieValue } from '../../dice';
import { EngineError } from '../../errors';
import type { Move, Turn } from '../../move';
import { PLAYERS, opponent } from '../../player';
import type { PlayerId } from '../../player';
import { getPreset } from '../../presets';
import type { RuleSet } from '../../rules';
import { validateRules } from '../../rules-validate';
import { GAME_STATE_SCHEMA_VERSION } from '../../state';
import type { GameState } from '../../state';
import type { GameResult, Variant, VariantPrompt } from '../../variant';
import { finisher, generatePlays, hasAnyMove, isLegalMove, playMove, rollBlocked } from './moves';
import type { Generated, MoveOptions } from './moves';
import { BAR, OUTSIDE, fromBoard, toBoard } from './position';
import type { Position } from './position';
import {
  CHOOSE_DOUBLE_CHOICES,
  CHOOSE_DOUBLE_KIND,
  chainAfter,
  readChain,
  writeChain,
} from './roll-chain';
import { checkAsodioRules } from './rules-check';

const DIRECTION = 'contrary';

/** `asodio.md`, "Starting position": all 15 outside the board. */
export const ASODIO_START: SideLayout = { outside: CHECKERS_PER_PLAYER };

/** `startPosition: "allOnOwn24"` (the doc's `"opponentAcePoint"`): all 15 on own point 24. */
export const ASODIO_STACK_START: SideLayout = { points: { 24: CHECKERS_PER_PLAYER } };

const optionsCache = new WeakMap<RuleSet, MoveOptions>();

function optionsOf(rules: RuleSet): MoveOptions {
  const cached = optionsCache.get(rules);
  if (cached !== undefined) return cached;
  checkAsodioRules(rules);
  const { entry, quarters, bearOff } = rules;
  const options: MoveOptions = {
    higherDieRule: rules.movement.higherDieRule,
    pin: rules.capture.captureMode === 'pin',
    firstEntryGate: entry.firstEntryGate,
    gateDoubleOnly: entry.firstEntryGateRolls === 'doubleOnly',
    mustEnterAllFirst: entry.mustEnterAllFirst,
    moveWhileLoading: entry.moveWhileLoading,
    barEntryNeedsSpecial: entry.barEntryNeedsSpecial,
    quarterLock: quarters.quarterLock,
    moveInsideFrozenQuarter: quarters.moveInsideFrozenQuarter,
    exactBearOff: bearOff.exactBearOff,
    bearOffWhilePinned: bearOff.bearOffWhilePinned,
  };
  optionsCache.set(rules, options);
  return options;
}

function invalid(message: string, path: string): never {
  throw new EngineError('INVALID_STATE', message, path);
}

/** Throws `INVALID_STATE` when the board cannot happen under these rules. */
function checkBoard(board: BoardState, rules: RuleSet): void {
  const pin = rules.capture.captureMode === 'pin';
  for (const player of PLAYERS) {
    if (pin && board.bar[player] !== 0) {
      invalid('pinned checkers never go to the bar', `state.board.bar.${player}`);
    }
    if (rules.board.startPosition !== 'offBoard' && board.outside[player] !== 0) {
      invalid(
        'only startPosition "offBoard" has checkers outside',
        `state.board.outside.${player}`,
      );
    }
  }
  if (!pin) {
    const i = board.points.findIndex((p) => p.pinned !== null);
    if (i >= 0) invalid('captureMode "hit" has no pins', `state.board.points[${i}].pinned`);
  }
}

function positionOf(state: GameState, player: PlayerId): Position {
  checkBoard(state.board, state.rules);
  return fromBoard(state.board, player);
}

function illegal(message: string): never {
  throw new EngineError('ILLEGAL_TURN', message);
}

function illegalAction(message: string): never {
  throw new EngineError('ILLEGAL_ACTION', message);
}

function sameDice(a: Dice, b: Dice): boolean {
  return (a[0] === b[0] && a[1] === b[1]) || (a[0] === b[1] && a[1] === b[0]);
}

/** Points for a loser who bore off `off` checkers (`asodio.md`, "Winning & scoring"). */
function lossPoints(rules: RuleSet, off: number): number {
  switch (rules.scoring.method) {
    case 'perChecker':
      return CHECKERS_PER_PLAYER - off;
    case 'singleOnly':
      return 1;
    case 'tavli':
      return off > 0 ? 1 : 2;
  }
}

/**
 * `result` per state. States are never changed, so the answer never goes
 * stale. This keeps the deadlock scan (A5) off the hot path: `checkPlayable`
 * and `prompt` call `result` for every candidate turn.
 */
const RESULTS = new WeakMap<GameState, GameResult | null>();

function result(state: GameState): GameResult | null {
  const cached = RESULTS.get(state);
  if (cached !== undefined) return cached;
  const found = computeResult(state);
  RESULTS.set(state, found);
  return found;
}

function computeResult(state: GameState): GameResult | null {
  const { board, rules } = state;
  for (const winner of PLAYERS) {
    if (board.off[winner] !== CHECKERS_PER_PLAYER) continue;
    const points = lossPoints(rules, board.off[opponent(winner)]);
    return { winner, points, reason: 'borneOff' };
  }
  // A5: no one can ever move again (no single move with any die for either
  // player, so every roll passes and the board never changes): a draw.
  const options = optionsOf(rules);
  if (PLAYERS.every((player) => !hasAnyMove(positionOf(state, player), options))) {
    return { winner: null, points: 0, reason: 'deadlock' };
  }
  return null;
}

function prompt(state: GameState): VariantPrompt | null {
  if (readChain(state).kind !== 'choose' || result(state) !== null) return null;
  return { player: state.toMove, kind: CHOOSE_DOUBLE_KIND, choices: CHOOSE_DOUBLE_CHOICES };
}

/**
 * Throws when `dice` cannot be played now: the game is over, the double
 * must be chosen first, or the dice are not the roll (or the chosen double).
 */
function checkPlayable(state: GameState, dice: Dice): void {
  if (!isDieValue(dice[0]) || !isDieValue(dice[1])) {
    throw new EngineError('OUT_OF_RANGE', `bad dice ${JSON.stringify(dice)}`);
  }
  if (result(state) !== null) illegal('the game is over');
  const chain = readChain(state);
  if (chain.kind === 'choose') illegal('choose the double first');
  if (chain.kind === 'chosen' && (dice[0] !== chain.die || dice[1] !== chain.die)) {
    illegal(`the chosen double is ${chain.die}-${chain.die}`);
  }
  if (state.dice !== null && !sameDice(state.dice, dice)) {
    illegal(`the dice are ${state.dice.join('-')}, not ${dice.join('-')}`);
  }
}

function originNumber(move: Move): number | null {
  if (move.from === 'bar') return BAR;
  if (move.from === 'outside') return OUTSIDE;
  if (typeof move.from === 'number' && Number.isInteger(move.from)) return move.from;
  return null;
}

/**
 * Plays `moves` one by one from `start` and checks each one where it is
 * played: the die is still in `left`, the move is legal, and `to` and
 * `capture` are right. Removes the used dice from `left`. Throws
 * `ILLEGAL_TURN`.
 */
function playEach(
  start: Position,
  left: DieValue[],
  moves: readonly Move[],
  options: MoveOptions,
): Position {
  let pos = start;
  moves.forEach((move, i) => {
    const at = left.indexOf(move.die);
    if (at < 0) illegal(`move ${i + 1} uses die ${move.die}, which is not left`);
    left.splice(at, 1);
    const from = originNumber(move);
    if (from === null || !isLegalMove(pos, from, move.die, options)) {
      illegal(`move ${i + 1} is not legal`);
    }
    const played = playMove(pos, from, move.die, options);
    if (played.move.to !== move.to || played.move.capture !== move.capture) {
      illegal(`move ${i + 1} should be to ${played.move.to} (${played.move.capture})`);
    }
    pos = played.next;
  });
  return pos;
}

function generate(state: GameState, dice: Dice): Generated {
  return generatePlays(positionOf(state, state.toMove), diceMoves(dice), optionsOf(state.rules));
}

function legalTurns(state: GameState, dice: Dice): readonly Turn[] {
  checkPlayable(state, dice);
  const player = state.toMove;
  return generate(state, dice).plays.map((play) => ({ player, dice, moves: play.moves }));
}

function nextMoves(state: GameState, dice: Dice, played: readonly Move[]): readonly Move[] {
  checkPlayable(state, dice);
  const options = optionsOf(state.rules);
  const start = positionOf(state, state.toMove);
  const legal = generatePlays(start, diceMoves(dice), options);
  if (played.length > legal.diceUsed) illegal(`this roll can use only ${legal.diceUsed} dice`);
  if (legal.mustUseHighDie && played.length > 0 && played[0]?.die !== legal.highDie) {
    illegal(`only one die can be played, so it must be the higher die (${legal.highDie})`);
  }
  const left: DieValue[] = [...diceMoves(dice)];
  const pos = playEach(start, left, played, options);
  const more = legal.diceUsed - played.length;
  const finish = finisher(legal, options);
  if (!finish(pos, left, more)) illegal('these moves cannot be finished as a legal play');
  if (more === 0) return [];

  const out: Move[] = [];
  for (let i = 0; i < left.length; i += 1) {
    const die = left[i] as DieValue;
    if (i > 0 && left[i - 1] === die) continue; // the same die gives the same moves
    if (legal.mustUseHighDie && die !== legal.highDie) continue;
    const rest = left.filter((_, j) => j !== i);
    for (let from = BAR; from >= 1; from -= 1) {
      if (!isLegalMove(pos, from, die, options)) continue;
      const { next, move } = playMove(pos, from, die, options);
      if (finish(next, rest, more - 1)) out.push(move);
    }
  }
  return out;
}

function applyTurn(state: GameState, turn: Turn): GameState {
  const player = state.toMove;
  if (turn.player !== player) illegal(`it is ${player}'s turn`);
  checkPlayable(state, turn.dice);
  const options = optionsOf(state.rules);
  const dice = diceMoves(turn.dice);
  const start = positionOf(state, player);
  if (turn.moves.length > 0 && rollBlocked(start, dice, options)) {
    illegal(`the roll ${turn.dice.join('-')} cannot move any checker now`);
  }
  const left: DieValue[] = [...dice];
  const pos = playEach(start, left, turn.moves, options);

  // A turn that uses every die, each move legal in turn, is a legal play.
  // A shorter turn is legal only if no play uses more dice (and the higher
  // die rule holds), so only then we run the full search.
  if (turn.moves.length < dice.length) {
    const legal = generatePlays(start, dice, options);
    if (turn.moves.length !== legal.diceUsed) {
      illegal(`this roll can use ${legal.diceUsed} dice, the turn uses ${turn.moves.length}`);
    }
    if (legal.mustUseHighDie && turn.moves[0]?.die !== legal.highDie) {
      illegal(`only one die can be played, so it must be the higher die (${legal.highDie})`);
    }
    if (!legal.isFinal(pos)) illegal('the turn does not end in a legal position');
  }

  const next: GameState = {
    ...state,
    board: toBoard(pos, player, state.board),
    toMove: opponent(player),
    dice: null,
    turnNumber: state.turnNumber + 1,
    variantData: null,
  };
  if (result(next) !== null) return next;
  // asodio.md "Turn & dice rules" 3–5: the same player may roll again.
  const chain = chainAfter(state.rules, readChain(state), turn.dice, turn.moves.length);
  if (chain === 'next') return next;
  return { ...next, toMove: player, variantData: writeChain(chain) };
}

/** The answer to `chooseDouble`: the dice become the chosen double, ready to play. */
function answerPrompt(state: GameState, player: PlayerId, choice: string): GameState {
  const question = prompt(state);
  if (question === null) illegalAction('there is no question to answer');
  if (player !== question.player) illegalAction(`${question.player} must answer`);
  if (!question.choices.includes(choice)) {
    illegalAction(`answer one of ${question.choices.join(', ')}`);
  }
  const die = Number(choice) as DieValue;
  return { ...state, dice: [die, die], variantData: { chosenDouble: die } };
}

export const asodio: Variant = {
  id: 'asodio',
  direction: DIRECTION,

  initialState({ startingPlayer, rules = getPreset('asodio.kafeneio') }) {
    const checked = checkAsodioRules(validateRules(rules));
    const side = checked.board.startPosition === 'offBoard' ? ASODIO_START : ASODIO_STACK_START;
    return {
      schemaVersion: GAME_STATE_SCHEMA_VERSION,
      variant: 'asodio',
      rules: checked,
      board: createBoard({ white: side, black: side }, DIRECTION),
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
  prompt,
  answerPrompt,
};

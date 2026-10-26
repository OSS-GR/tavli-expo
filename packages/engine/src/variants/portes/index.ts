/**
 * Portes (Πόρτες): the Greek form of backgammon. Rules:
 * `docs/rules/portes.md` and `docs/rules/tavli-match.md`.
 *
 * The move search is in `moves.ts`. This file wires it to the `Variant`
 * interface: start position, legal turns, applying a turn and the result.
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
import { validateRules } from '../../rules-validate';
import { GAME_STATE_SCHEMA_VERSION } from '../../state';
import type { GameState } from '../../state';
import type { GameResult, Variant } from '../../variant';
import { generatePlays, isLegalMove, playMove } from './moves';
import type { Generated, MoveOptions } from './moves';
import { BAR, fromBoard, toBoard } from './position';
import { checkPortesRules } from './rules-check';

const DIRECTION = 'contrary';

/** `portes.md`, "Starting position": 2/5/3/5 on own 24/13/8/6. */
export const PORTES_START: SideLayout = { points: { 24: 2, 13: 5, 8: 3, 6: 5 } };

function moveOptions(state: GameState): MoveOptions {
  const rules = checkPortesRules(state.rules);
  return {
    higherDieRule: rules.movement.higherDieRule,
    noHitAndRunInHome: rules.capture.noHitAndRunInHome,
  };
}

function generate(state: GameState, dice: Dice): Generated {
  if (!isDieValue(dice[0]) || !isDieValue(dice[1])) {
    throw new EngineError('OUT_OF_RANGE', `bad dice ${JSON.stringify(dice)}`);
  }
  const options = moveOptions(state);
  return generatePlays(fromBoard(state.board, state.toMove), diceMoves(dice), options);
}

function result(state: GameState): GameResult | null {
  const { board } = state;
  for (const winner of PLAYERS) {
    if (board.off[winner] !== CHECKERS_PER_PLAYER) continue;
    const loser = opponent(winner);
    // Mono (μονό): the loser has borne off at least one checker.
    if (board.off[loser] > 0) return { winner, points: 1, reason: 'borneOff' };
    // Diplo (διπλό / μαρς). A "backgammon" also counts 2, unless backgammonScores3.
    const points = state.rules.scoring.backgammonScores3 && isBackgammon(board, loser) ? 3 : 2;
    return { winner, points, reason: 'borneOff' };
  }
  return null;
}

/** The loser has a checker on the bar or in the winner's home (loser's own 19–24). */
function isBackgammon(board: BoardState, loser: PlayerId): boolean {
  if (board.bar[loser] > 0) return true;
  const pos = fromBoard(board, loser);
  for (let p = 19; p <= 24; p += 1) if ((pos[p] as number) > 0) return true;
  return false;
}

function legalTurns(state: GameState, dice: Dice): readonly Turn[] {
  const player = state.toMove;
  if (result(state) !== null) illegal('the game is over');
  return generate(state, dice).plays.map((play) => ({ player, dice, moves: play.moves }));
}

function sameDice(a: Dice, b: Dice): boolean {
  return (a[0] === b[0] && a[1] === b[1]) || (a[0] === b[1] && a[1] === b[0]);
}

function illegal(message: string): never {
  throw new EngineError('ILLEGAL_TURN', message);
}

function originNumber(move: Move): number | null {
  if (move.from === 'bar') return BAR;
  if (typeof move.from === 'number' && Number.isInteger(move.from)) return move.from;
  return null;
}

function applyTurn(state: GameState, turn: Turn): GameState {
  const player = state.toMove;
  if (result(state) !== null) illegal('the game is over');
  if (turn.player !== player) illegal(`it is ${player}'s turn`);
  if (!isDieValue(turn.dice[0]) || !isDieValue(turn.dice[1])) illegal('bad dice');
  if (state.dice !== null && !sameDice(state.dice, turn.dice)) {
    illegal(`the dice are ${state.dice.join('-')}, not ${turn.dice.join('-')}`);
  }
  const options = moveOptions(state);
  const dice = diceMoves(turn.dice);

  // Play the moves one by one. Each one must be legal where it is played.
  const left: DieValue[] = [...dice];
  let pos = fromBoard(state.board, player);
  turn.moves.forEach((move, i) => {
    const at = left.indexOf(move.die);
    if (at < 0) illegal(`move ${i + 1} uses die ${move.die}, which is not left`);
    left.splice(at, 1);
    const from = originNumber(move);
    if (from === null || !isLegalMove(pos, from, move.die)) illegal(`move ${i + 1} is not legal`);
    const played = playMove(pos, from, move.die, options);
    if (played.move.to !== move.to || played.move.capture !== move.capture) {
      illegal(`move ${i + 1} should be to ${played.move.to} (${played.move.capture})`);
    }
    pos = played.next;
  });

  // A turn that uses every die, each move legal in turn, is a legal play.
  // A shorter turn is legal only if no play uses more dice (and the higher
  // die rule holds), so only then we run the full search.
  if (turn.moves.length < dice.length) {
    const legal = generate(state, turn.dice);
    if (turn.moves.length !== legal.diceUsed) {
      illegal(`this roll can use ${legal.diceUsed} dice, the turn uses ${turn.moves.length}`);
    }
    if (legal.mustUseHighDie && turn.moves[0]?.die !== legal.highDie) {
      illegal(`only one die can be played, so it must be the higher die (${legal.highDie})`);
    }
    if (!legal.isFinal(pos)) illegal('the turn does not end in a legal position');
  }

  return {
    ...state,
    board: toBoard(pos, player, state.board.off[opponent(player)]),
    toMove: opponent(player),
    dice: null,
    turnNumber: state.turnNumber + 1,
  };
}

export const portes: Variant = {
  id: 'portes',
  direction: DIRECTION,

  initialState({ startingPlayer, rules = getPreset('portes') }) {
    const checked = checkPortesRules(validateRules(rules));
    return {
      schemaVersion: GAME_STATE_SCHEMA_VERSION,
      variant: 'portes',
      rules: checked,
      board: createBoard({ white: PORTES_START, black: PORTES_START }, DIRECTION),
      toMove: startingPlayer,
      dice: null,
      turnNumber: 1,
      variantData: null,
    };
  },

  legalTurns,
  applyTurn,

  isGameOver(state: GameState): boolean {
    return result(state) !== null;
  },

  result,
};

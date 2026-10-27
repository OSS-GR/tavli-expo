/**
 * Plakoto (Πλακωτό): checkers are pinned, not hit. Rules:
 * `docs/rules/plakoto.md` and `docs/rules/tavli-match.md`.
 *
 * The move search is in `moves.ts` and the mother rule in `mother.ts`. This
 * file wires them to the `Variant` interface.
 *
 * Mother rule timing (`motherCheckTiming`):
 *
 * - `"endOfTurn"`: the board is checked when the turn is over.
 * - `"afterEachMove"`: the board is checked after every single move. If the
 *   game ends (federation or instant double, or a draw), the turn stops
 *   there and the rest of the roll is not played. A move must still be part
 *   of a play that the normal rules allow ("use as much of the roll as
 *   possible"); the mother rule only cuts that play short.
 * - `motherRule: "offerConcede"` asks its question when the turn is over,
 *   also with `"afterEachMove"`: the turn flow asks only between turns. The answer
 *   cannot change the rest of the turn, so the outcome is the same. With
 *   `"afterEachMove"` a mother that was pinned after any move of the turn
 *   is asked about, even if the pin ended later in the same turn.
 */

import { createBoard } from '../../board';
import type { SideLayout } from '../../board';
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
import {
  MOTHER_PROMPT_CHOICES,
  MOTHER_PROMPT_KIND,
  midTurnEnd,
  motherResult,
  opponentMotherPinned,
  readMotherData,
  writeMotherData,
} from './mother';
import type { MidTurnEnd } from './mother';
import { diceTag, finisher, generatePlays, isLegalMove, normal, playMove } from './moves';
import type { Generated, MoveOptions, Play } from './moves';
import { PositionMap, fromBoard, toBoard } from './position';
import type { Position } from './position';
import { checkPlakotoRules } from './rules-check';

const DIRECTION = 'contrary';

/** `plakoto.md`, "Starting position": all 15 on own point 24. */
export const PLAKOTO_START: SideLayout = { points: { 24: 15 } };

interface Setup {
  readonly options: MoveOptions;
  /** The mid-turn end test (`motherCheckTiming: "afterEachMove"`), or `null`. */
  readonly end: MidTurnEnd | null;
}

const setups = new WeakMap<RuleSet, Setup>();

function setupOf(rules: RuleSet): Setup {
  const cached = setups.get(rules);
  if (cached !== undefined) return cached;
  checkPlakotoRules(rules);
  const setup: Setup = {
    options: {
      higherDieRule: rules.movement.higherDieRule,
      intermediatePinBlocks: rules.capture.intermediatePinBlocks,
      bearOffWhilePinned: rules.bearOff.bearOffWhilePinned,
    },
    end: midTurnEnd(rules.mother),
  };
  setups.set(rules, setup);
  return setup;
}

function illegal(message: string): never {
  throw new EngineError('ILLEGAL_TURN', message);
}

function illegalAction(message: string): never {
  throw new EngineError('ILLEGAL_ACTION', message);
}

function checkDice(dice: Dice): void {
  if (!isDieValue(dice[0]) || !isDieValue(dice[1])) {
    throw new EngineError('OUT_OF_RANGE', `bad dice ${JSON.stringify(dice)}`);
  }
}

function sameDice(a: Dice, b: Dice): boolean {
  return (a[0] === b[0] && a[1] === b[1]) || (a[0] === b[1] && a[1] === b[0]);
}

function result(state: GameState): GameResult | null {
  const { board } = state;
  const data = readMotherData(state);
  // offerConcede: the pinned player chose "resign".
  if (data.conceded !== null) {
    return { winner: opponent(data.conceded), points: 2, reason: 'resigned' };
  }
  const mother = motherResult(board, state.rules.mother);
  if (mother !== null) return mother;
  for (const winner of PLAYERS) {
    if (board.off[winner] !== CHECKERS_PER_PLAYER) continue;
    // Single 1 point, or double 2 when the loser has borne off none.
    const points = board.off[opponent(winner)] > 0 ? 1 : 2;
    return { winner, points, reason: 'borneOff' };
  }
  return null;
}

function prompt(state: GameState): VariantPrompt | null {
  const { offer } = readMotherData(state);
  if (offer === null || result(state) !== null) return null;
  return { player: offer, kind: MOTHER_PROMPT_KIND, choices: MOTHER_PROMPT_CHOICES };
}

/** Throws when no turn can be played: the game is over, or a question waits for its answer. */
function checkPlayable(state: GameState): void {
  if (result(state) !== null) illegal('the game is over');
  if (readMotherData(state).offer !== null) illegal('answer the mother question first');
}

interface Walk {
  readonly pos: Position;
  /** The game ended by the mother rule after the last move. */
  readonly ended: boolean;
  /** The opponent's mother was pinned after one of the moves. */
  readonly pinnedMother: boolean;
}

/**
 * Plays `moves` one by one from `start` and checks each one where it is
 * played: the die is still in `left`, the move is legal, and `to` and
 * `capture` are right. Removes the used dice from `left`. A move after the
 * game ended (mid-turn mother rule) is illegal. Throws `ILLEGAL_TURN`.
 */
function playEach(start: Position, left: DieValue[], moves: readonly Move[], setup: Setup): Walk {
  let pos = start;
  let ended = false;
  // A mother that was already pinned at the start counts too (it is pinned during the turn).
  let pinnedMother = opponentMotherPinned(start);
  moves.forEach((move, i) => {
    if (ended) illegal(`the game ended after move ${i}`);
    const at = left.indexOf(move.die);
    if (at < 0) illegal(`move ${i + 1} uses die ${move.die}, which is not left`);
    left.splice(at, 1);
    const from = move.from;
    if (typeof from !== 'number' || !isLegalMove(pos, from, move.die, setup.options)) {
      illegal(`move ${i + 1} is not legal`);
    }
    const played = playMove(pos, from, move.die, setup.options);
    if (played.move.to !== move.to || played.move.capture !== move.capture) {
      illegal(`move ${i + 1} should be to ${played.move.to} (${played.move.capture})`);
    }
    pos = played.next;
    if (opponentMotherPinned(pos)) pinnedMother = true;
    if (setup.end?.ended(pos) === true) ended = true;
  });
  return { pos, ended, pinnedMother };
}

function generate(start: Position, dice: Dice, setup: Setup): Generated {
  checkDice(dice);
  return generatePlays(start, diceMoves(dice), setup.options);
}

/**
 * The legal plays when the game can end in the middle of this turn. Every
 * order of moves is tried. A play stops at the move that ends the game, if
 * the moves so far can still be finished as a normal legal play.
 */
function endingPlays(start: Position, dice: readonly DieValue[], legal: Generated, setup: Setup) {
  const { options } = setup;
  const ended = (setup.end as MidTurnEnd).ended;
  const out: Play[] = [];
  const finals = new PositionMap<true>();
  const seen = new PositionMap<true>();
  const reach = finisher(legal, options);
  const add = (moves: readonly Move[], final: Position): void => {
    if (finals.get(normal(final)) !== undefined) return;
    finals.set(normal(final), true);
    out.push({ moves, final });
  };
  const explore = (pos: Position, left: readonly DieValue[], path: readonly Move[]): void => {
    const more = legal.diceUsed - path.length;
    for (let i = 0; i < left.length; i += 1) {
      const die = left[i] as DieValue;
      if (i > 0 && left[i - 1] === die) continue;
      if (path.length === 0 && legal.mustUseHighDie && die !== legal.highDie) continue;
      const rest = left.filter((_, j) => j !== i);
      for (let from = 24; from >= 1; from -= 1) {
        if (!isLegalMove(pos, from, die, options)) continue;
        const { next, move } = playMove(pos, from, die, options);
        if (!reach(next, rest, more - 1)) continue;
        const moves = [...path, move];
        if (ended(next) || more === 1) {
          add(moves, next);
          continue;
        }
        const tag = diceTag(rest);
        if (seen.get(next, tag) !== undefined) continue;
        seen.set(next, true, tag);
        explore(next, rest, moves);
      }
    }
  };
  if (legal.diceUsed === 0) return legal.plays;
  explore(start, dice, []);
  return out;
}

function legalTurns(state: GameState, dice: Dice): readonly Turn[] {
  checkPlayable(state);
  const setup = setupOf(state.rules);
  const player = state.toMove;
  const start = fromBoard(state.board, player);
  const legal = generate(start, dice, setup);
  const plays =
    setup.end !== null && setup.end.possible(start, diceMoves(dice))
      ? endingPlays(start, diceMoves(dice), legal, setup)
      : legal.plays;
  return plays.map((play) => ({ player, dice, moves: play.moves }));
}

function nextMoves(state: GameState, dice: Dice, played: readonly Move[]): readonly Move[] {
  checkPlayable(state);
  if (state.dice !== null && !sameDice(state.dice, dice)) {
    illegal(`the dice are ${state.dice.join('-')}, not ${dice.join('-')}`);
  }
  const setup = setupOf(state.rules);
  const { options } = setup;
  const start = fromBoard(state.board, state.toMove);
  const legal = generate(start, dice, setup);
  if (played.length > legal.diceUsed) illegal(`this roll can use only ${legal.diceUsed} dice`);
  if (legal.mustUseHighDie && played.length > 0 && played[0]?.die !== legal.highDie) {
    illegal(`only one die can be played, so it must be the higher die (${legal.highDie})`);
  }
  const left: DieValue[] = [...diceMoves(dice)];
  const walk = playEach(start, left, played, setup);
  const more = legal.diceUsed - played.length;
  const finish = finisher(legal, options);
  if (!finish(walk.pos, left, more)) {
    illegal('these moves cannot be finished as a legal play');
  }
  if (walk.ended || more === 0) return [];

  const out: Move[] = [];
  for (let i = 0; i < left.length; i += 1) {
    const die = left[i] as DieValue;
    if (i > 0 && left[i - 1] === die) continue;
    if (legal.mustUseHighDie && die !== legal.highDie) continue;
    const rest = left.filter((_, j) => j !== i);
    for (let from = 24; from >= 1; from -= 1) {
      if (!isLegalMove(walk.pos, from, die, options)) continue;
      const { next, move } = playMove(walk.pos, from, die, options);
      if (finish(next, rest, more - 1)) out.push(move);
    }
  }
  return out;
}

function applyTurn(state: GameState, turn: Turn): GameState {
  const player = state.toMove;
  checkPlayable(state);
  if (turn.player !== player) illegal(`it is ${player}'s turn`);
  if (!isDieValue(turn.dice[0]) || !isDieValue(turn.dice[1])) illegal('bad dice');
  if (state.dice !== null && !sameDice(state.dice, turn.dice)) {
    illegal(`the dice are ${state.dice.join('-')}, not ${turn.dice.join('-')}`);
  }
  const setup = setupOf(state.rules);
  const dice = diceMoves(turn.dice);
  const left: DieValue[] = [...dice];
  const start = fromBoard(state.board, player);
  const walk = playEach(start, left, turn.moves, setup);

  // A turn that uses every die, each move legal in turn, is a legal play.
  // A shorter turn needs the full search: it must use the most dice and the
  // higher die, or (when the game ended mid-turn) be the start of such a play.
  if (turn.moves.length < dice.length) {
    const legal = generate(start, turn.dice, setup);
    if (turn.moves.length > legal.diceUsed)
      illegal(`this roll can use only ${legal.diceUsed} dice`);
    if (!walk.ended && turn.moves.length !== legal.diceUsed) {
      illegal(`this roll can use ${legal.diceUsed} dice, the turn uses ${turn.moves.length}`);
    }
    if (legal.mustUseHighDie && turn.moves[0]?.die !== legal.highDie) {
      illegal(`only one die can be played, so it must be the higher die (${legal.highDie})`);
    }
    const more = legal.diceUsed - turn.moves.length;
    if (!finisher(legal, setup.options)(walk.pos, left, more)) {
      illegal('the turn does not end in a legal position');
    }
  }

  const other = opponent(player);
  const next: GameState = {
    ...state,
    board: toBoard(walk.pos, player, state.board.off[other]),
    toMove: other,
    dice: null,
    turnNumber: state.turnNumber + 1,
  };
  return { ...next, variantData: writeMotherData(afterTurnData(state, next, walk)) };
}

/** offerConcede: after the turn, ask the opponent if their mother was pinned. */
function afterTurnData(before: GameState, after: GameState, walk: Walk) {
  const data = readMotherData(before);
  const { motherRule, motherCheckTiming } = before.rules.mother;
  const other = after.toMove;
  if (motherRule !== 'offerConcede' || data.playOn.includes(other)) return data;
  if (motherResult(after.board, after.rules.mother) !== null) return data;
  const pinned =
    motherCheckTiming === 'afterEachMove' ? walk.pinnedMother : opponentMotherPinned(walk.pos);
  return pinned ? { ...data, offer: other } : data;
}

function answerPrompt(state: GameState, player: PlayerId, choice: string): GameState {
  const question = prompt(state);
  if (question === null) illegalAction('there is no question to answer');
  if (player !== question.player) illegalAction(`${question.player} must answer`);
  const data = readMotherData(state);
  if (choice === 'resign') {
    return { ...state, variantData: writeMotherData({ ...data, offer: null, conceded: player }) };
  }
  if (choice === 'playOn') {
    const playOn = [...data.playOn, player];
    return { ...state, variantData: writeMotherData({ ...data, offer: null, playOn }) };
  }
  return illegalAction(`answer one of ${question.choices.join(', ')}`);
}

export const plakoto: Variant = {
  id: 'plakoto',
  direction: DIRECTION,

  initialState({ startingPlayer, rules = getPreset('plakoto') }) {
    const checked = checkPlakotoRules(validateRules(rules));
    return {
      schemaVersion: GAME_STATE_SCHEMA_VERSION,
      variant: 'plakoto',
      rules: checked,
      board: createBoard({ white: PLAKOTO_START, black: PLAKOTO_START }, DIRECTION),
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

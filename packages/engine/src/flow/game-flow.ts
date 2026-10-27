/**
 * The turn flow of one game (#25): a pure reducer, no XState.
 *
 * Phases:
 *
 * ```
 * opening-roll → awaiting-roll → moving → awaiting-confirm → awaiting-roll … → game-over
 *                      ↑ (useOpeningDice: opening-roll → moving)
 * ```
 *
 * - `opening-roll`: each player rolls one die; a tie is rolled again
 *   (`tavli-match.md`, "Who starts the first game"). With
 *   `openingRoll: "chosenStarterRolls"` the players pick the starter instead.
 * - `awaiting-roll`: the player to move rolls.
 * - `moving`: the player plays single moves. Only moves that keep the turn
 *   finishable are allowed (`Variant.nextMoves`). `undo` takes one back.
 * - `awaiting-confirm`: the moves form a full legal play. `confirm` ends
 *   the turn; `undo` goes back to `moving`.
 * - `awaiting-answer`: the variant asks a question (`Variant.prompt`), for
 *   example Plakoto "resign or play on" or the Asodio chosen double. Not
 *   used by Portes. When the answer sets `state.dice` (the chosen double),
 *   the next turn starts with those dice (`moving`), with no roll.
 * - A variant may give the same player another roll: the flow reads the
 *   player to move from the state that `applyTurn` returns (Asodio extra
 *   rolls).
 * - `game-over`: `result` holds the winner and the points.
 *
 * A roll with no legal move passes by itself: the flow plays the empty turn
 * and goes to the other player. `lastTurn` keeps the dice of the pass, so
 * the UI can show them (`tavli-match.md` #13).
 *
 * `GameFlow` is plain JSON. It never stores what it can compute: the board
 * in the middle of a turn, the legal next moves and the dice left come from
 * the helpers at the end of this file.
 */

import { applyMoveToBoard } from '../board';
import type { BoardState } from '../board';
import { diceMoves, isDieValue, rollDice, rollDie } from '../dice';
import type { Dice, DieValue } from '../dice';
import { EngineError } from '../errors';
import { resignGame } from '../match';
import type { Capture, Destination, Move, Origin, Turn } from '../move';
import { isPlayerId } from '../player';
import type { PlayerId } from '../player';
import type { Rng } from '../rng';
import type { GameState } from '../state';
import { getVariant } from '../variant';
import type { GameResult, Variant, VariantPrompt, VariantRegistry } from '../variant';
import { VARIANT_REGISTRY } from '../variants';

export type GamePhase =
  | 'opening-roll'
  | 'awaiting-roll'
  | 'moving'
  | 'awaiting-confirm'
  | 'awaiting-answer'
  | 'game-over';

/** The opening roll of a game. */
export interface OpeningRoll {
  /** Each player's die in the current round, `null` until rolled. */
  readonly white: DieValue | null;
  readonly black: DieValue | null;
  /** Earlier rounds that were ties (both rolled this value), oldest first. */
  readonly ties: readonly DieValue[];
}

export interface GameFlow {
  readonly phase: GamePhase;
  /**
   * The state at the start of the current turn. While a player moves,
   * `state.dice` is the roll and the moves are in `played`. During the
   * opening roll `state.toMove` is only a placeholder (`'white'`).
   */
  readonly state: GameState;
  /** Who started the game. `null` until the opening roll decides it. */
  readonly starter: PlayerId | null;
  /**
   * The opening roll, or `null` when the game started without one (a set
   * starter, or `chosenStarterRolls`).
   */
  readonly opening: OpeningRoll | null;
  /** The moves played so far this turn. Not final until `confirm`. */
  readonly played: readonly Move[];
  /** The last finished turn, a pass too. `null` before the first one. */
  readonly lastTurn: Turn | null;
  /** The result once the phase is `game-over`, else `null`. */
  readonly result: GameResult | null;
}

/** A move as the UI sends it. `capture` is optional; the flow fills it in. */
export interface MoveInput {
  readonly from: Origin;
  readonly to: Destination;
  readonly die: DieValue;
  readonly capture?: Capture;
}

/**
 * The actions of one game. `player` is the player who acts (for
 * `chooseStarter`: the player who will start).
 *
 * The dice fields are optional. Leave them out and the flow rolls with the
 * `Rng` in the context. Fill them in to play dice that were rolled
 * somewhere else (the server, a replay). The event log always has them.
 */
export type GameAction =
  | { readonly type: 'rollOpening'; readonly player: PlayerId; readonly die?: DieValue }
  | { readonly type: 'chooseStarter'; readonly player: PlayerId }
  | { readonly type: 'roll'; readonly player: PlayerId; readonly dice?: Dice }
  | {
      readonly type: 'move';
      readonly player: PlayerId;
      readonly move: MoveInput;
      /** Confirm the turn by itself as soon as it is complete (app setting, default off). */
      readonly autoConfirm?: boolean;
    }
  | { readonly type: 'undo'; readonly player: PlayerId }
  | { readonly type: 'confirm'; readonly player: PlayerId }
  | { readonly type: 'answer'; readonly player: PlayerId; readonly choice: string }
  | { readonly type: 'resign'; readonly player: PlayerId };

export interface FlowContext {
  /** Where the variants come from. Default: `VARIANT_REGISTRY`. */
  readonly registry?: VariantRegistry;
  /** Rolls dice for actions without dice. Never `Math.random`. */
  readonly rng?: Rng;
}

function illegal(message: string): never {
  throw new EngineError('ILLEGAL_ACTION', message);
}

function variantOf(flow: GameFlow, ctx: FlowContext): Variant {
  return getVariant(ctx.registry ?? VARIANT_REGISTRY, flow.state.variant);
}

export interface CreateGameFlowOptions {
  /** The start state of the game, from `Variant.initialState`. */
  readonly state: GameState;
  /** Who starts. `null`: an opening roll (or a choice) decides. */
  readonly starter: PlayerId | null;
}

/** Starts the flow of one game. */
export function createGameFlow({ state, starter }: CreateGameFlowOptions): GameFlow {
  if (starter === null) {
    const chosen = state.rules.match.openingRoll === 'chosenStarterRolls';
    return {
      phase: 'opening-roll',
      state: { ...state, toMove: 'white', dice: null },
      starter: null,
      opening: chosen ? null : { white: null, black: null, ties: [] },
      played: [],
      lastTurn: null,
      result: null,
    };
  }
  if (!isPlayerId(starter)) illegal(`bad starter ${JSON.stringify(starter)}`);
  return {
    phase: 'awaiting-roll',
    state: { ...state, toMove: starter, dice: null },
    starter,
    opening: null,
    played: [],
    lastTurn: null,
    result: null,
  };
}

// ---------------------------------------------------------------------------
// Steps

/** After a turn or an answer: game over, a question, or the next roll. */
function settle(flow: GameFlow, state: GameState, variant: Variant): GameFlow {
  const result = variant.result(state);
  if (result !== null) return { ...flow, state, played: [], phase: 'game-over', result };
  const prompt = variant.prompt?.(state) ?? null;
  return {
    ...flow,
    state,
    played: [],
    phase: prompt === null ? 'awaiting-roll' : 'awaiting-answer',
  };
}

/** Plays `moves` as the full turn of the player to move. */
function finishTurn(flow: GameFlow, moves: readonly Move[], variant: Variant): GameFlow {
  const { state } = flow;
  if (state.dice === null) throw new EngineError('INVALID_STATE', 'no dice in the turn');
  const turn: Turn = { player: state.toMove, dice: state.dice, moves };
  const next = variant.applyTurn(state, turn);
  return settle({ ...flow, lastTurn: turn }, next, variant);
}

/** The player to move has `dice`. A roll with no legal move passes at once. */
function beginTurn(flow: GameFlow, dice: Dice, variant: Variant): GameFlow {
  const state = { ...flow.state, dice };
  const rolled = { ...flow, state, played: [] };
  const turns = variant.legalTurns(state, dice);
  if (turns.length === 1 && turns[0]?.moves.length === 0) return finishTurn(rolled, [], variant);
  return { ...rolled, phase: 'moving' };
}

function checkPlayer(value: unknown): PlayerId {
  if (!isPlayerId(value)) illegal(`bad player ${JSON.stringify(value)}`);
  return value;
}

function checkDice(value: unknown): Dice {
  if (!Array.isArray(value) || value.length !== 2 || !value.every(isDieValue)) {
    illegal(`bad dice ${JSON.stringify(value)}`);
  }
  return [value[0] as DieValue, value[1] as DieValue];
}

function needRng(ctx: FlowContext): Rng {
  if (ctx.rng === undefined) illegal('no dice given and no rng in the context');
  return ctx.rng;
}

function onTurn(flow: GameFlow, player: PlayerId, phases: readonly GamePhase[]): void {
  if (!phases.includes(flow.phase)) illegal(`not allowed in phase ${flow.phase}`);
  if (player !== flow.state.toMove) illegal(`it is ${flow.state.toMove}'s turn`);
}

function rollOpening(
  flow: GameFlow,
  player: PlayerId,
  given: DieValue | undefined,
  ctx: FlowContext,
  variant: Variant,
): [GameFlow, GameAction] {
  if (flow.phase !== 'opening-roll') illegal('the opening roll is over');
  const opening = flow.opening;
  if (opening === null) illegal('chosenStarterRolls: choose the starter, there is no opening roll');
  if (opening[player] !== null) illegal(`${player} already rolled`);
  if (given !== undefined && !isDieValue(given)) illegal(`bad die ${JSON.stringify(given)}`);
  const die = given ?? rollDie(needRng(ctx));
  const event: GameAction = { type: 'rollOpening', player, die };
  const round = { ...opening, [player]: die };
  const { white, black } = round;
  if (white === null || black === null) return [{ ...flow, opening: round }, event];
  if (white === black) {
    // tavli-match.md #1: a tie is rolled again.
    const ties = [...opening.ties, white];
    return [{ ...flow, opening: { white: null, black: null, ties } }, event];
  }
  const starter: PlayerId = white > black ? 'white' : 'black';
  const decided: GameFlow = {
    ...flow,
    opening: round,
    starter,
    state: { ...flow.state, toMove: starter },
    phase: 'awaiting-roll',
  };
  if (flow.state.rules.match.openingRoll !== 'useOpeningDice') return [decided, event];
  // tavli-match.md #2: the starter plays the two opening dice (never a double).
  const dice: Dice = starter === 'white' ? [white, black] : [black, white];
  return [beginTurn(decided, dice, variant), event];
}

function sameInput(move: Move, input: MoveInput): boolean {
  return (
    move.from === input.from &&
    move.to === input.to &&
    move.die === input.die &&
    (input.capture === undefined || move.capture === input.capture)
  );
}

/**
 * One step: checks and applies `action`. Returns the next flow and the
 * action as it goes into the event log (with the dice rolled and the move
 * filled in). Used by `applyGameAction` and by the match flow.
 */
export function stepGame(
  flow: GameFlow,
  action: GameAction,
  ctx: FlowContext = {},
): [GameFlow, GameAction] {
  if (typeof action !== 'object' || action === null) illegal('an action must be an object');
  const player = checkPlayer(action.player);
  if (flow.phase === 'game-over') illegal('the game is over');
  const variant = variantOf(flow, ctx);

  switch (action.type) {
    case 'rollOpening':
      return rollOpening(flow, player, action.die, ctx, variant);

    case 'chooseStarter': {
      if (flow.phase !== 'opening-roll' || flow.opening !== null) {
        illegal('choose a starter only with openingRoll "chosenStarterRolls"');
      }
      const state = { ...flow.state, toMove: player };
      const next: GameFlow = { ...flow, state, starter: player, phase: 'awaiting-roll' };
      return [next, { type: 'chooseStarter', player }];
    }

    case 'roll': {
      onTurn(flow, player, ['awaiting-roll']);
      const dice = action.dice === undefined ? rollDice(needRng(ctx)) : checkDice(action.dice);
      return [beginTurn(flow, dice, variant), { type: 'roll', player, dice }];
    }

    case 'move': {
      onTurn(flow, player, ['moving']);
      const input: unknown = action.move;
      if (typeof input !== 'object' || input === null) illegal('a move must be an object');
      const dice = flow.state.dice as Dice;
      const options = variant.nextMoves(flow.state, dice, flow.played);
      const move = options.find((m) => sameInput(m, action.move));
      if (move === undefined) {
        throw new EngineError(
          'ILLEGAL_MOVE',
          `${JSON.stringify(action.move)} is not a legal move now`,
        );
      }
      const played = [...flow.played, move];
      const autoConfirm = action.autoConfirm === true;
      const event: GameAction = autoConfirm
        ? { type: 'move', player, move, autoConfirm }
        : { type: 'move', player, move };
      const done = variant.nextMoves(flow.state, dice, played).length === 0;
      if (!done) return [{ ...flow, played }, event];
      if (autoConfirm) return [finishTurn(flow, played, variant), event];
      return [{ ...flow, played, phase: 'awaiting-confirm' }, event];
    }

    case 'undo':
      onTurn(flow, player, ['moving', 'awaiting-confirm']);
      if (flow.played.length === 0) illegal('nothing to undo');
      return [
        { ...flow, played: flow.played.slice(0, -1), phase: 'moving' },
        { type: 'undo', player },
      ];

    case 'confirm':
      onTurn(flow, player, ['awaiting-confirm']);
      return [finishTurn(flow, flow.played, variant), { type: 'confirm', player }];

    case 'answer': {
      if (flow.phase !== 'awaiting-answer') illegal('there is no question to answer');
      const prompt = variant.prompt?.(flow.state) ?? null;
      if (prompt === null || variant.answerPrompt === undefined) illegal('there is no question');
      if (player !== prompt.player) illegal(`${prompt.player} must answer`);
      const choice: unknown = action.choice;
      if (typeof choice !== 'string' || !prompt.choices.includes(choice)) {
        illegal(`answer one of ${prompt.choices.join(', ')}`);
      }
      const next = variant.answerPrompt(flow.state, player, choice);
      const settled = settle(flow, next, variant);
      // The answer may set the next dice itself (Asodio: the chosen double
      // after a 1-2). Then that turn starts at once, with no roll.
      const begun =
        settled.phase === 'awaiting-roll' && next.dice !== null
          ? beginTurn(settled, next.dice, variant)
          : settled;
      return [begun, { type: 'answer', player, choice }];
    }

    case 'resign': {
      // Nobody has started yet during the opening roll: resign the match instead.
      if (flow.phase === 'opening-roll') illegal('the game has not started yet');
      // The moves of an unfinished turn do not count: score the turn start.
      const result = resignGame(flow.state, player, ctx.registry ?? VARIANT_REGISTRY);
      return [
        { ...flow, played: [], phase: 'game-over', result },
        { type: 'resign', player },
      ];
    }

    default:
      return illegal(`unknown action ${JSON.stringify((action as { type?: unknown }).type)}`);
  }
}

/** Applies one action and returns the next flow. Throws `ILLEGAL_ACTION` or `ILLEGAL_MOVE`. */
export function applyGameAction(
  flow: GameFlow,
  action: GameAction,
  ctx: FlowContext = {},
): GameFlow {
  return stepGame(flow, action, ctx)[0];
}

// ---------------------------------------------------------------------------
// Helpers for the UI. All are computed; nothing here is stored.

/** The single moves of one checker source (a point, the bar or outside). */
export interface SourceMoves {
  readonly from: Origin;
  /** Each target with its die and capture. Two dice can reach the same target. */
  readonly moves: readonly Move[];
}

/**
 * The single moves that are legal right now, grouped by source. Empty
 * unless the phase is `moving`. Every move keeps the turn finishable.
 */
export function legalNextMoves(flow: GameFlow, ctx: FlowContext = {}): readonly SourceMoves[] {
  if (flow.phase !== 'moving' || flow.state.dice === null) return [];
  const moves = variantOf(flow, ctx).nextMoves(flow.state, flow.state.dice, flow.played);
  const groups: { from: Origin; moves: Move[] }[] = [];
  for (const move of moves) {
    const group = groups.find((g) => g.from === move.from);
    if (group === undefined) groups.push({ from: move.from, moves: [move] });
    else group.moves.push(move);
  }
  return groups;
}

/**
 * The dice of this turn that are not used yet (a double counts four).
 * Once the turn is complete, these dice cannot be played. Empty outside
 * `moving` and `awaiting-confirm`.
 */
export function remainingDice(flow: GameFlow): readonly DieValue[] {
  if (flow.phase !== 'moving' && flow.phase !== 'awaiting-confirm') return [];
  if (flow.state.dice === null) return [];
  const left = [...diceMoves(flow.state.dice)];
  for (const move of flow.played) left.splice(left.indexOf(move.die), 1);
  return left;
}

/** True when the played moves form a full legal play. */
export function canConfirm(flow: GameFlow): boolean {
  return flow.phase === 'awaiting-confirm';
}

/** True when there is a move of this turn to take back. */
export function canUndo(flow: GameFlow): boolean {
  return (flow.phase === 'moving' || flow.phase === 'awaiting-confirm') && flow.played.length > 0;
}

/** The board with the moves played so far this turn. */
export function currentBoard(flow: GameFlow): BoardState {
  const { state } = flow;
  const direction = state.rules.movement.direction;
  return flow.played.reduce(
    (board, move) => applyMoveToBoard(board, state.toMove, move, direction),
    state.board,
  );
}

/** The variant's question while the phase is `awaiting-answer`, else `null`. */
export function currentPrompt(flow: GameFlow, ctx: FlowContext = {}): VariantPrompt | null {
  if (flow.phase !== 'awaiting-answer') return null;
  return variantOf(flow, ctx).prompt?.(flow.state) ?? null;
}

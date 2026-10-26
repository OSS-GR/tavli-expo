/**
 * The match flow (#25): the game flow of the current game inside a
 * `Match`, plus an event log.
 *
 * - When a game ends, its result goes into the match at once (the score
 *   updates). `nextGame` then starts the next game of the rotation, with
 *   the starter the match rules pick. If an opening roll must decide, the
 *   new game starts in `opening-roll`.
 * - When a score reaches the target, or a player resigns the match, the
 *   phase is `match-over`. `createRematchFlow` starts a rematch.
 *
 * Event log: every action is appended to `log` as plain data, with the
 * dice that were rolled. The first event (`start`) holds the match setup.
 * `replay(log)` builds the exact same flow again. To load a flow from
 * outside (the database, the network), replay its log: every event is
 * checked again on the way.
 */

import { EngineError } from '../errors';
import { createMatch, createRematch, recordGameResult, resignMatch, startNextGame } from '../match';
import type { CreateMatchOptions, Match } from '../match';
import { isPlayerId } from '../player';
import type { PerPlayer, PlayerId } from '../player';
import { createSeededRng } from '../rng';
import type { Rng } from '../rng';
import type { RuleSet } from '../rules';
import type { VariantRegistry } from '../variant';
import { VARIANT_REGISTRY } from '../variants';
import { createGameFlow, stepGame } from './game-flow';
import type { FlowContext, GameAction, GameFlow } from './game-flow';

/** The version of the `MatchFlow` shape. Bump it when the shape changes. */
export const MATCH_FLOW_SCHEMA_VERSION = 1;

/** The first event of every log: the match setup. */
export interface StartEvent {
  readonly type: 'start';
  readonly rules: RuleSet;
  readonly targetPoints: number;
  readonly players: PerPlayer<string>;
  /** Who starts game 1, or `null` for an opening roll. */
  readonly starter: PlayerId | null;
}

export type MatchAction =
  | GameAction
  /** Starts the next game after `game-over`. */
  | { readonly type: 'nextGame' }
  /** Ends the match: `player` resigns it, the opponent wins. */
  | { readonly type: 'resignMatch'; readonly player: PlayerId };

export type FlowEvent = StartEvent | MatchAction;

export interface MatchFlow {
  readonly schemaVersion: typeof MATCH_FLOW_SCHEMA_VERSION;
  readonly match: Match;
  /** The game being played, or the last game once the match is over. */
  readonly game: GameFlow;
  /** Every event so far, oldest first. `log[0]` is the `start` event. */
  readonly log: readonly FlowEvent[];
}

export type MatchPhase = 'playing' | 'game-over' | 'match-over';

/** `match-over` when the match is finished, `game-over` between games, else `playing`. */
export function matchPhase(flow: MatchFlow): MatchPhase {
  if (flow.match.status === 'finished') return 'match-over';
  return flow.game.phase === 'game-over' ? 'game-over' : 'playing';
}

function illegal(message: string): never {
  throw new EngineError('ILLEGAL_ACTION', message);
}

function startGame(match: Match, registry: VariantRegistry): GameFlow {
  const starter = match.nextStarter;
  // The variant needs a player to move; the opening roll changes it.
  const state = startNextGame(match, starter ?? 'white', registry);
  return createGameFlow({ state, starter });
}

function fromStart(event: StartEvent, ctx: FlowContext): MatchFlow {
  const match = createMatch({
    rules: event.rules,
    targetPoints: event.targetPoints,
    players: event.players,
    starter: event.starter,
  });
  const start: StartEvent = {
    type: 'start',
    rules: match.rules,
    targetPoints: match.targetPoints,
    players: match.players,
    starter: match.nextStarter,
  };
  return {
    schemaVersion: MATCH_FLOW_SCHEMA_VERSION,
    match,
    game: startGame(match, ctx.registry ?? VARIANT_REGISTRY),
    log: [start],
  };
}

/**
 * Starts a match flow. Same options as `createMatch`. The first game
 * starts at once: in `opening-roll`, or in `awaiting-roll` when
 * `options.starter` is set.
 */
export function createMatchFlow(
  options: CreateMatchOptions = {},
  ctx: FlowContext = {},
): MatchFlow {
  const match = createMatch(options);
  return fromStart(
    {
      type: 'start',
      rules: match.rules,
      targetPoints: match.targetPoints,
      players: match.players,
      starter: match.nextStarter,
    },
    ctx,
  );
}

/**
 * Applies one action and returns the next flow, with the action added to
 * the log. Throws `ILLEGAL_ACTION` (or `ILLEGAL_MOVE`) and leaves the flow
 * as it was.
 */
export function applyMatchAction(
  flow: MatchFlow,
  action: MatchAction,
  ctx: FlowContext = {},
): MatchFlow {
  if (typeof action !== 'object' || action === null) illegal('an action must be an object');
  if (flow.match.status === 'finished') illegal('the match is over');
  const registry = ctx.registry ?? VARIANT_REGISTRY;

  if (action.type === 'nextGame') {
    if (flow.game.phase !== 'game-over') illegal('the game is not over yet');
    const game = startGame(flow.match, registry);
    return { ...flow, game, log: [...flow.log, { type: 'nextGame' }] };
  }

  if (action.type === 'resignMatch') {
    if (!isPlayerId(action.player)) illegal(`bad player ${JSON.stringify(action.player)}`);
    const match = resignMatch(flow.match, action.player);
    return { ...flow, match, log: [...flow.log, { type: 'resignMatch', player: action.player }] };
  }

  const [game, event] = stepGame(flow.game, action, ctx);
  let match = flow.match;
  if (game.phase === 'game-over' && game.result !== null && game.starter !== null) {
    match = recordGameResult(match, game.result, { starter: game.starter });
  }
  return { ...flow, match, game, log: [...flow.log, event] };
}

/** A rematch against the same opponent (`createRematch`), as a new flow with its own log. */
export function createRematchFlow(flow: MatchFlow, ctx: FlowContext = {}): MatchFlow {
  const match = createRematch(flow.match);
  return createMatchFlow(
    {
      rules: match.rules,
      targetPoints: match.targetPoints,
      players: match.players,
      starter: match.nextStarter,
    },
    ctx,
  );
}

export interface ReplayOptions {
  /** Where the variants come from. Default: `VARIANT_REGISTRY`. */
  readonly registry?: VariantRegistry;
  /** Rolls dice for events that have none. */
  readonly rng?: Rng;
  /** Same as `rng: createSeededRng(seed)`. */
  readonly seed?: number;
}

/**
 * Builds a flow from its event log. A log from `MatchFlow.log` has every
 * die in it, so it needs no RNG. A log of actions without dice needs the
 * same RNG (or seed) as the first run.
 *
 * Throws `ILLEGAL_ACTION` when the log does not start with `start`, and
 * any error an event raises.
 */
export function replay(events: readonly FlowEvent[], options: ReplayOptions = {}): MatchFlow {
  const [first, ...rest] = events;
  if (first === undefined || first.type !== 'start') illegal('a log starts with a start event');
  const rng =
    options.rng ?? (options.seed === undefined ? undefined : createSeededRng(options.seed));
  const ctx: FlowContext = {
    ...(options.registry === undefined ? {} : { registry: options.registry }),
    ...(rng === undefined ? {} : { rng }),
  };
  let flow = fromStart(first, ctx);
  for (const event of rest) {
    if (event.type === 'start') illegal('only the first event is a start event');
    flow = applyMatchAction(flow, event, ctx);
  }
  return flow;
}

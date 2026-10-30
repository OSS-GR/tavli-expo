/**
 * The online game logic, with no Convex code (#126, moved here in #251).
 *
 * A server loads a game, calls one function here, and saves the result.
 * Two servers do this: the Convex functions (`apps/server/convex/games.ts`)
 * and the in-memory server (`memory-server.ts`). Everything here is pure:
 * dice come from the `Rng` the caller passes in. The Convex server passes
 * the secure RNG (`apps/server/convex/model/cryptoRng.ts`); tests may pass
 * a seeded one.
 *
 * The server keeps a game at rest in a phase where it waits for a player:
 * `moving` (a player must play their roll) or `awaiting-answer` (a variant
 * question). Rolls, passes and the start of the next game happen on the
 * server, in `advance`.
 *
 * The stored flow is the engine `MatchFlow` without its log. The log
 * lives apart (on Convex, in the `moves` table), one row per event. A
 * step starts from the stored flow with an empty log, so `flow.log` after
 * the step holds just the new events. The stored flow also keeps the game
 * before the current one, as it ended (`previousGame`, #299): `advance`
 * starts the next game at once, so the view would lose the turn that
 * ended a game. `advance` keeps that game (`SteppedFlow.endedGame`), and
 * `storeStep` saves it.
 */

import { turnDeadlineMs } from '@tavli/contracts';
import type { GameTransportErrorCode, OnlineGameChoice, OnlineGameView } from '@tavli/contracts';
import {
  DEFAULT_PRESET_BY_GAME,
  EngineError,
  MATCH_FLOW_SCHEMA_VERSION,
  PLAYERS,
  applyMatchAction,
  createMatchFlow,
  currentPrompt,
  matchPhase,
  resolveRules,
} from '@tavli/engine';
import type {
  GameFlow,
  MatchAction,
  MatchFlow,
  MoveInput,
  PerPlayer,
  PlayerId,
  PresetId,
  Rng,
  RuleSet,
} from '@tavli/engine';

/**
 * A rejected call. The Convex layer turns it into a `ConvexError`; the
 * in-memory server rejects with its `{ code, message }`.
 */
export class OnlineGameError extends Error {
  constructor(
    readonly code: GameTransportErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'OnlineGameError';
  }
}

function fail(code: GameTransportErrorCode, message: string): never {
  throw new OnlineGameError(code, message);
}

/** Runs an engine step. Engine errors become `ILLEGAL_MOVE` or `ILLEGAL_ACTION`. */
function engineStep<T>(step: () => T): T {
  try {
    return step();
  } catch (error) {
    if (error instanceof EngineError) {
      fail(error.code === 'ILLEGAL_MOVE' ? 'ILLEGAL_MOVE' : 'ILLEGAL_ACTION', error.message);
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Rules

const PRESETS: { readonly [G in OnlineGameChoice]: PresetId } = {
  portes: DEFAULT_PRESET_BY_GAME.portes,
  plakoto: DEFAULT_PRESET_BY_GAME.plakoto,
  fevga: DEFAULT_PRESET_BY_GAME.fevga,
  asodio: DEFAULT_PRESET_BY_GAME.asodio,
  tavli: 'tavli',
};

/**
 * The rules of a new match of `choice`. Same as `gameRuleSet` in
 * `apps/mobile/src/features/match/setup.ts` (kept in sync by hand: the
 * server must not import app code). A one-game match sets
 * `match.rotation` to that game; Tavli keeps its rotation.
 */
export function onlineGameRules(choice: OnlineGameChoice): RuleSet {
  const preset = PRESETS[choice];
  return choice === 'tavli'
    ? resolveRules(preset)
    : resolveRules(preset, { match: { rotation: [choice] } });
}

// ---------------------------------------------------------------------------
// Stored flow

/**
 * The `MatchFlow` without its log, as saved (on Convex, in `games.flow`),
 * and the game before the current one as it ended. Flows saved before
 * #299 have no `previousGame`: read it as `null`.
 */
export type StoredFlow = Omit<MatchFlow, 'log'> & { readonly previousGame?: GameFlow };

/** A stored flow as read: the flow (with an empty log) and the game before it. */
export interface LoadedFlow {
  readonly flow: MatchFlow;
  /**
   * The game before `flow.game`, as it ended (phase `game-over`): its
   * `lastTurn` is the turn that ended it. `null` in the first game, and
   * for a flow saved before #299 until its next game starts.
   */
  readonly previousGame: GameFlow | null;
}

/**
 * The flow after a step. `endedGame` is the game that ended in the step,
 * as it ended, or `null` when no next game started in it. `advance` keeps
 * it when it starts the next game, so nothing plays the step again.
 */
export interface SteppedFlow extends MatchFlow {
  readonly endedGame: GameFlow | null;
}

/**
 * The stored text of `flow`. `previousGame` is the game before
 * `flow.game`, as it ended. After a step, use `storeStep`: it keeps the
 * game that ended.
 */
export function storeFlow(flow: MatchFlow, previousGame: GameFlow | null): string {
  const stored: StoredFlow = {
    schemaVersion: flow.schemaVersion,
    match: flow.match,
    game: flow.game,
    ...(previousGame === null ? {} : { previousGame }),
  };
  return JSON.stringify(stored);
}

/**
 * Reads a stored flow, with one parse. Only the server writes it, so a
 * shape check is enough.
 */
export function loadStored(text: string): LoadedFlow {
  const stored = JSON.parse(text) as StoredFlow;
  if (stored.schemaVersion !== MATCH_FLOW_SCHEMA_VERSION) {
    throw new Error(`stored flow has schema version ${String(stored.schemaVersion)}`);
  }
  const { schemaVersion, match, game, previousGame } = stored;
  return { flow: { schemaVersion, match, game, log: [] }, previousGame: previousGame ?? null };
}

/** Reads just the flow of a stored text (`loadStored(text).flow`). */
export function loadFlow(text: string): MatchFlow {
  return loadStored(text).flow;
}

/**
 * The stored text after a step: `next`, and the game before its current
 * one. That is the game that ended in the step, else the one `before`
 * kept. `before` is what the step loaded its flow from.
 */
export function storeStep(before: LoadedFlow, next: SteppedFlow): string {
  return storeFlow(next, next.endedGame ?? before.previousGame);
}

// ---------------------------------------------------------------------------
// Steps

/** More server steps than this in one call means a bug (an endless pass loop). */
const MAX_SERVER_STEPS = 1000;

function apply(flow: MatchFlow, action: MatchAction, rng: Rng): MatchFlow {
  return engineStep(() => applyMatchAction(flow, action, { rng }));
}

/**
 * Plays every step that needs no player: the opening roll, each roll (a
 * roll with no legal move passes by itself) and the start of the next
 * game. Stops when a player must act or the match is over. The result
 * keeps the game it replaced with the next one (`endedGame`).
 */
export function advance(flow: MatchFlow, rng: Rng): SteppedFlow {
  let next = flow;
  let endedGame: GameFlow | null = null;
  const done = (): SteppedFlow => ({ ...next, endedGame });
  for (let i = 0; i < MAX_SERVER_STEPS; i++) {
    if (next.match.status === 'finished') return done();
    const { game } = next;
    switch (game.phase) {
      case 'game-over':
        endedGame = game;
        next = apply(next, { type: 'nextGame' }, rng);
        break;
      case 'opening-roll': {
        const opening = game.opening;
        if (opening === null) {
          // `chosenStarterRolls`: `createOnlineMatch` never allows it.
          throw new Error('online games need an opening roll');
        }
        const player: PlayerId = opening.white === null ? 'white' : 'black';
        next = apply(next, { type: 'rollOpening', player }, rng);
        break;
      }
      case 'awaiting-roll':
        next = apply(next, { type: 'roll', player: game.state.toMove }, rng);
        break;
      default:
        return done();
    }
  }
  throw new Error(`advance did not stop after ${MAX_SERVER_STEPS} steps`);
}

export interface CreateOnlineMatchOptions {
  readonly choice: OnlineGameChoice;
  readonly targetPoints: number;
  /** The player id on each side. */
  readonly players: PerPlayer<string>;
}

/**
 * A new match, advanced to the first roll. `flow.log` holds every event so
 * far. Save it with `storeFlow(flow, null)`: no game ended before it.
 */
export function createOnlineMatch(options: CreateOnlineMatchOptions, rng: Rng): MatchFlow {
  const { choice, targetPoints, players } = options;
  if (players.white === players.black) fail('BAD_REQUEST', 'the two players must differ');
  const rules = onlineGameRules(choice);
  if (rules.match.openingRoll === 'chosenStarterRolls') {
    fail('BAD_REQUEST', 'online games need an opening roll');
  }
  const flow = engineStep(() => createMatchFlow({ rules, targetPoints, players, starter: null }));
  const { schemaVersion, match, game, log } = advance(flow, rng);
  return { schemaVersion, match, game, log };
}

/** The side of `callerId`, or `null` when the caller is not a player. */
export function sideOf(players: PerPlayer<string>, callerId: string): PlayerId | null {
  return PLAYERS.find((side) => players[side] === callerId) ?? null;
}

function checkActive(flow: MatchFlow): void {
  if (flow.match.status === 'finished') fail('GAME_OVER', 'the match is over');
}

/** The side the server waits for, or `null` when the match is over. */
export function waitingFor(flow: MatchFlow): PlayerId | null {
  if (flow.match.status === 'finished') return null;
  const prompt = currentPrompt(flow.game);
  if (prompt !== null) return prompt.player;
  return flow.game.state.toMove;
}

/**
 * `player` plays one full turn: every move for the current roll. The
 * turn must be complete (a full legal play). Then the server rolls on.
 */
export function playTurn(
  flow: MatchFlow,
  player: PlayerId,
  moves: readonly MoveInput[],
  rng: Rng,
): SteppedFlow {
  checkActive(flow);
  if (flow.game.phase === 'awaiting-answer') {
    fail(
      waitingFor(flow) === player ? 'ILLEGAL_ACTION' : 'NOT_YOUR_TURN',
      'a question waits for its answer',
    );
  }
  if (flow.game.phase !== 'moving')
    fail('ILLEGAL_ACTION', `no turn to play in phase ${flow.game.phase}`);
  if (flow.game.state.toMove !== player)
    fail('NOT_YOUR_TURN', `it is ${flow.game.state.toMove}'s turn`);
  let next = flow;
  for (const move of moves) next = apply(next, { type: 'move', player, move }, rng);
  if (next.game.phase !== 'awaiting-confirm') {
    fail('ILLEGAL_MOVE', 'the turn is not complete: play every die you can');
  }
  next = apply(next, { type: 'confirm', player }, rng);
  return advance(next, rng);
}

/** `player` answers the current question (for example the Plakoto mother question). */
export function answerPrompt(
  flow: MatchFlow,
  player: PlayerId,
  choice: string,
  rng: Rng,
): SteppedFlow {
  checkActive(flow);
  const prompt = currentPrompt(flow.game);
  if (prompt === null) fail('ILLEGAL_ACTION', 'there is no question to answer');
  if (prompt.player !== player) fail('NOT_YOUR_TURN', `${prompt.player} must answer`);
  return advance(apply(flow, { type: 'answer', player, choice }, rng), rng);
}

/** `player` resigns the whole match. Allowed at any time, on either turn. */
export function resign(flow: MatchFlow, player: PlayerId, rng: Rng): SteppedFlow {
  checkActive(flow);
  // The match ends here: no next game starts, so no game ends "before" one.
  return { ...apply(flow, { type: 'resignMatch', player }, rng), endedGame: null };
}

// ---------------------------------------------------------------------------
// Turn timers (#133)
//
// The clock is an argument (`now`, epoch milliseconds), so this code stays
// pure. The Convex functions pass `Date.now()`.

/** When a turn that starts at `now` runs out. */
export function deadlineAfter(turnTimeMinutes: number | null, now: number): number {
  return now + turnDeadlineMs(turnTimeMinutes);
}

/** True when `deadline` has passed at `now`. At the deadline itself the time is up. */
export function isTimedOut(deadline: number | null, now: number): boolean {
  return deadline !== null && now >= deadline;
}

/**
 * The player the server waits for ran out of time: they lose the current
 * game (engine action `timeout`, scored like a resign of that game). Then
 * the server rolls on: the next game starts, or the match ends.
 */
export function timeOut(flow: MatchFlow, rng: Rng): SteppedFlow {
  checkActive(flow);
  const player = waitingFor(flow);
  if (player === null) fail('GAME_OVER', 'the match is over');
  return advance(apply(flow, { type: 'timeout', player }, rng), rng);
}

// ---------------------------------------------------------------------------
// The client view

export interface ViewInput {
  readonly gameId: string;
  readonly version: number;
  readonly choice: OnlineGameChoice;
  /** A per-turn time limit in minutes, or `null` for the 24-hour default (#183). */
  readonly turnTimeMinutes: number | null;
  readonly turnDeadline: number | null;
  readonly players: PerPlayer<string>;
  readonly flow: MatchFlow;
  /** The game before `flow.game`, as it ended (`LoadedFlow.previousGame`). */
  readonly previousGame: GameFlow | null;
}

/**
 * What a client may see. The flow never holds future dice (the server
 * rolls each roll when its turn starts), and nothing about the RNG.
 */
export function toView(input: ViewInput): OnlineGameView {
  const { gameId, version, choice, turnTimeMinutes, turnDeadline, players, flow, previousGame } =
    input;
  const finished = matchPhase(flow) === 'match-over';
  return {
    gameId,
    version,
    status: finished ? 'finished' : 'active',
    choice,
    turnTimeMinutes,
    turnDeadline: finished ? null : turnDeadline,
    players,
    match: flow.match,
    game: flow.game,
    previousGame,
    waitingFor: waitingFor(flow),
    prompt: flow.match.status === 'finished' ? null : currentPrompt(flow.game),
  };
}

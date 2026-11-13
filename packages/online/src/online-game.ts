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
 * `opening-roll` (the first game of a match: each player rolls their own
 * opening die, #379), `awaiting-roll` (a player must roll, #355), `moving`
 * (a player must play their roll) or `awaiting-answer` (a variant
 * question). Every roll waits for its player (`rollDice`): the server
 * rolls it with its RNG only then. A roll with no legal move passes in the
 * engine, and the server then waits for the other player's roll. The
 * start of the next game, and its opening roll when one decides, happen on
 * the server, in `advance`.
 *
 * The stored flow is the engine `MatchFlow` without its log. The log
 * lives apart (on Convex, in the `moves` table), one row per event. A
 * step starts from the stored flow with an empty log, so `flow.log` after
 * the step holds just the new events. The stored flow also keeps the game
 * before the current one, as it ended (`previousGame`, #299): `advance`
 * starts the next game at once, so the view would lose the turn that
 * ended a game. `advance` keeps that game (`SteppedFlow.endedGame`), and
 * `storeStep` saves it. It keeps each side's time outs in a row too
 * (`timeoutsInARow`, #529): in a ranked match the second one in a row
 * loses the match (`timeOut`).
 */

import { RANKED_TIMEOUTS_TO_LOSE, turnDeadlineMs } from '@tavli/contracts';
import type {
  GameTransportErrorCode,
  OnlineGameChoice,
  OnlineGameView,
  OnlineMatchEndReason,
  PlayerName,
  TurnDraft,
} from '@tavli/contracts';
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
 * the game before the current one as it ended, and each side's time outs
 * in a row. Flows saved before #299 have no `previousGame`: read it as
 * `null`. `timeoutsInARow` is left out while both counts are 0 (and in
 * flows saved before #529): read it as 0 each.
 */
export type StoredFlow = Omit<MatchFlow, 'log'> & {
  readonly previousGame?: GameFlow;
  readonly timeoutsInARow?: PerPlayer<number>;
};

/** No time outs yet. */
export const NO_TIMEOUTS: PerPlayer<number> = { white: 0, black: 0 };

/** A stored flow as read: the flow (with an empty log) and the game before it. */
export interface LoadedFlow {
  readonly flow: MatchFlow;
  /**
   * The game before `flow.game`, as it ended (phase `game-over`): its
   * `lastTurn` is the turn that ended it. `null` in the first game, and
   * for a flow saved before #299 until its next game starts.
   */
  readonly previousGame: GameFlow | null;
  /**
   * How many of each side's turns in a row ended in a time out (#529),
   * over the whole match, the opening roll too. A turn the side plays
   * sets it back to 0 (`SteppedFlow.playedBy`).
   */
  readonly timeoutsInARow: PerPlayer<number>;
}

/**
 * The flow after a step. `endedGame` is the game that ended in the step,
 * as it ended, or `null` when no next game started in it. `advance` keeps
 * it when it starts the next game, so nothing plays the step again.
 *
 * `playedBy` is the side whose turn the step ended in time (#529): a
 * full turn (`playTurn`), a roll with no legal move, their opening die,
 * or an answer after which the server no longer waits for their move.
 * `null` when the step ended nobody's turn: a roll they still have to
 * play, a server step, a time out or a resign. `storeStep` sets that
 * side's time outs in a row back to 0.
 */
export interface SteppedFlow extends MatchFlow {
  readonly endedGame: GameFlow | null;
  readonly playedBy: PlayerId | null;
}

/**
 * The stored text of `flow`. `previousGame` is the game before
 * `flow.game`, as it ended. `timeoutsInARow` is each side's time outs in
 * a row (default none). After a step, use `storeStep`: it keeps the game
 * that ended and the counts.
 */
export function storeFlow(
  flow: MatchFlow,
  previousGame: GameFlow | null,
  timeoutsInARow: PerPlayer<number> = NO_TIMEOUTS,
): string {
  const { white, black } = timeoutsInARow;
  const stored: StoredFlow = {
    schemaVersion: flow.schemaVersion,
    match: flow.match,
    game: flow.game,
    ...(previousGame === null ? {} : { previousGame }),
    ...(white === 0 && black === 0 ? {} : { timeoutsInARow: { white, black } }),
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
  const { schemaVersion, match, game, previousGame, timeoutsInARow } = stored;
  return {
    flow: { schemaVersion, match, game, log: [] },
    previousGame: previousGame ?? null,
    timeoutsInARow: timeoutsInARow ?? NO_TIMEOUTS,
  };
}

/** Reads just the flow of a stored text (`loadStored(text).flow`). */
export function loadFlow(text: string): MatchFlow {
  return loadStored(text).flow;
}

/**
 * Each side's time outs in a row after a step (#529): one more for each
 * time out in the step, and 0 for the side that played a turn in it
 * (`playedBy`). `before` is what the step loaded its flow from.
 */
export function timeoutsAfter(before: LoadedFlow, next: SteppedFlow): PerPlayer<number> {
  const counts = { ...before.timeoutsInARow };
  for (const event of next.log) {
    if (event.type === 'timeout') counts[event.player] += 1;
  }
  if (next.playedBy !== null) counts[next.playedBy] = 0;
  return counts;
}

/**
 * The stored text after a step: `next`, the game before its current
 * one, and the time outs in a row (`timeoutsAfter`). That game is the
 * one that ended in the step, else the one `before` kept. `before` is
 * what the step loaded its flow from.
 */
export function storeStep(before: LoadedFlow, next: SteppedFlow): string {
  return storeFlow(next, next.endedGame ?? before.previousGame, timeoutsAfter(before, next));
}

// ---------------------------------------------------------------------------
// Steps

/** More server steps than this in one call means a bug (an endless pass loop). */
const MAX_SERVER_STEPS = 1000;

function apply(flow: MatchFlow, action: MatchAction, rng: Rng): MatchFlow {
  return engineStep(() => applyMatchAction(flow, action, { rng }));
}

/**
 * Plays every step that needs no player: the start of the next game, and
 * its opening roll. Stops when a player must act (roll, move or answer) or
 * the match is over. A player's roll waits for them (`rollDice`, #355).
 * The opening roll of a match's first game waits for the players too
 * (#379): each one rolls their own die. Only `rollOpenings: true` (the
 * time out when nobody rolled) makes the server roll it. The result keeps
 * the game it replaced with the next one (`endedGame`).
 */
export function advance(
  flow: MatchFlow,
  rng: Rng,
  options: { readonly rollOpenings?: boolean } = {},
): SteppedFlow {
  let next = flow;
  let endedGame: GameFlow | null = null;
  const done = (): SteppedFlow => ({ ...next, endedGame, playedBy: null });
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
        // The first game: the players roll (`rollDice`).
        if (next.match.games.length === 0 && options.rollOpenings !== true) return done();
        const player: PlayerId = opening.white === null ? 'white' : 'black';
        next = apply(next, { type: 'rollOpening', player }, rng);
        break;
      }
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
 * A new match, in the opening roll (#379): each player then rolls their
 * own opening die (`rollDice`). `flow.log` holds every event so far. Save
 * it with `storeFlow(flow, null)`: no game ended before it.
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

/** True when `side` may roll their opening die now (#379): their die is still to roll. */
export function mayRollOpening(flow: Pick<MatchFlow, 'match' | 'game'>, side: PlayerId): boolean {
  const { game } = flow;
  return (
    flow.match.status !== 'finished' &&
    game.phase === 'opening-roll' &&
    game.opening !== null &&
    game.opening[side] === null
  );
}

/**
 * The side the server waits for, or `null` when the match is over. In the
 * opening roll (#379) both players may roll their own die, in any order;
 * this names the one still to roll: White while neither rolled, else the
 * side whose die is missing. That side loses on time if the other rolled.
 */
export function waitingFor(flow: MatchFlow): PlayerId | null {
  if (flow.match.status === 'finished') return null;
  const { opening } = flow.game;
  if (flow.game.phase === 'opening-roll' && opening !== null) {
    return opening.white === null ? 'white' : 'black';
  }
  const prompt = currentPrompt(flow.game);
  if (prompt !== null) return prompt.player;
  return flow.game.state.toMove;
}

/**
 * True when, after a step of `player`, the server no longer waits for
 * them to finish the turn they were in (#529): it waits for the other
 * side or for a new roll, or the match is over. A roll they must still
 * play, or a question in their turn, keeps the turn going.
 */
function turnEnded(next: MatchFlow, player: PlayerId): boolean {
  const { phase } = next.game;
  const turnGoesOn =
    phase === 'moving' || phase === 'awaiting-answer' || phase === 'awaiting-confirm';
  return !(turnGoesOn && waitingFor(next) === player);
}

/**
 * `player` rolls the dice of their turn (#355), with `rng` (on Convex the
 * secure RNG). Only the player to move, in `awaiting-roll`. A roll with no
 * legal move passes in the engine: `game.lastTurn` keeps its dice, and the
 * server waits for the other player's roll.
 *
 * In the opening roll (#379) it rolls the caller's opening die instead,
 * while that die is still to roll (else `ILLEGAL_ACTION`). Either player
 * may roll first. A tie clears both dice, and both roll again.
 *
 * The opening die and a pass end the player's turn in time (`playedBy`,
 * #529); a roll they can play does not.
 */
export function rollDice(flow: MatchFlow, player: PlayerId, rng: Rng): SteppedFlow {
  checkActive(flow);
  const { game } = flow;
  if (game.phase === 'opening-roll') {
    if (!mayRollOpening(flow, player)) fail('ILLEGAL_ACTION', `${player} already rolled`);
    const opened = advance(apply(flow, { type: 'rollOpening', player }, rng), rng);
    return { ...opened, playedBy: player };
  }
  if (game.phase !== 'awaiting-roll') {
    fail(
      waitingFor(flow) === player ? 'ILLEGAL_ACTION' : 'NOT_YOUR_TURN',
      `no roll in phase ${game.phase}`,
    );
  }
  if (game.state.toMove !== player) fail('NOT_YOUR_TURN', `it is ${game.state.toMove}'s roll`);
  const rolled = advance(apply(flow, { type: 'roll', player }, rng), rng);
  return { ...rolled, playedBy: turnEnded(rolled, player) ? player : null };
}

/**
 * `player` plays one full turn: every move for the current roll. The
 * turn must be complete (a full legal play). Then the server waits for
 * the next roll.
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
  if (flow.game.phase !== 'moving') {
    // `awaiting-roll`: roll first (#355).
    fail(
      waitingFor(flow) === player ? 'ILLEGAL_ACTION' : 'NOT_YOUR_TURN',
      `no turn to play in phase ${flow.game.phase}`,
    );
  }
  if (flow.game.state.toMove !== player)
    fail('NOT_YOUR_TURN', `it is ${flow.game.state.toMove}'s turn`);
  let next = flow;
  for (const move of moves) next = apply(next, { type: 'move', player, move }, rng);
  if (next.game.phase !== 'awaiting-confirm') {
    fail('ILLEGAL_MOVE', 'the turn is not complete: play every die you can');
  }
  next = apply(next, { type: 'confirm', player }, rng);
  return { ...advance(next, rng), playedBy: player };
}

/** A copy of a move with only the fields of `MoveInput`. */
function plainMove(move: MoveInput): MoveInput {
  const { from, to, die, capture } = move;
  return capture === undefined ? { from, to, die } : { from, to, die, capture };
}

/**
 * Checks a draft (#374): the moves `player` has made so far in this turn,
 * before Confirm. Only the side the server waits for, only while it
 * moves (`moving`), and each move must be legal from the board before it
 * (the draft may be the whole turn, or empty after the last undo). It
 * changes nothing: it returns the moves to show, with only the
 * `MoveInput` fields. Rejects like `playTurn`; any refused move is
 * `ILLEGAL_MOVE`.
 */
export function checkDraft(
  flow: MatchFlow,
  player: PlayerId,
  moves: readonly MoveInput[],
): MoveInput[] {
  checkActive(flow);
  if (flow.game.phase !== 'moving') {
    fail(
      waitingFor(flow) === player ? 'ILLEGAL_ACTION' : 'NOT_YOUR_TURN',
      `no turn to show in phase ${flow.game.phase}`,
    );
  }
  if (flow.game.state.toMove !== player)
    fail('NOT_YOUR_TURN', `it is ${flow.game.state.toMove}'s turn`);
  let next = flow;
  for (const move of moves) {
    try {
      // A move needs no dice roll, so no `Rng`.
      next = applyMatchAction(next, { type: 'move', player, move });
    } catch (error) {
      if (error instanceof EngineError) fail('ILLEGAL_MOVE', error.message);
      throw error;
    }
  }
  return moves.map(plainMove);
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
  const answered = advance(apply(flow, { type: 'answer', player, choice }, rng), rng);
  return { ...answered, playedBy: turnEnded(answered, player) ? player : null };
}

/** `player` resigns the whole match. Allowed at any time, on either turn. */
export function resign(flow: MatchFlow, player: PlayerId, rng: Rng): SteppedFlow {
  checkActive(flow);
  // The match ends here: no next game starts, so no game ends "before" one.
  return { ...apply(flow, { type: 'resignMatch', player }, rng), endedGame: null, playedBy: null };
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

/** What `timeOut` needs to know for the Play ranked rule (#529). */
export interface TimeOutOptions {
  /** True for a Play ranked game. Default false: a friend game. */
  readonly ranked?: boolean;
  /** Each side's time outs in a row before this one (`LoadedFlow.timeoutsInARow`). */
  readonly timeoutsInARow?: PerPlayer<number>;
}

/**
 * True when a time out of `player` now ends a ranked match (#529,
 * ADR-0009): their turns just before this one ended in time outs
 * `RANKED_TIMEOUTS_TO_LOSE - 1` times in a row. Never in a friend game.
 */
export function losesRankedMatch(options: TimeOutOptions, player: PlayerId): boolean {
  const before = (options.timeoutsInARow ?? NO_TIMEOUTS)[player];
  return options.ranked === true && before + 1 >= RANKED_TIMEOUTS_TO_LOSE;
}

/**
 * The player the server waits for ran out of time: they lose the current
 * game (engine action `timeout`, always 1 point, #378). Then
 * the server goes on: the next game starts, or the match ends.
 *
 * In the opening roll (#379) the player who did not roll loses, when the
 * other did. When neither rolled, nobody loses: the server rolls both
 * dice, and the first turn starts.
 *
 * Play ranked (#529): when this is the player's second time out in a row
 * (`losesRankedMatch`), they also resign the match (engine action
 * `resignMatch`, so it scores like any resign), and the other player
 * wins it. When the lost game already ended the match on points, that
 * stays the result.
 */
export function timeOut(flow: MatchFlow, rng: Rng, options: TimeOutOptions = {}): SteppedFlow {
  checkActive(flow);
  const { opening } = flow.game;
  if (flow.game.phase === 'opening-roll' && opening?.white === null && opening.black === null) {
    return advance(flow, rng, { rollOpenings: true });
  }
  const player = waitingFor(flow);
  if (player === null) fail('GAME_OVER', 'the match is over');
  let next = apply(flow, { type: 'timeout', player }, rng);
  if (next.match.status !== 'finished' && losesRankedMatch(options, player)) {
    next = apply(next, { type: 'resignMatch', player }, rng);
  }
  return advance(next, rng);
}

/**
 * Why the match of `flow` ended, or `null` while it runs (#529). A
 * ranked match that `resignedBy` lost on time outs in a row
 * (`timeoutsInARow` as saved after that step) is `timeouts-in-a-row`.
 * In a ranked match only that rule takes a count to
 * `RANKED_TIMEOUTS_TO_LOSE`, so a resign by hand never looks like it.
 */
export function matchEndReason(
  flow: Pick<MatchFlow, 'match'>,
  ranked: boolean,
  timeoutsInARow: PerPlayer<number>,
): OnlineMatchEndReason | null {
  const { match } = flow;
  if (match.status !== 'finished') return null;
  if (match.resignedBy === null) return 'points';
  return ranked && timeoutsInARow[match.resignedBy] >= RANKED_TIMEOUTS_TO_LOSE
    ? 'timeouts-in-a-row'
    : 'resigned';
}

// ---------------------------------------------------------------------------
// The client view

export interface ViewInput {
  readonly gameId: string;
  readonly version: number;
  readonly choice: OnlineGameChoice;
  /** A per-turn time limit in minutes, or `null` for the 24-hour default (#183). */
  readonly turnTimeMinutes: number | null;
  /** True for a Play ranked game (#529). */
  readonly ranked: boolean;
  readonly turnDeadline: number | null;
  readonly players: PerPlayer<string>;
  readonly flow: MatchFlow;
  /** The game before `flow.game`, as it ended (`LoadedFlow.previousGame`). */
  readonly previousGame: GameFlow | null;
  /** Each side's time outs in a row (`LoadedFlow.timeoutsInARow`): the end reason reads it. */
  readonly timeoutsInARow: PerPlayer<number>;
  /**
   * The saved draft of this game (#374), or `null`. The view shows it only
   * when it belongs to `version` and the server waits for a move.
   */
  readonly draft?: SavedDraft | null;
  /** The name of each side (#400, `namesOf`). */
  readonly names: PerPlayer<PlayerName | null>;
}

/** A draft as a server keeps it (#374): the game version it belongs to. */
export interface SavedDraft extends TurnDraft {
  readonly version: number;
}

/**
 * What a client may see. The flow never holds future dice (the server
 * rolls each roll when its player asks, #355), and nothing about the RNG.
 */
export function toView(input: ViewInput): OnlineGameView {
  const { gameId, version, choice, turnTimeMinutes, ranked, turnDeadline, players, flow } = input;
  const { previousGame, timeoutsInARow } = input;
  const saved = input.draft ?? null;
  const draft: TurnDraft | null =
    saved !== null && saved.version === version && flow.game.phase === 'moving'
      ? { moves: saved.moves, seq: saved.seq }
      : null;
  const finished = matchPhase(flow) === 'match-over';
  return {
    gameId,
    version,
    status: finished ? 'finished' : 'active',
    choice,
    turnTimeMinutes,
    ranked,
    turnDeadline: finished ? null : turnDeadline,
    players,
    names: input.names,
    match: flow.match,
    game: flow.game,
    previousGame,
    waitingFor: waitingFor(flow),
    matchEndReason: matchEndReason(flow, ranked, timeoutsInARow),
    prompt: flow.match.status === 'finished' ? null : currentPrompt(flow.game),
    draft: finished ? null : draft,
  };
}

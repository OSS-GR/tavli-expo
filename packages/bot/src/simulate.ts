/**
 * Bot-vs-bot simulation. It tests the bot and the engine together, and it
 * measures how far apart the levels are.
 *
 * Pure: no clock, no `Math.random`. The same options give the same result.
 */

import { EngineError, createSeededRng, rollDice } from '@tavli/engine';
import type { GameState, PlayerId, Turn, Variant } from '@tavli/engine';

import { BotError } from './errors';
import type { Bot, BotLevel } from './types';

/** One side in a simulation. */
export interface SimulationPlayer {
  readonly bot: Bot;
  readonly difficulty: BotLevel;
}

export interface TurnEvent {
  /** 0-based game index. */
  readonly game: number;
  /** The state with the dice set, before the turn. */
  readonly state: GameState;
  readonly turn: Turn;
}

/** A bot answered a variant's question (`Variant.prompt`). */
export interface AnswerEvent {
  readonly game: number;
  /** The state that waits for the answer. */
  readonly state: GameState;
  readonly player: PlayerId;
  readonly kind: string;
  readonly choice: string;
}

export interface SimulateOptions {
  readonly variant: Variant;
  /** Player A plays White, player B plays Black. */
  readonly bots: readonly [SimulationPlayer, SimulationPlayer];
  readonly games: number;
  /** Any safe integer. Each game gets its own seeds from it. */
  readonly seed: number;
  /** A game longer than this counts as a failure. Default 10,000 turns. */
  readonly maxTurns?: number;
  /** Called after each turn is checked. For logs and tests. */
  readonly onTurn?: (event: TurnEvent) => void;
  /** Called after each answer to a question (Plakoto "resign or play on"). */
  readonly onAnswer?: (event: AnswerEvent) => void;
}

/** A game that did not finish normally. */
export interface GameFailure {
  readonly game: number;
  /** `playGame` with this seed replays the game. */
  readonly gameSeed: number;
  readonly turnNumber: number;
  /** `ILLEGAL_TURN` (the bot chose a turn the engine rejects), another error code, or `TOO_LONG`. */
  readonly code: string;
  readonly message: string;
}

/** Pairs are `[player A, player B]`. */
export type Pair = readonly [number, number];

export interface SimulationResult {
  readonly games: number;
  /** Games that ended with a result. `games - completed` = `failures.length`. */
  readonly completed: number;
  readonly wins: Pair;
  readonly draws: number;
  /** Wins worth 1 point. */
  readonly mono: Pair;
  /** Wins worth 2 points or more (diplo, and a 3-point backgammon if the rules give one). */
  readonly diplo: Pair;
  /** Points won in total. */
  readonly points: Pair;
  /** Turns played in completed games, passes included. */
  readonly totalTurns: number;
  /** `totalTurns / completed` (0 if no game completed). */
  readonly averageTurns: number;
  /** Illegal turns chosen by a bot. Must be 0. */
  readonly illegalTurns: number;
  readonly failures: readonly GameFailure[];
}

export type GameOutcome =
  | {
      readonly ok: true;
      readonly winner: PlayerId | null;
      readonly points: number;
      readonly turns: number;
    }
  | {
      readonly ok: false;
      readonly turnNumber: number;
      readonly code: string;
      readonly message: string;
    };

const DEFAULT_MAX_TURNS = 10_000;
const UINT32 = 0x1_0000_0000;

function errorCode(error: unknown): string {
  if (error instanceof EngineError || error instanceof BotError) return error.code;
  return 'ERROR';
}

/**
 * Plays one game. White starts on even `game` numbers, Black on odd ones.
 * The dice RNG and the two bot RNGs are separate streams from `gameSeed`.
 * Each turn is checked by `variant.applyTurn`, which throws on an illegal
 * turn. When the variant asks a question after a turn (`Variant.prompt`),
 * the bot of the player asked answers it (`Bot.chooseAnswer`), and
 * `variant.answerPrompt` checks the answer. Errors do not escape: they come
 * back as `ok: false`.
 */
export function playGame(
  options: Omit<SimulateOptions, 'games' | 'seed'> & { readonly game: number },
  gameSeed: number,
): GameOutcome {
  const { variant, bots, game, onTurn, onAnswer } = options;
  const maxTurns = options.maxTurns ?? DEFAULT_MAX_TURNS;
  const diceRng = createSeededRng(gameSeed);
  const botRngs = {
    white: createSeededRng(gameSeed + UINT32),
    black: createSeededRng(gameSeed + 2 * UINT32),
  };
  const players = { white: bots[0], black: bots[1] };

  let state = variant.initialState({ startingPlayer: game % 2 === 0 ? 'white' : 'black' });
  const firstTurn = state.turnNumber;
  try {
    while (!variant.isGameOver(state)) {
      if (state.turnNumber - firstTurn >= maxTurns) {
        return {
          ok: false,
          turnNumber: state.turnNumber,
          code: 'TOO_LONG',
          message: `no result after ${maxTurns} turns`,
        };
      }
      const dice = rollDice(diceRng);
      const rolled: GameState = { ...state, dice };
      const player = players[state.toMove];
      const turn = player.bot.chooseTurn(rolled, dice, player.difficulty, {
        rng: botRngs[state.toMove],
      });
      const next = variant.applyTurn(rolled, turn);
      onTurn?.({ game, state: rolled, turn });
      state = next;
      // A question (Plakoto "resign or play on") waits for its answer.
      for (let prompt = variant.prompt?.(state) ?? null; prompt !== null;) {
        const asked = players[prompt.player];
        if (asked.bot.chooseAnswer === undefined || variant.answerPrompt === undefined) {
          throw new BotError('NOT_IMPLEMENTED', `the ${prompt.player} bot cannot answer questions`);
        }
        const choice = asked.bot.chooseAnswer(state, asked.difficulty, {
          rng: botRngs[prompt.player],
        });
        const answered = variant.answerPrompt(state, prompt.player, choice);
        onAnswer?.({ game, state, player: prompt.player, kind: prompt.kind, choice });
        state = answered;
        prompt = variant.isGameOver(state) ? null : (variant.prompt?.(state) ?? null);
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, turnNumber: state.turnNumber, code: errorCode(error), message };
  }
  const result = variant.result(state);
  if (result === null) {
    return {
      ok: false,
      turnNumber: state.turnNumber,
      code: 'NO_RESULT',
      message: 'game over without a result',
    };
  }
  return {
    ok: true,
    winner: result.winner,
    points: result.points,
    turns: state.turnNumber - firstTurn,
  };
}

/** Plays `games` games between `bots[0]` (A, White) and `bots[1]` (B, Black). */
export function simulate(options: SimulateOptions): SimulationResult {
  const { games } = options;
  if (!Number.isInteger(games) || games < 0) {
    throw new RangeError(`games must be a whole number, got ${games}`);
  }
  const seeds = createSeededRng(options.seed);
  const wins = [0, 0];
  const mono = [0, 0];
  const diplo = [0, 0];
  const points = [0, 0];
  let draws = 0;
  let totalTurns = 0;
  const failures: GameFailure[] = [];

  for (let game = 0; game < games; game += 1) {
    const gameSeed = seeds.nextUint32();
    const outcome = playGame({ ...options, game }, gameSeed);
    if (!outcome.ok) {
      const { turnNumber, code, message } = outcome;
      failures.push({ game, gameSeed, turnNumber, code, message });
      continue;
    }
    totalTurns += outcome.turns;
    if (outcome.winner === null) {
      draws += 1;
      continue;
    }
    const side = outcome.winner === 'white' ? 0 : 1;
    wins[side] = (wins[side] ?? 0) + 1;
    points[side] = (points[side] ?? 0) + outcome.points;
    const bucket = outcome.points >= 2 ? diplo : mono;
    bucket[side] = (bucket[side] ?? 0) + 1;
  }

  const completed = games - failures.length;
  const pair = (values: number[]): Pair => [values[0] ?? 0, values[1] ?? 0];
  return {
    games,
    completed,
    wins: pair(wins),
    draws,
    mono: pair(mono),
    diplo: pair(diplo),
    points: pair(points),
    totalTurns,
    averageTurns: completed === 0 ? 0 : totalTurns / completed,
    illegalTurns: failures.filter((f) => f.code === 'ILLEGAL_TURN').length,
    failures,
  };
}

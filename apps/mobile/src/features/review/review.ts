/**
 * The game review (#215): the biggest mistakes of a person in the game
 * that just ended. Pure TypeScript.
 *
 * It replays the game from the match log with the engine, and asks the
 * bot's Analyzer (`rankTurns`, 1 ply) to rank the turns of each roll a
 * person played. The loss of a turn is its `equityLoss`: how many points
 * per game the played turn is worse than the best turn, in the Analyzer's
 * view. The same log always gives the same review.
 *
 * - Only turns of a person count: vs the bot, the bot's turns are left
 *   out; in pass-and-play both players count.
 * - A turn with no choice (a pass, or a roll with one legal turn) is not
 *   graded. Answers to a variant's question (the Plakoto mother, the
 *   Acey-Deucey chosen double) are not turns, so they are never graded.
 * - A loss up to `MISTAKE_THRESHOLD` is not a mistake. The bands below
 *   name the rest (see `docs/architecture/board-screen.md`, "Game review").
 *
 * This file never checks a rule itself: the turns and the replay come
 * from the engine.
 */
import type { Analyzer } from '@tavli/bot';
import {
  VARIANT_REGISTRY,
  applyMatchAction,
  getVariant,
  positionKey,
  replay,
  sameTurn,
  type GameState,
  type MatchAction,
  type MatchFlow,
  type PlayerId,
  type Turn,
  type Variant,
} from '@tavli/engine';

/**
 * A loss (in points per game) up to this is not a mistake. The lines are
 * the ones GNU Backgammon uses for "doubtful", "bad" and "very bad" plays.
 */
export const MISTAKE_THRESHOLD = 0.04;
/** From this loss on, a mistake is "medium". */
export const MEDIUM_MISTAKE = 0.08;
/** From this loss on, a mistake is "big". */
export const BIG_MISTAKE = 0.16;
/** The review shows at most this many mistakes. */
export const MAX_MISTAKES = 3;

/** How bad a mistake is, in simple words. */
export type MistakeBand = 'small' | 'medium' | 'big';

/** The band of a loss, or `null` when it is not a mistake (up to `MISTAKE_THRESHOLD`). */
export function mistakeBand(loss: number): MistakeBand | null {
  if (!(loss > MISTAKE_THRESHOLD)) return null;
  if (loss >= BIG_MISTAKE) return 'big';
  if (loss >= MEDIUM_MISTAKE) return 'medium';
  return 'small';
}

/** One turn a player played, with a choice to make. */
export interface PlayedTurn {
  /** The state at the start of the turn, with its dice (`state.dice`). */
  readonly state: GameState;
  readonly turn: Turn;
}

/** A graded turn. */
export interface GradedTurn extends PlayedTurn {
  /** The best turn for the roll, in the Analyzer's view. */
  readonly best: Turn;
  /** How much worse the played turn is (points per game, 0 for the best). */
  readonly loss: number;
}

/** A turn of the review: a graded turn whose loss is a mistake. */
export interface Mistake extends GradedTurn {
  readonly band: MistakeBand;
}

/**
 * The turns of the last game in `flow` that `players` played after a roll,
 * oldest first. It replays the match log with the engine (the log holds
 * every die), and keeps the last game only. A pass is left out: the
 * player had nothing to choose.
 */
export function lastGameTurns(flow: MatchFlow, players: readonly PlayerId[]): PlayedTurn[] {
  const [start, ...events] = flow.log;
  if (start === undefined || start.type !== 'start') return [];
  let current = replay([start]);
  let turns: PlayedTurn[] = [];
  for (const event of events) {
    if (event.type === 'start') return [];
    const next = applyMatchAction(current, event as MatchAction);
    if (event.type === 'nextGame') {
      turns = [];
    } else {
      const turn = next.game.lastTurn;
      // A new turn ended. The flow keeps the same object until then.
      const ended = turn !== null && turn !== current.game.lastTurn;
      // While a player moves, the flow's state is the start of the turn,
      // with the roll. A roll with no legal move passes in one step, from
      // a state with no dice: it is never graded.
      const moving = current.game.phase === 'moving' || current.game.phase === 'awaiting-confirm';
      if (ended && moving && turn.moves.length > 0 && players.includes(turn.player)) {
        turns.push({ state: current.game.state, turn });
      }
    }
    current = next;
  }
  return turns;
}

/** A key for the state after `turn`: two turns that end the same way get the same key. */
function endKey(variant: Variant, state: GameState, turn: Turn): string {
  const after = variant.applyTurn(state, turn);
  return `${positionKey(after)}|${JSON.stringify(after.variantData)}`;
}

/**
 * Ranks the turns for the roll of `played` and finds the played one.
 * `null` when the roll had only one legal turn (no choice), or when the
 * played turn is not in the ranking (it never is: a safety net).
 */
export function gradeTurn(analyzer: Analyzer, played: PlayedTurn): GradedTurn | null {
  const { state, turn } = played;
  if (state.dice === null) return null;
  const ranked = analyzer.rankTurns(state, state.dice, { plies: 1 });
  const best = ranked[0];
  if (best === undefined || ranked.length < 2) return null;
  // The engine lists each way to end the turn once, so the played moves
  // may be in another order than the listed ones: then the end decides.
  let mine = ranked.find((r) => sameTurn(r.turn, turn));
  if (mine === undefined) {
    const variant = getVariant(VARIANT_REGISTRY, state.variant);
    const key = endKey(variant, state, turn);
    mine = ranked.find((r) => endKey(variant, state, r.turn) === key);
  }
  if (mine === undefined) return null;
  return { state, turn, best: best.turn, loss: mine.equityLoss };
}

/**
 * The mistakes to show: the turns with a loss above `MISTAKE_THRESHOLD`,
 * biggest first, at most `MAX_MISTAKES`. Equal losses keep the game order.
 */
export function biggestMistakes(graded: readonly GradedTurn[]): Mistake[] {
  const mistakes: Mistake[] = [];
  for (const turn of graded) {
    const band = mistakeBand(turn.loss);
    if (band !== null) mistakes.push({ ...turn, band });
  }
  // `sort` is stable: equal losses stay in the order they were played.
  mistakes.sort((a, b) => b.loss - a.loss);
  return mistakes.slice(0, MAX_MISTAKES);
}

/** The whole review at once (tests and tools; the screen grades one turn at a time). */
export function reviewGame(
  flow: MatchFlow,
  players: readonly PlayerId[],
  analyzer: Analyzer,
): Mistake[] {
  const graded = lastGameTurns(flow, players)
    .map((played) => gradeTurn(analyzer, played))
    .filter((g): g is GradedTurn => g !== null);
  return biggestMistakes(graded);
}

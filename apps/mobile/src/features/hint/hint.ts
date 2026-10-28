/**
 * The Hint (#209): the best turn for the roll, from the bot's Analyzer
 * (`createAnalyzer`, #206). Pure TypeScript.
 *
 * The Analyzer ranks full turns from the start of the turn. When the
 * player has already played part of the turn, the hint is the best way to
 * finish it: the best ranked turn whose end position the player can still
 * reach. The ways to finish come from the engine (`Variant.nextMoves`), so
 * this file never checks a rule itself. How deep the Analyzer looks
 * depends on the game (`hintPlies`, #219).
 */
import type { Analyzer } from '@tavli/bot';
import {
  VARIANT_REGISTRY,
  applyMoveToBoard,
  getVariant,
  type BoardState,
  type Dice,
  type GameFlow,
  type GameState,
  type Move,
  type PresetId,
  type RuleSet,
  type Variant,
} from '@tavli/engine';

/**
 * How deep the Hint looks, per rules preset (#219). 2 ply looks one roll
 * ahead and gives better hints, but it costs much more than 1 ply. One
 * 2-ply ranking in Node (`packages/bot/README.md`, "2-ply"):
 *
 * - Portes, Plakoto and Fevga: 2 ply. Median 34 ms (Portes), 87 ms
 *   (Plakoto) and 35 ms (Fevga), worst about 0.3 s. A phone is several
 *   times slower, and that still fits the 1 s hint budget.
 *   `packages/bot/src/analyzer-work.test.ts` bounds the work of one such
 *   hint per game.
 * - Asodio, every preset: 1 ply. The Kafeneio rules are fast in most
 *   positions (median 3 ms) but reach 1.1 s. The Acey-Deucey presets score
 *   with a heuristic, because their rules are not the net's: median
 *   0.45 s, worst about 7 s.
 *
 * Each game of a match plays with its own preset, so the preset names the
 * game. A new preset must pick a depth here (the type checks it).
 */
const HINT_PLIES: { readonly [P in PresetId]: 1 | 2 } = {
  portes: 2,
  tavli: 2,
  plakoto: 2,
  'plakoto.federation': 2,
  fevga: 2,
  'asodio.kafeneio': 1,
  'asodio.aceyDeuceyGreek': 1,
  'asodio.aceyDeuceyAmerican': 1,
};

/** The Analyzer depth (`plies`) of a hint in a game with these rules. */
export function hintPlies(rules: RuleSet): 1 | 2 {
  return HINT_PLIES[rules.presetId];
}

/** A short key for a board: two boards with the same checkers get the same key. */
export function boardKey(board: BoardState): string {
  const points = board.points.map((p) => `${p.white}.${p.black}.${p.pinned ?? ''}`).join(',');
  const side = (v: { white: number; black: number }) => `${v.white}.${v.black}`;
  return `${points}|${side(board.bar)}|${side(board.outside)}|${side(board.off)}`;
}

/** The board after `moves` of the player to move, from the start of the turn. */
function boardAfter(state: GameState, moves: readonly Move[]): BoardState {
  const direction = state.rules.movement.direction;
  return moves.reduce(
    (board, move) => applyMoveToBoard(board, state.toMove, move, direction),
    state.board,
  );
}

/** The game waits for a move of this turn: the phase is `moving`, with dice. */
function movingDice(game: GameFlow): Dice | null {
  return game.phase === 'moving' ? game.state.dice : null;
}

/**
 * The ways to finish the turn from the moves played so far, one per end
 * position (by `boardKey`): the moves still to play, in order. It stops
 * once it has found `limit` end positions.
 */
export function turnFinishes(
  game: GameFlow,
  limit = Number.POSITIVE_INFINITY,
  variant: Variant = getVariant(VARIANT_REGISTRY, game.state.variant),
): ReadonlyMap<string, readonly Move[]> {
  const found = new Map<string, readonly Move[]>();
  const dice = movingDice(game);
  if (dice === null) return found;
  const { state, played } = game;
  const direction = state.rules.movement.direction;
  // Two orders that use the same dice and reach the same board go on the same way.
  const seen = new Set<string>();
  const walk = (board: BoardState, rest: readonly Move[]) => {
    if (found.size >= limit) return;
    const all = [...played, ...rest];
    const used = all
      .map((m) => m.die)
      .sort()
      .join('');
    const key = `${boardKey(board)}|${used}`;
    if (seen.has(key)) return;
    seen.add(key);
    const next = variant.nextMoves(state, dice, all);
    if (next.length === 0) {
      const end = boardKey(board);
      if (!found.has(end)) found.set(end, rest);
      return;
    }
    for (const move of next) {
      walk(applyMoveToBoard(board, state.toMove, move, direction), [...rest, move]);
    }
  };
  walk(boardAfter(state, played), []);
  return found;
}

/**
 * True when a hint can help: the game waits for a move, no question of the
 * variant is open, and the rest of the turn can end on more than one board
 * (by `boardKey`). The screen also checks whose turn it is.
 */
export function hintHasChoice(
  game: GameFlow,
  variant: Variant = getVariant(VARIANT_REGISTRY, game.state.variant),
): boolean {
  const dice = movingDice(game);
  if (dice === null) return false;
  // A question (Plakoto's mother, the Acey-Deucey double) waits for its answer.
  if (variant.prompt?.(game.state)) return false;
  // Count end positions, before and after the first move alike: two plays
  // that end on the same board are one choice.
  if (game.played.length === 0) {
    const ends = new Set<string>();
    for (const turn of variant.legalTurns(game.state, dice)) {
      ends.add(boardKey(boardAfter(game.state, turn.moves)));
      if (ends.size > 1) return true;
    }
    return false;
  }
  return turnFinishes(game, 2, variant).size > 1;
}

/**
 * The best rest of the turn: the moves to play now, in order. `null` when
 * the game does not wait for a move.
 *
 * It asks the Analyzer for the best turn only (`top: 1`), at the depth of
 * `hintPlies`. If the moves played so far cannot reach that turn's end
 * position, it takes the best ranked turn that they can still reach. At
 * 2 ply `top` saves almost nothing (every candidate gets the deeper look
 * anyway), so after a move it ranks every turn once, not twice.
 */
export function bestRest(
  game: GameFlow,
  analyzer: Analyzer,
  variant: Variant = getVariant(VARIANT_REGISTRY, game.state.variant),
): readonly Move[] | null {
  const dice = movingDice(game);
  if (dice === null) return null;
  const { state, played } = game;
  const plies = hintPlies(state.rules);
  const allAtOnce = played.length > 0 && plies === 2;
  const ranking = analyzer.rankTurns(state, dice, allAtOnce ? { plies } : { plies, top: 1 });
  const best = ranking[0];
  if (best === undefined) return null;
  if (played.length === 0) return best.turn.moves;

  const finishes = turnFinishes(game, Number.POSITIVE_INFINITY, variant);
  const reach = (moves: readonly Move[]) => finishes.get(boardKey(boardAfter(state, moves)));
  const direct = reach(best.turn.moves);
  if (direct !== undefined) return direct;
  for (const ranked of allAtOnce ? ranking : analyzer.rankTurns(state, dice, { plies })) {
    const rest = reach(ranked.turn.moves);
    if (rest !== undefined) return rest;
  }
  return null;
}

/**
 * The moves of a hint (or of a turn in the game review, #215), one group per
 * checker run: a move that goes on from where the move before it landed
 * joins it ("13 → 10 → 5"). The order stays the order of the turn.
 */
export function hintGroups(moves: readonly Move[]): Move[][] {
  const groups: Move[][] = [];
  for (const move of moves) {
    const last = groups[groups.length - 1];
    const before = last?.[last.length - 1];
    if (last !== undefined && before !== undefined && before.to === move.from) last.push(move);
    else groups.push([move]);
  }
  return groups;
}

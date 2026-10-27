/**
 * The mother (μάνα) rule: `docs/rules/plakoto.md`, "Mother (μάνα) rule" and
 * the flags `motherRule`, `motherCheckTiming` and `mutualMotherPin`.
 *
 * A player's mother is pinned when the player's lone checker on own point 24
 * has opponent checkers on top. (A lone checker on own 24 is always the
 * mother: checkers never go back, so the others have left.)
 *
 * What a pinned mother does, by `motherRule`:
 *
 * - `"offerConcede"` (app default): the pinned player is asked "resign or
 *   play on". Resign: the opponent wins 2 points. Play on: the game goes on
 *   with no special result for that player's mother.
 * - `"federation"`: the pinner wins 2 points once the pinner has no checker
 *   left on own point 24. Both mothers pinned: a draw.
 * - `"instant"`: the pinner wins 2 points at once.
 * - `"none"`: nothing special.
 *
 * Both mothers pinned (only possible with `"offerConcede"` or
 * `"federation"`) is a draw (`mutualMotherPin: "draw"`).
 *
 * The result is read from the board, so it needs no stored data. Only the
 * `"offerConcede"` question and its answers live in `state.variantData`
 * (`MotherData`).
 */

import type { BoardState } from '../../board';
import type { DieValue } from '../../dice';
import { checkersAt, pointAt } from '../../board';
import { EngineError } from '../../errors';
import { ownToAbsolute } from '../../numbering';
import { PLAYERS, isPlayerId, opponent } from '../../player';
import type { PlayerId } from '../../player';
import type { MotherRules } from '../../rules';
import type { GameState, JsonObject } from '../../state';
import type { GameResult } from '../../variant';
import { FREE, MINE, OPP, PIN, THEIRS } from './position';
import type { Position } from './position';

const DIRECTION = 'contrary';

/** The `motherRule: "offerConcede"` question. */
export const MOTHER_PROMPT_KIND = 'motherPinned';
export const MOTHER_PROMPT_CHOICES = ['resign', 'playOn'] as const;

/** True when `player`'s mother is pinned. */
export function isMotherPinned(board: BoardState, player: PlayerId): boolean {
  return pointAt(board, ownToAbsolute(24, player, DIRECTION)).pinned === player;
}

/**
 * The mother-rule result of a board, or `null`. It does not look at borne-off
 * checkers or at a resignation.
 */
export function motherResult(board: BoardState, rules: MotherRules): GameResult | null {
  if (rules.motherRule === 'none') return null;
  const white = isMotherPinned(board, 'white');
  const black = isMotherPinned(board, 'black');
  // Federation rule 3 and flag mutualMotherPin. `instant` never gets here:
  // the first pin ends the game.
  if (white && black) return { winner: null, points: 0, reason: 'bothMothersPinned' };
  for (const loser of PLAYERS) {
    if (!(loser === 'white' ? white : black)) continue;
    const winner = opponent(loser);
    if (rules.motherRule === 'instant') return { winner, points: 2, reason: 'motherPinned' };
    // Federation rule 1: the pinner has no checkers left on own point 24.
    if (rules.motherRule === 'federation' && checkersAt(board, winner, 24, DIRECTION) === 0) {
      return { winner, points: 2, reason: 'motherPinned' };
    }
  }
  return null;
}

/**
 * A test on the mover's position in the middle of a turn: has the game
 * just ended by the mother rule? Used with `motherCheckTiming:
 * "afterEachMove"`. Only the mover's moves change the board during a turn,
 * so only the opponent's mother can become pinned.
 */
export interface MidTurnEnd {
  /**
   * Cheap test on the turn start: can this turn end the game at all? It may
   * say yes when the answer is no (it does not look at closed points), but
   * never the other way round. `dice` are the single-die moves.
   */
  readonly possible: (pos: Position, dice: readonly DieValue[]) => boolean;
  /** True when the game is over in `pos`. */
  readonly ended: (pos: Position) => boolean;
}

/** The opponent's mother is pinned (opponent's own 24 = mover's own 1). */
export function opponentMotherPinned(pos: Position): boolean {
  return (pos[PIN + 1] as number) >= THEIRS;
}

/**
 * True when the mover may pin the opponent's mother this turn: it is alone
 * and free, and some checker is a dice sum away from the mover's point 1.
 */
function mayPinMother(pos: Position, dice: readonly DieValue[]): boolean {
  if (pos[OPP + 1] !== 1 || pos[PIN + 1] !== FREE) return false;
  const [a = 0, b = 0] = dice;
  const sums = dice.length === 4 ? [a, 2 * a, 3 * a, 4 * a] : [a, b, a + b];
  return sums.some((sum) => sum <= 23 && (pos[1 + sum] as number) > 0);
}

/** True when the mover may move every checker off own point 24 this turn. */
function mayLeaveStart(pos: Position, dice: readonly DieValue[]): boolean {
  return (pos[24] as number) <= dice.length;
}

function ownMotherPinned(pos: Position): boolean {
  return pos[PIN + 24] === MINE;
}

/** The mid-turn test for these rules, or `null` when a game never ends mid-turn. */
export function midTurnEnd(rules: MotherRules): MidTurnEnd | null {
  if (rules.motherCheckTiming !== 'afterEachMove') return null;
  switch (rules.motherRule) {
    case 'none':
      return null;
    case 'instant':
      return { possible: mayPinMother, ended: opponentMotherPinned };
    case 'federation':
      return {
        possible: (pos, dice) =>
          // Rule 1 waits for the pinner's own 24 to empty; or a new pin ends
          // the game (rule 1, or the draw of rule 3).
          (opponentMotherPinned(pos) && mayLeaveStart(pos, dice)) ||
          (mayPinMother(pos, dice) && (mayLeaveStart(pos, dice) || ownMotherPinned(pos))),
        ended: (pos) => opponentMotherPinned(pos) && (pos[24] === 0 || ownMotherPinned(pos)),
      };
    case 'offerConcede':
      // Only the draw ends the game here; a single pinned mother is a question.
      return {
        possible: (pos, dice) => ownMotherPinned(pos) && mayPinMother(pos, dice),
        ended: (pos) => opponentMotherPinned(pos) && ownMotherPinned(pos),
      };
  }
}

// ---------------------------------------------------------------------------
// `state.variantData` for `motherRule: "offerConcede"`.

export interface MotherData {
  /** The player who must answer "resign or play on" now, or `null`. */
  readonly offer: PlayerId | null;
  /** Players who chose "play on". They are not asked again in this game. */
  readonly playOn: readonly PlayerId[];
  /** The player who chose "resign". The opponent wins 2 points. */
  readonly conceded: PlayerId | null;
}

const NO_DATA: MotherData = { offer: null, playOn: [], conceded: null };

function badData(message: string): never {
  throw new EngineError('INVALID_STATE', message, 'state.variantData');
}

function playerOrNull(value: unknown, field: string): PlayerId | null {
  if (value !== null && !isPlayerId(value)) badData(`${field} must be null, "white" or "black"`);
  return value;
}

/** Reads and checks the Plakoto data of a state. `null` means nothing yet. */
export function readMotherData(state: GameState): MotherData {
  const data = state.variantData;
  if (data === null) return NO_DATA;
  const keys = Object.keys(data).sort().join(',');
  if (keys !== 'conceded,offer,playOn') badData('expected { offer, playOn, conceded }');
  const playOn = data['playOn'];
  if (
    !Array.isArray(playOn) ||
    !playOn.every(isPlayerId) ||
    new Set(playOn).size !== playOn.length
  ) {
    badData('playOn must be a list of different players');
  }
  return {
    offer: playerOrNull(data['offer'], 'offer'),
    playOn,
    conceded: playerOrNull(data['conceded'], 'conceded'),
  };
}

/** The data as JSON for `state.variantData`: `null` when there is nothing to keep. */
export function writeMotherData(data: MotherData): JsonObject | null {
  if (data.offer === null && data.playOn.length === 0 && data.conceded === null) return null;
  return { offer: data.offer, playOn: [...data.playOn], conceded: data.conceded };
}

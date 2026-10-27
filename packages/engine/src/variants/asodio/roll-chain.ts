/**
 * Asodio roll chains: one player may roll several times in a row
 * (`asodio.md`, "Turn & dice rules" 3–5). Each roll is its own `Turn`;
 * `applyTurn` keeps the same player to move when the roll gives another
 * one. Only the chosen double after a 1-2 needs stored data, in
 * `state.variantData`:
 *
 * - `null`: nothing pending.
 * - `{ chooseDouble: true }`: the player to move played a 1-2 and must now
 *   choose a double (`Variant.prompt`, kind `'chooseDouble'`).
 * - `{ chosenDouble: d }`: the player chose `d-d`; `state.dice` is
 *   `[d, d]` and the next turn plays it.
 *
 * Owner version (`asodio.kafeneio`, answer A3): no chain at all. The
 * Acey-Deucey presets turn it on.
 */

import type { Dice, DieValue } from '../../dice';
import { DIE_VALUES, isDieValue } from '../../dice';
import { EngineError } from '../../errors';
import type { RuleSet } from '../../rules';
import type { GameState, JsonObject } from '../../state';

/** The question after a 1-2 with `aceDeuceChoosesDouble`. */
export const CHOOSE_DOUBLE_KIND = 'chooseDouble';
/** The answers: the die of the double, as text. */
export const CHOOSE_DOUBLE_CHOICES: readonly string[] = DIE_VALUES.map(String);

export type ChainData =
  | { readonly kind: 'none' }
  | { readonly kind: 'choose' }
  | { readonly kind: 'chosen'; readonly die: DieValue };

function bad(message: string): never {
  throw new EngineError('INVALID_STATE', message, 'state.variantData');
}

/** Reads and checks `state.variantData`. Throws `INVALID_STATE` for data Asodio never writes. */
export function readChain(state: GameState): ChainData {
  const data = state.variantData;
  if (data === null) return { kind: 'none' };
  const keys = Object.keys(data);
  if (keys.length !== 1) bad('expected { chooseDouble } or { chosenDouble }');
  if (!state.rules.specialRolls.aceDeuceChoosesDouble) {
    bad('a chosen double needs specialRolls.aceDeuceChoosesDouble');
  }
  if (keys[0] === 'chooseDouble') {
    if (data['chooseDouble'] !== true) bad('chooseDouble must be true');
    if (state.dice !== null) bad('no dice while the double is chosen');
    return { kind: 'choose' };
  }
  if (keys[0] === 'chosenDouble') {
    const die = data['chosenDouble'];
    if (!isDieValue(die)) bad('chosenDouble must be a die value from 1 to 6');
    if (state.dice !== null && (state.dice[0] !== die || state.dice[1] !== die)) {
      bad(`the dice must be the chosen double ${die}-${die}`);
    }
    return { kind: 'chosen', die };
  }
  return bad('expected { chooseDouble } or { chosenDouble }');
}

/** What the turn just played gives the same player. */
export type Chain = 'next' | 'rollAgain' | 'chooseDouble';

/**
 * After a turn with `dice` and `moves` moves (`asodio.md`, "Turn & dice
 * rules"):
 *
 * - The chosen double: roll again with `aceDeuceExtraRoll`, only if all
 *   four moves were played (3.3, 3.6).
 * - A 1-2 with both dice played: choose a double
 *   (`aceDeuceChoosesDouble`), else roll again with `aceDeuceExtraRoll`. If
 *   the 1 or the 2 cannot be played, the turn ends (3.5).
 * - Another double: roll again with `doublesGiveExtraRoll`, only if all
 *   four moves were played (4).
 */
export function chainAfter(rules: RuleSet, data: ChainData, dice: Dice, moves: number): Chain {
  const { aceDeuceExtraRoll, doublesGiveExtraRoll } = rules.extraRolls;
  if (data.kind === 'chosen') return moves === 4 && aceDeuceExtraRoll ? 'rollAgain' : 'next';
  const [a, b] = dice;
  if (a !== b) {
    // a + b = 3 with two different dice is a 1-2.
    if (a + b !== 3 || moves < 2) return 'next';
    if (rules.specialRolls.aceDeuceChoosesDouble) return 'chooseDouble';
    return aceDeuceExtraRoll ? 'rollAgain' : 'next';
  }
  return moves === 4 && doublesGiveExtraRoll ? 'rollAgain' : 'next';
}

/** The data to store for a chain step. */
export function writeChain(chain: Chain): JsonObject | null {
  return chain === 'chooseDouble' ? { chooseDouble: true } : null;
}

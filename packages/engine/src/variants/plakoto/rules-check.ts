/**
 * Which `RuleSet` flags Plakoto can play.
 *
 * Plakoto reads these flags:
 *
 * - `movement.higherDieRule` (`tavli-match.md`);
 * - `capture.intermediatePinBlocks`, `bearOff.bearOffWhilePinned`,
 *   `mother.motherRule`, `mother.motherCheckTiming` and
 *   `mother.mutualMotherPin` (`plakoto.md`);
 * - `match.*`: not used by the variant. The match and the turn flow read
 *   them, so any valid value is fine.
 *
 * `mother.mutualMotherPin: "replay"` (replay the same game after both
 * mothers are pinned) is not built yet: it throws `NOT_SUPPORTED` when the
 * mother rule can lead to it (`"offerConcede"` or `"federation"`).
 *
 * Every other flag belongs to another game. It must keep the value of the
 * `plakoto` preset, or the variant throws `RULES_CONFLICT`, so a flag is
 * never ignored in silence.
 */

import { EngineError } from '../../errors';
import { getPreset } from '../../presets';
import { RULE_GROUPS } from '../../rules';
import type { RuleSet } from '../../rules';
import { validateRules } from '../../rules-validate';

const PLAKOTO_FLAGS = new Set([
  'movement.higherDieRule',
  'capture.intermediatePinBlocks',
  'bearOff.bearOffWhilePinned',
  'mother.motherRule',
  'mother.motherCheckTiming',
  'mother.mutualMotherPin',
]);

const FIXED: readonly (readonly [string, string, unknown])[] = (() => {
  const preset = getPreset('plakoto') as unknown as Record<string, Record<string, unknown>>;
  const fixed: [string, string, unknown][] = [];
  for (const group of RULE_GROUPS) {
    if (group === 'match') continue;
    for (const [field, value] of Object.entries(preset[group] ?? {})) {
      if (!PLAKOTO_FLAGS.has(`${group}.${field}`)) fixed.push([group, field, value]);
    }
  }
  return fixed;
})();

const checked = new WeakSet<RuleSet>();

/**
 * Throws if Plakoto cannot play `rules`. Runs `validateRules` the first time
 * it sees a `RuleSet` object; later calls with the same object are free.
 */
export function checkPlakotoRules(rules: RuleSet): RuleSet {
  if (checked.has(rules)) return rules;
  validateRules(rules);
  const groups = rules as unknown as Record<string, Record<string, unknown>>;
  for (const [group, field, expected] of FIXED) {
    const actual = groups[group]?.[field];
    if (actual !== expected) {
      throw new EngineError(
        'RULES_CONFLICT',
        `Plakoto cannot play ${group}.${field} = ${JSON.stringify(actual)}; it needs ${JSON.stringify(expected)}`,
        `rules.${group}.${field}`,
      );
    }
  }
  const { motherRule, mutualMotherPin } = rules.mother;
  if (
    mutualMotherPin === 'replay' &&
    (motherRule === 'offerConcede' || motherRule === 'federation')
  ) {
    throw new EngineError(
      'NOT_SUPPORTED',
      'replaying the game after both mothers are pinned is not built yet',
      'rules.mother.mutualMotherPin',
    );
  }
  checked.add(rules);
  return rules;
}

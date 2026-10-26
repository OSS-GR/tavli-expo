/**
 * Which `RuleSet` flags Portes can play.
 *
 * Portes reads these flags:
 *
 * - `movement.higherDieRule` (`tavli-match.md`);
 * - `capture.noHitAndRunInHome` (`portes.md`, unverified house rule);
 * - `scoring.backgammonScores3` (`portes.md`);
 * - `match.*`: not used by the variant. The match and turn flow (#24, #25)
 *   read them, so any valid value is fine.
 *
 * `scoring.doublingCube` is a Portes flag, but the cube is not built yet:
 * `true` throws `NOT_SUPPORTED`.
 *
 * Every other flag belongs to another game. It must keep the value of the
 * `portes` preset, or the variant throws `RULES_CONFLICT`, so a flag is
 * never ignored in silence.
 */

import { EngineError } from '../../errors';
import { getPreset } from '../../presets';
import { RULE_GROUPS } from '../../rules';
import type { RuleSet } from '../../rules';
import { validateRules } from '../../rules-validate';

/** Flags Portes reads or leaves to the match flow, as `group.field`. */
const PORTES_FLAGS = new Set([
  'movement.higherDieRule',
  'capture.noHitAndRunInHome',
  'scoring.backgammonScores3',
  'scoring.doublingCube',
]);

/** `[group, field, value]` for every flag that must keep the `portes` preset value. */
const FIXED: readonly (readonly [string, string, unknown])[] = (() => {
  const preset = getPreset('portes') as unknown as Record<string, Record<string, unknown>>;
  const fixed: [string, string, unknown][] = [];
  for (const group of RULE_GROUPS) {
    if (group === 'match') continue;
    for (const [field, value] of Object.entries(preset[group] ?? {})) {
      if (!PORTES_FLAGS.has(`${group}.${field}`)) fixed.push([group, field, value]);
    }
  }
  return fixed;
})();

const checked = new WeakSet<RuleSet>();

/**
 * Throws if Portes cannot play `rules`. Runs `validateRules` the first time
 * it sees a `RuleSet` object; later calls with the same object are free.
 */
export function checkPortesRules(rules: RuleSet): RuleSet {
  if (checked.has(rules)) return rules;
  validateRules(rules);
  const groups = rules as unknown as Record<string, Record<string, unknown>>;
  for (const [group, field, expected] of FIXED) {
    const actual = groups[group]?.[field];
    if (actual !== expected) {
      throw new EngineError(
        'RULES_CONFLICT',
        `Portes cannot play ${group}.${field} = ${JSON.stringify(actual)}; it needs ${JSON.stringify(expected)}`,
        `rules.${group}.${field}`,
      );
    }
  }
  if (rules.scoring.doublingCube) {
    throw new EngineError(
      'NOT_SUPPORTED',
      'the doubling cube is not built yet',
      'rules.scoring.doublingCube',
    );
  }
  checked.add(rules);
  return rules;
}

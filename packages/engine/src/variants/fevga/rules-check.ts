/**
 * Which `RuleSet` flags Fevga can play.
 *
 * Fevga reads these flags (`fevga.md`, "House-rule variants (flags)", and
 * `tavli-match.md`):
 *
 * - `movement.higherDieRule`;
 * - `movement.runnerRule` and `movement.runnerTarget`;
 * - `primes.primeRulesOff`, `p1NoPrimeOwnStart`, `p2NoPrimeFrontOfMother`,
 *   `p2Window`, `p3MustLeaveMove` and `p3Priority`;
 * - `match.*`: not used by the variant. The match and turn flow read them,
 *   so any valid value is fine.
 *
 * Two Fevga flags are not built yet, because `fevga.md` does not say how
 * they fit into "Order of checks". Their non-default values throw
 * `NOT_SUPPORTED`:
 *
 * - `primes.noPrimeOwnHome: true`;
 * - `primes.primeCheckTiming: "afterEachMove"`.
 *
 * Every other flag belongs to another game. It must keep the value of the
 * `fevga` preset, or the variant throws `RULES_CONFLICT`, so a flag is
 * never ignored in silence.
 */

import { EngineError } from '../../errors';
import { getPreset } from '../../presets';
import { RULE_GROUPS } from '../../rules';
import type { RuleSet } from '../../rules';
import { validateRules } from '../../rules-validate';

/** Flags Fevga reads, as `group.field`. */
const FEVGA_FLAGS = new Set([
  'movement.higherDieRule',
  'movement.runnerRule',
  'movement.runnerTarget',
  'primes.primeRulesOff',
  'primes.p1NoPrimeOwnStart',
  'primes.p2NoPrimeFrontOfMother',
  'primes.p2Window',
  'primes.p3MustLeaveMove',
  'primes.p3Priority',
  'primes.noPrimeOwnHome',
  'primes.primeCheckTiming',
]);

/** `[group, field, value]` for every flag that must keep the `fevga` preset value. */
const FIXED: readonly (readonly [string, string, unknown])[] = (() => {
  const preset = getPreset('fevga') as unknown as Record<string, Record<string, unknown>>;
  const fixed: [string, string, unknown][] = [];
  for (const group of RULE_GROUPS) {
    if (group === 'match') continue;
    for (const [field, value] of Object.entries(preset[group] ?? {})) {
      if (!FEVGA_FLAGS.has(`${group}.${field}`)) fixed.push([group, field, value]);
    }
  }
  return fixed;
})();

const checked = new WeakSet<RuleSet>();

function notSupported(path: string, message: string): never {
  throw new EngineError('NOT_SUPPORTED', message, `rules.${path}`);
}

/**
 * Throws if Fevga cannot play `rules`. Runs `validateRules` the first time
 * it sees a `RuleSet` object; later calls with the same object are free.
 */
export function checkFevgaRules(rules: RuleSet): RuleSet {
  if (checked.has(rules)) return rules;
  validateRules(rules);
  const groups = rules as unknown as Record<string, Record<string, unknown>>;
  for (const [group, field, expected] of FIXED) {
    const actual = groups[group]?.[field];
    if (actual !== expected) {
      throw new EngineError(
        'RULES_CONFLICT',
        `Fevga cannot play ${group}.${field} = ${JSON.stringify(actual)}; it needs ${JSON.stringify(expected)}`,
        `rules.${group}.${field}`,
      );
    }
  }
  if (rules.primes.noPrimeOwnHome) {
    notSupported('primes.noPrimeOwnHome', 'noPrimeOwnHome is not built yet');
  }
  if (rules.primes.primeCheckTiming !== 'endOfTurn') {
    notSupported('primes.primeCheckTiming', 'primeCheckTiming "afterEachMove" is not built yet');
  }
  checked.add(rules);
  return rules;
}

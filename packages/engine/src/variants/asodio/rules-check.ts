/**
 * Which `RuleSet` flags Asodio can play.
 *
 * Asodio reads these flags (`asodio.md`, "House-rule variants (flags)", and
 * `tavli-match.md`):
 *
 * - `board.startPosition`: `"offBoard"` or `"allOnOwn24"` (the doc's
 *   `"opponentAcePoint"`). `"portes"` throws `RULES_CONFLICT`.
 * - `movement.higherDieRule`;
 * - `capture.captureMode`: `"pin"` or `"hit"`. `"none"` throws
 *   `RULES_CONFLICT`;
 * - `entry.*`: `firstEntryGate`, `firstEntryGateRolls`, `mustEnterAllFirst`,
 *   `moveWhileLoading`, `barEntryNeedsSpecial`;
 * - `quarters.*`: `quarterGathering`, `quarterLock`,
 *   `moveInsideFrozenQuarter`;
 * - `specialRolls.aceDeuceChoosesDouble`, `extraRolls.*`;
 * - `bearOff.exactBearOff` and `bearOff.bearOffWhilePinned` (pins only);
 * - `scoring.method` and `scoring.deadlock`;
 * - `match.*`: not used by the variant. The match and the turn flow read
 *   them, so any valid value is fine.
 *
 * Not built yet (`NOT_SUPPORTED`):
 *
 * - `capture.nominateBlot: true` (the opponent must hit a named blot);
 * - `specialRolls.complementaryDoubles: true`;
 * - `quarters.quarterGathering: true` with `quarterLock: false`. The doc
 *   does not say what gathering without the lock means (open question
 *   Q27);
 * - `scoring.doublingCube: true`.
 *
 * Every other flag belongs to another game. It must keep the value of the
 * `asodio.kafeneio` preset, or the variant throws `RULES_CONFLICT`, so a
 * flag is never ignored in silence.
 */

import { EngineError } from '../../errors';
import { getPreset } from '../../presets';
import { RULE_GROUPS } from '../../rules';
import type { RuleSet } from '../../rules';
import { validateRules } from '../../rules-validate';

/** Flags Asodio reads, as `group.field`. */
const ASODIO_FLAGS = new Set([
  'board.startPosition',
  'movement.higherDieRule',
  'capture.captureMode',
  'capture.nominateBlot',
  'entry.firstEntryGate',
  'entry.firstEntryGateRolls',
  'entry.mustEnterAllFirst',
  'entry.moveWhileLoading',
  'entry.barEntryNeedsSpecial',
  'quarters.quarterGathering',
  'quarters.quarterLock',
  'quarters.moveInsideFrozenQuarter',
  'specialRolls.aceDeuceChoosesDouble',
  'specialRolls.complementaryDoubles',
  'extraRolls.aceDeuceExtraRoll',
  'extraRolls.doublesGiveExtraRoll',
  'bearOff.exactBearOff',
  'bearOff.bearOffWhilePinned',
  'scoring.method',
  'scoring.doublingCube',
  'scoring.deadlock',
]);

/** `[group, field, value]` for every flag that must keep the `asodio.kafeneio` preset value. */
const FIXED: readonly (readonly [string, string, unknown])[] = (() => {
  const preset = getPreset('asodio.kafeneio') as unknown as Record<string, Record<string, unknown>>;
  const fixed: [string, string, unknown][] = [];
  for (const group of RULE_GROUPS) {
    if (group === 'match') continue;
    for (const [field, value] of Object.entries(preset[group] ?? {})) {
      if (!ASODIO_FLAGS.has(`${group}.${field}`)) fixed.push([group, field, value]);
    }
  }
  return fixed;
})();

const checked = new WeakSet<RuleSet>();

function conflict(path: string, message: string): never {
  throw new EngineError('RULES_CONFLICT', message, `rules.${path}`);
}

function notSupported(path: string, message: string): never {
  throw new EngineError('NOT_SUPPORTED', message, `rules.${path}`);
}

/**
 * Throws if Asodio cannot play `rules`. Runs `validateRules` the first time
 * it sees a `RuleSet` object; later calls with the same object are free.
 */
export function checkAsodioRules(rules: RuleSet): RuleSet {
  if (checked.has(rules)) return rules;
  validateRules(rules);
  const groups = rules as unknown as Record<string, Record<string, unknown>>;
  for (const [group, field, expected] of FIXED) {
    const actual = groups[group]?.[field];
    if (actual !== expected) {
      conflict(
        `${group}.${field}`,
        `Asodio cannot play ${group}.${field} = ${JSON.stringify(actual)}; it needs ${JSON.stringify(expected)}`,
      );
    }
  }
  if (rules.board.startPosition === 'portes') {
    conflict(
      'board.startPosition',
      'Asodio starts off the board ("offBoard") or on own point 24 ("allOnOwn24")',
    );
  }
  if (rules.capture.captureMode === 'none') {
    conflict('capture.captureMode', 'Asodio pins ("pin") or hits ("hit") a lone checker');
  }
  if (rules.capture.nominateBlot) {
    notSupported('capture.nominateBlot', 'nominateBlot is not built yet');
  }
  if (rules.specialRolls.complementaryDoubles) {
    notSupported('specialRolls.complementaryDoubles', 'complementaryDoubles is not built yet');
  }
  if (rules.quarters.quarterGathering && !rules.quarters.quarterLock) {
    notSupported(
      'quarters.quarterGathering',
      'quarterGathering without quarterLock is not built yet; the rules doc does not say what it means',
    );
  }
  if (rules.scoring.doublingCube) {
    notSupported('scoring.doublingCube', 'the doubling cube is not built yet');
  }
  checked.add(rules);
  return rules;
}

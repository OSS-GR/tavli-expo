/**
 * Checks a `RuleSet` that came from outside (JSON, the database, overrides).
 *
 * Two steps:
 *
 * 1. Shape: every group and field is there, every value is allowed by
 *    `RULE_SCHEMA`, and there are no unknown keys. Fails with
 *    `INVALID_RULES`.
 * 2. Combinations: the flags in `RULE_CONSTRAINTS` must fit together.
 *    Fails with `RULES_CONFLICT`. The path points at the flag to change.
 */

import { EngineError } from './errors';
import { RULE_GROUPS, RULE_SCHEMA, isPresetId } from './rules';
import type { FieldSpec, RuleSet } from './rules';

function fail(path: string, message: string): never {
  throw new EngineError('INVALID_RULES', message, path);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function record(value: unknown, path: string, keys: readonly string[]): Record<string, unknown> {
  if (!isPlainObject(value)) fail(path, 'expected an object');
  for (const key of keys) {
    if (!Object.hasOwn(value, key)) fail(`${path}.${key}`, 'missing field');
  }
  for (const key of Object.keys(value)) {
    if (!keys.includes(key)) fail(`${path}.${key}`, 'unknown field');
  }
  return value;
}

function quoted(values: readonly string[]): string {
  return values.map((v) => `"${v}"`).join(', ');
}

function field(spec: FieldSpec, value: unknown, path: string): unknown {
  switch (spec.kind) {
    case 'boolean':
      if (typeof value !== 'boolean') fail(path, 'expected true or false');
      return value;
    case 'enum':
      if (typeof value !== 'string' || !spec.values.includes(value)) {
        fail(path, `expected one of ${quoted(spec.values)}`);
      }
      return value;
    case 'integer':
      if (!Number.isSafeInteger(value) || (value as number) < spec.min) {
        fail(path, `expected an integer ≥ ${spec.min}`);
      }
      return value;
    case 'list': {
      if (!Array.isArray(value)) fail(path, 'expected a list');
      if (value.length < spec.minLength || value.length > spec.maxLength) {
        fail(path, `expected ${spec.minLength} to ${spec.maxLength} entries`);
      }
      return value.map((item: unknown, i) => {
        if (typeof item !== 'string' || !spec.values.includes(item)) {
          fail(`${path}[${i}]`, `expected one of ${quoted(spec.values)}`);
        }
        return item;
      });
    }
  }
}

/** One rule about which flags may be used together. */
export interface RuleConstraint {
  /** Stable id, for tests and docs. */
  readonly id: string;
  /** The flag to change when the rule is broken, as `group.field`. */
  readonly flag: string;
  /** What the rule says, in simple English. Also the error message. */
  readonly message: string;
  /** True when `rules` breaks this rule. */
  readonly broken: (rules: RuleSet) => boolean;
}

/**
 * Every combination rule `validateRules` enforces. The README lists them
 * too. A flag that only means something under another setting must stay at
 * its neutral value without it, so bad custom rules fail early.
 */
export const RULE_CONSTRAINTS: readonly RuleConstraint[] = [
  {
    id: 'hitAndRunNeedsHit',
    flag: 'capture.noHitAndRunInHome',
    message: 'noHitAndRunInHome needs captureMode "hit"',
    broken: (r) => r.capture.noHitAndRunInHome && r.capture.captureMode !== 'hit',
  },
  {
    id: 'nominateBlotNeedsHit',
    flag: 'capture.nominateBlot',
    message: 'nominateBlot needs captureMode "hit" (the opponent must hit the named blot)',
    broken: (r) => r.capture.nominateBlot && r.capture.captureMode !== 'hit',
  },
  {
    id: 'barEntryNeedsHit',
    flag: 'entry.barEntryNeedsSpecial',
    message: 'barEntryNeedsSpecial needs captureMode "hit"; only hit checkers go to the bar',
    broken: (r) => r.entry.barEntryNeedsSpecial && r.capture.captureMode !== 'hit',
  },
  {
    id: 'intermediatePinNeedsPin',
    flag: 'capture.intermediatePinBlocks',
    message: 'intermediatePinBlocks needs captureMode "pin"',
    broken: (r) => r.capture.intermediatePinBlocks && r.capture.captureMode !== 'pin',
  },
  {
    id: 'bearOffWhilePinnedNeedsPin',
    flag: 'bearOff.bearOffWhilePinned',
    message: 'bearOffWhilePinned needs captureMode "pin"',
    broken: (r) => r.bearOff.bearOffWhilePinned && r.capture.captureMode !== 'pin',
  },
  {
    id: 'entryGateNeedsOffBoard',
    flag: 'entry.firstEntryGate',
    message: 'firstEntryGate needs startPosition "offBoard"; there is nothing to enter',
    broken: (r) => r.entry.firstEntryGate && r.board.startPosition !== 'offBoard',
  },
  {
    id: 'enterAllFirstNeedsOffBoard',
    flag: 'entry.mustEnterAllFirst',
    message: 'mustEnterAllFirst needs startPosition "offBoard"; there is nothing to enter',
    broken: (r) => r.entry.mustEnterAllFirst && r.board.startPosition !== 'offBoard',
  },
  {
    id: 'loadingLockNeedsEnterAllFirst',
    flag: 'entry.moveWhileLoading',
    message:
      'moveWhileLoading false needs mustEnterAllFirst true; without it, entered checkers may always move',
    broken: (r) => !r.entry.moveWhileLoading && !r.entry.mustEnterAllFirst,
  },
  {
    id: 'quarterLockNeedsGathering',
    flag: 'quarters.quarterGathering',
    message: 'quarterLock needs quarterGathering; the lock is the strict form of gathering',
    broken: (r) => r.quarters.quarterLock && !r.quarters.quarterGathering,
  },
  {
    id: 'quarterLockNeedsEnterAllFirst',
    flag: 'entry.mustEnterAllFirst',
    message:
      'quarterLock with startPosition "offBoard" needs mustEnterAllFirst; the starting quarter is locked until all 15 are in (asodio.md, phase 2.1)',
    broken: (r) =>
      r.quarters.quarterLock && r.board.startPosition === 'offBoard' && !r.entry.mustEnterAllFirst,
  },
  {
    id: 'frozenMoveNeedsLock',
    flag: 'quarters.moveInsideFrozenQuarter',
    message: 'moveInsideFrozenQuarter needs quarterLock',
    broken: (r) => r.quarters.moveInsideFrozenQuarter && !r.quarters.quarterLock,
  },
  {
    id: 'runnerNeedsParallel',
    flag: 'movement.runnerRule',
    message: 'runnerRule needs direction "parallel"; its target is the opponent start (fevga.md)',
    broken: (r) => r.movement.runnerRule && r.movement.direction !== 'parallel',
  },
  {
    id: 'runnerNeedsStartStack',
    flag: 'movement.runnerRule',
    message: 'runnerRule needs startPosition "allOnOwn24"; the runner is the first checker off 24',
    broken: (r) => r.movement.runnerRule && r.board.startPosition !== 'allOnOwn24',
  },
  {
    id: 'runnerBlocksGathering',
    flag: 'quarters.quarterGathering',
    message:
      'runnerRule and quarterGathering cannot work together: the runner must leave the quarter alone',
    broken: (r) => r.movement.runnerRule && r.quarters.quarterGathering,
  },
  {
    id: 'p2NeedsParallel',
    flag: 'primes.p2NoPrimeFrontOfMother',
    message: 'p2NoPrimeFrontOfMother needs direction "parallel"; its window is defined for Fevga',
    broken: (r) => r.primes.p2NoPrimeFrontOfMother && r.movement.direction !== 'parallel',
  },
  {
    id: 'primeRulesOffMeansOff',
    flag: 'primes.primeRulesOff',
    message:
      'primeRulesOff turns off P1, P2, P3 and noPrimeOwnHome; set p1NoPrimeOwnStart, p2NoPrimeFrontOfMother, p3MustLeaveMove and noPrimeOwnHome to false too',
    broken: (r) =>
      r.primes.primeRulesOff &&
      (r.primes.p1NoPrimeOwnStart ||
        r.primes.p2NoPrimeFrontOfMother ||
        r.primes.p3MustLeaveMove ||
        r.primes.noPrimeOwnHome),
  },
  {
    id: 'motherNeedsPin',
    flag: 'mother.motherRule',
    message: 'motherRule other than "none" needs captureMode "pin"; a mother can only be pinned',
    broken: (r) => r.mother.motherRule !== 'none' && r.capture.captureMode !== 'pin',
  },
  {
    id: 'motherNeedsStartStack',
    flag: 'mother.motherRule',
    message:
      'motherRule other than "none" needs startPosition "allOnOwn24"; the mother is the last checker on own 24',
    broken: (r) => r.mother.motherRule !== 'none' && r.board.startPosition !== 'allOnOwn24',
  },
  {
    id: 'backgammonNeedsTavliScoring',
    flag: 'scoring.backgammonScores3',
    message: 'backgammonScores3 needs scoring method "tavli"',
    broken: (r) => r.scoring.backgammonScores3 && r.scoring.method !== 'tavli',
  },
];

/**
 * Checks `value` and returns a fresh, typed `RuleSet`. Throws
 * `EngineError('INVALID_RULES')` for a bad shape or
 * `EngineError('RULES_CONFLICT')` for flags that do not fit together. The
 * error's `path` starts with `path` (for example `rules.capture.captureMode`).
 */
export function validateRules(value: unknown, path = 'rules'): RuleSet {
  const raw = record(value, path, ['presetId', 'version', ...RULE_GROUPS]);
  const presetId = raw['presetId'];
  if (!isPresetId(presetId)) fail(`${path}.presetId`, 'expected a known preset id');
  const version = raw['version'];
  if (!Number.isSafeInteger(version) || (version as number) < 1) {
    fail(`${path}.version`, 'expected an integer ≥ 1');
  }
  const out: Record<string, unknown> = { presetId, version };
  for (const group of RULE_GROUPS) {
    const specs = RULE_SCHEMA[group] as Readonly<Record<string, FieldSpec>>;
    const keys = Object.keys(specs);
    const rawGroup = record(raw[group], `${path}.${group}`, keys);
    const copy: Record<string, unknown> = {};
    for (const key of keys) {
      const spec = specs[key];
      if (spec === undefined) continue;
      copy[key] = field(spec, rawGroup[key], `${path}.${group}.${key}`);
    }
    out[group] = copy;
  }
  const rules = out as unknown as RuleSet;
  for (const constraint of RULE_CONSTRAINTS) {
    if (constraint.broken(rules)) {
      throw new EngineError(
        'RULES_CONFLICT',
        `${constraint.message} [${constraint.id}]`,
        `${path}.${constraint.flag}`,
      );
    }
  }
  return rules;
}

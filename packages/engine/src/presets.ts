/**
 * Rule presets and `resolveRules`.
 *
 * A preset is a complete, valid `RuleSet`. Every preset starts from
 * `NEUTRAL` (all special rules off, the shared `tavli-match.md` defaults)
 * and turns on what its game needs. The values come from the "House-rule
 * variants (flags)" tables in `docs/rules/`. `rules-docs.test.ts` reads those
 * tables and fails if a preset drifts from them.
 *
 * Bump a preset's `version` when you change any of its values.
 */

import { EngineError } from './errors';
import { isPresetId } from './rules';
import type { PresetId, RuleGroups, RuleOverrides, RuleSet } from './rules';
import { validateRules } from './rules-validate';
import type { StandardVariantId } from './state';

type Groups = { -readonly [G in keyof RuleGroups]: RuleGroups[G] };

/** Every flag off or at its shared default. Not a preset on its own. */
const NEUTRAL: RuleGroups = {
  board: { startPosition: 'portes' },
  movement: {
    direction: 'contrary',
    higherDieRule: true,
    runnerRule: false,
    runnerTarget: 'passMother',
  },
  capture: {
    captureMode: 'hit',
    noHitAndRunInHome: false,
    intermediatePinBlocks: false,
    nominateBlot: false,
  },
  entry: {
    firstEntryGate: false,
    firstEntryGateRolls: 'aceDeuceOrDouble',
    mustEnterAllFirst: false,
    moveWhileLoading: true,
    barEntryNeedsSpecial: false,
  },
  quarters: { quarterGathering: false, quarterLock: false, moveInsideFrozenQuarter: false },
  specialRolls: { aceDeuceChoosesDouble: false, complementaryDoubles: false },
  extraRolls: { aceDeuceExtraRoll: false, doublesGiveExtraRoll: false },
  bearOff: { exactBearOff: false, bearOffWhilePinned: false },
  primes: {
    primeRulesOff: false,
    p1NoPrimeOwnStart: false,
    p2NoPrimeFrontOfMother: false,
    p2Window: '6-11',
    p3MustLeaveMove: false,
    p3Priority: 'afterDiceRule',
    noPrimeOwnHome: false,
    primeCheckTiming: 'endOfTurn',
  },
  mother: { motherRule: 'none', motherCheckTiming: 'afterEachMove', mutualMotherPin: 'draw' },
  scoring: { method: 'tavli', backgammonScores3: false, doublingCube: false, deadlock: 'draw' },
  match: {
    targetPoints: 3,
    rotation: ['portes', 'plakoto', 'fevga'],
    openingRoll: 'useOpeningDice',
    nextGameStarter: 'previousWinner',
    afterDrawStarter: 'openingRoll',
    rematchStarter: 'lastGameWinner',
  },
};

function preset(presetId: PresetId, version: number, changes: RuleOverrides): RuleSet {
  const groups = { ...NEUTRAL } as Groups;
  for (const [group, fields] of Object.entries(changes)) {
    const name = group as keyof RuleGroups;
    (groups as Record<string, unknown>)[name] = { ...NEUTRAL[name], ...fields };
  }
  return deepFreeze({ presetId, version, ...groups });
}

/** A Portes match: Portes only (PM, #24). Version 2: rotation was P → Pl → F. */
const PORTES = preset('portes', 2, { match: { rotation: ['portes'] } });

/**
 * A Tavli match: the federation rotation Portes → Plakoto → Fevga
 * (`tavli-match.md`, "Match format"). A match preset: each game uses its
 * own default preset with these `match` flags (`gameRules` in `match.ts`).
 * Its other groups are the Portes values.
 */
const TAVLI = preset('tavli', 1, {});

const PLAKOTO = preset('plakoto', 1, {
  board: { startPosition: 'allOnOwn24' },
  capture: { captureMode: 'pin' },
  mother: { motherRule: 'offerConcede' },
});

const FEVGA = preset('fevga', 1, {
  board: { startPosition: 'allOnOwn24' },
  movement: { direction: 'parallel', runnerRule: true, runnerTarget: 'passMother' },
  capture: { captureMode: 'none' },
  primes: { p1NoPrimeOwnStart: true, p2NoPrimeFrontOfMother: true, p3MustLeaveMove: true },
});

/** The owner's Asodio (`asodio.md`, "Owner version", answers A1–A5). */
const ASODIO_KAFENEIO_CHANGES = {
  board: { startPosition: 'offBoard' },
  capture: { captureMode: 'pin' },
  entry: { firstEntryGate: true, mustEnterAllFirst: true, moveWhileLoading: false },
  quarters: { quarterGathering: true, quarterLock: true },
  match: { rotation: ['asodio'] },
} as const satisfies RuleOverrides;

/**
 * The research Acey-Deucey versions. The `asodio.md` "Presets" table lists
 * only a few flags for them. The rest follow the "What the sources say"
 * table: the owner's army rules (load all first, quarter lock) are off, and
 * a 1-2 gives a chosen double and an extra roll.
 */
const ACEY_DEUCEY_CHANGES = {
  board: { startPosition: 'offBoard' },
  capture: { captureMode: 'hit' },
  entry: { firstEntryGate: true },
  specialRolls: { aceDeuceChoosesDouble: true },
  extraRolls: { aceDeuceExtraRoll: true },
  match: { rotation: ['asodio'] },
} as const satisfies RuleOverrides;

const PRESETS: { readonly [P in PresetId]: RuleSet } = {
  portes: PORTES,
  tavli: TAVLI,
  plakoto: PLAKOTO,
  // ΕΟΠΤ 3.3.iii: instant double, or a draw when both mothers are pinned.
  'plakoto.federation': preset('plakoto.federation', 1, {
    board: { startPosition: 'allOnOwn24' },
    capture: { captureMode: 'pin' },
    mother: { motherRule: 'federation' },
  }),
  fevga: FEVGA,
  'asodio.kafeneio': preset('asodio.kafeneio', 1, ASODIO_KAFENEIO_CHANGES),
  'asodio.aceyDeuceyGreek': preset('asodio.aceyDeuceyGreek', 1, {
    ...ACEY_DEUCEY_CHANGES,
    entry: { firstEntryGate: true, barEntryNeedsSpecial: true },
    extraRolls: { aceDeuceExtraRoll: true, doublesGiveExtraRoll: true },
  }),
  'asodio.aceyDeuceyAmerican': preset('asodio.aceyDeuceyAmerican', 1, {
    ...ACEY_DEUCEY_CHANGES,
    entry: { firstEntryGate: false },
    scoring: { method: 'perChecker' },
  }),
};

/** The preset each standard game uses when nothing else is chosen. */
export const DEFAULT_PRESET_BY_GAME: { readonly [G in StandardVariantId]: PresetId } = {
  portes: 'portes',
  plakoto: 'plakoto',
  fevga: 'fevga',
  asodio: 'asodio.kafeneio',
};

/** A built-in preset. The object is frozen. Throws `UNKNOWN_PRESET` for an unknown id. */
export function getPreset(presetId: string): RuleSet {
  if (!isPresetId(presetId)) {
    throw new EngineError('UNKNOWN_PRESET', `no rules preset with id "${presetId}"`, 'presetId');
  }
  return PRESETS[presetId];
}

/**
 * Takes a preset, applies `overrides` on top (a deep merge: groups merge
 * field by field, lists replace), checks the result and returns a fresh
 * `RuleSet`.
 *
 * Throws `EngineError`:
 * - `UNKNOWN_PRESET`: no preset with this id.
 * - `INVALID_RULES`: an override has an unknown key or a bad value, or tries
 *   to set `presetId` or `version`.
 * - `RULES_CONFLICT`: the merged flags cannot work together (see
 *   `RULE_CONSTRAINTS`).
 */
export function resolveRules(presetId: string, overrides: RuleOverrides = {}): RuleSet {
  const base = getPreset(presetId);
  const merged = mergeOverrides(base, overrides as unknown, 'overrides');
  return validateRules(merged, 'rules');
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * Deep merge for plain JSON. Objects merge key by key; anything else
 * (lists, strings, numbers, booleans) replaces the base value. Only keys
 * the base already has are allowed, so a typo fails here with a clear path.
 */
function mergeOverrides(base: unknown, override: unknown, path: string): unknown {
  if (!isPlainObject(base)) return override;
  if (!isPlainObject(override)) {
    throw new EngineError('INVALID_RULES', 'expected an object', path);
  }
  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(override)) {
    if (value === undefined) continue;
    if (path === 'overrides' && (key === 'presetId' || key === 'version')) {
      throw new EngineError(
        'INVALID_RULES',
        `"${key}" comes from the preset and cannot be overridden; pick another preset instead`,
        `${path}.${key}`,
      );
    }
    if (!Object.hasOwn(base, key)) {
      throw new EngineError('INVALID_RULES', 'unknown field', `${path}.${key}`);
    }
    out[key] = mergeOverrides(base[key], value, `${path}.${key}`);
  }
  return out;
}

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null) {
    for (const item of Object.values(value)) deepFreeze(item);
    Object.freeze(value);
  }
  return value;
}

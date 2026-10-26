import { describe, expect, expectTypeOf, it } from 'vitest';

import { EngineError } from './errors';
import type { EngineErrorCode } from './errors';
import { DEFAULT_PRESET_BY_GAME, getPreset, resolveRules } from './presets';
import { PRESET_IDS, RULE_GROUPS, RULE_SCHEMA } from './rules';
import type { RuleGroups, RuleGroupsFromSchema, RuleOverrides, RuleSet } from './rules';
import { RULE_CONSTRAINTS, validateRules } from './rules-validate';
import { parseGameState, parseRules, serializeGameState, serializeRules } from './serialize';
import { STANDARD_VARIANT_IDS } from './state';
import { makeState } from './testing/fixtures';

function errorOf(fn: () => unknown): EngineError {
  try {
    fn();
  } catch (error) {
    if (error instanceof EngineError) return error;
    throw error;
  }
  throw new Error('expected an EngineError');
}

/** A JSON copy we can break on purpose. */
function rawRules(presetId: string = 'portes'): Record<string, Record<string, unknown>> {
  return JSON.parse(JSON.stringify(getPreset(presetId))) as Record<string, Record<string, unknown>>;
}

describe('RuleSet type and schema', () => {
  it('the schema describes exactly the RuleGroups type', () => {
    expectTypeOf<RuleGroupsFromSchema>().toEqualTypeOf<RuleGroups>();
  });

  it('has the twelve groups in a fixed order', () => {
    expect(RULE_GROUPS).toEqual([
      'board',
      'movement',
      'capture',
      'entry',
      'quarters',
      'specialRolls',
      'extraRolls',
      'bearOff',
      'primes',
      'mother',
      'scoring',
      'match',
    ]);
  });
});

describe('presets', () => {
  it('lists the built-in presets', () => {
    expect(PRESET_IDS).toEqual([
      'portes',
      'plakoto',
      'plakoto.federation',
      'fevga',
      'asodio.kafeneio',
      'asodio.aceyDeuceyGreek',
      'asodio.aceyDeuceyAmerican',
    ]);
  });

  it.each(PRESET_IDS)('%s validates, knows its id and is frozen', (id) => {
    const preset = getPreset(id);
    expect(validateRules(preset)).toEqual(preset);
    expect(preset.presetId).toBe(id);
    expect(preset.version).toBe(1);
    expect(Object.isFrozen(preset)).toBe(true);
    expect(Object.isFrozen(preset.match.rotation)).toBe(true);
    for (const group of RULE_GROUPS) expect(Object.isFrozen(preset[group])).toBe(true);
  });

  it.each(PRESET_IDS)('%s survives a trip through JSON', (id) => {
    const preset = getPreset(id);
    const text = serializeRules(preset);
    expect(parseRules(text)).toEqual(preset);
    expect(serializeRules(parseRules(text))).toBe(text);
  });

  it('every standard game has a default preset', () => {
    expect(Object.keys(DEFAULT_PRESET_BY_GAME)).toEqual([...STANDARD_VARIANT_IDS]);
    expect(DEFAULT_PRESET_BY_GAME.asodio).toBe('asodio.kafeneio');
    for (const presetId of Object.values(DEFAULT_PRESET_BY_GAME)) {
      expect(() => getPreset(presetId)).not.toThrow();
    }
  });

  it('getPreset rejects an unknown id', () => {
    expect(errorOf(() => getPreset('backgammon')).code).toBe('UNKNOWN_PRESET');
    expect(errorOf(() => getPreset('asodio')).code).toBe('UNKNOWN_PRESET');
  });

  it('each game uses the right board, direction and capture', () => {
    const shape = (id: string): string[] => {
      const r = getPreset(id);
      return [r.board.startPosition, r.movement.direction, r.capture.captureMode];
    };
    expect(shape('portes')).toEqual(['portes', 'contrary', 'hit']);
    expect(shape('plakoto')).toEqual(['allOnOwn24', 'contrary', 'pin']);
    expect(shape('fevga')).toEqual(['allOnOwn24', 'parallel', 'none']);
    expect(shape('asodio.kafeneio')).toEqual(['offBoard', 'contrary', 'pin']);
    expect(shape('asodio.aceyDeuceyGreek')).toEqual(['offBoard', 'contrary', 'hit']);
    expect(shape('asodio.aceyDeuceyAmerican')).toEqual(['offBoard', 'contrary', 'hit']);
  });

  it('plakoto.federation differs from plakoto only in the mother rule', () => {
    const { presetId: a, mother: m1, ...plakoto } = getPreset('plakoto');
    const { presetId: b, mother: m2, ...federation } = getPreset('plakoto.federation');
    expect([a, b]).toEqual(['plakoto', 'plakoto.federation']);
    expect(federation).toEqual(plakoto);
    expect(m1.motherRule).toBe('offerConcede');
    expect(m2).toEqual({ ...m1, motherRule: 'federation' });
  });
});

describe('owner decisions (docs/open-questions.md, "Answered")', () => {
  it.each(PRESET_IDS)('%s: opening roll, scores, target and rematch', (id) => {
    const r = getPreset(id);
    expect(r.match.openingRoll).toBe('useOpeningDice');
    expect(r.scoring.backgammonScores3).toBe(false);
    expect(r.match.targetPoints).toBe(3);
    expect(r.match.rematchStarter).toBe('lastGameWinner');
  });

  it('Plakoto mother: offer to concede', () => {
    expect(getPreset('plakoto').mother.motherRule).toBe('offerConcede');
  });

  it('Fevga runner must pass the mother', () => {
    expect(getPreset('fevga').movement.runnerTarget).toBe('passMother');
  });

  it('Asodio kafeneio follows answers A1–A5', () => {
    const r = getPreset('asodio.kafeneio');
    // Loading lock: 1-2 or a double opens the board; all 15 enter first.
    expect(r.entry).toMatchObject({
      firstEntryGate: true,
      firstEntryGateRolls: 'aceDeuceOrDouble',
      mustEnterAllFirst: true,
      moveWhileLoading: false, // A2
    });
    expect(r.quarters).toEqual({
      quarterGathering: true,
      quarterLock: true,
      moveInsideFrozenQuarter: false, // A2
    });
    expect(r.capture.captureMode).toBe('pin');
    // A3: no extra roll and no free double.
    expect(r.extraRolls).toEqual({ aceDeuceExtraRoll: false, doublesGiveExtraRoll: false });
    expect(r.specialRolls.aceDeuceChoosesDouble).toBe(false);
    // A4: bear off and score as in Portes.
    expect(r.bearOff.exactBearOff).toBe(false);
    expect(r.scoring.method).toBe('tavli');
    // A5: deadlock is a draw.
    expect(r.scoring.deadlock).toBe('draw');
  });
});

describe('resolveRules', () => {
  it('with no overrides returns a fresh copy of the preset', () => {
    const rules = resolveRules('fevga');
    expect(rules).toEqual(getPreset('fevga'));
    expect(rules).not.toBe(getPreset('fevga'));
    expect(Object.isFrozen(rules)).toBe(false);
  });

  it('merges a group field by field and keeps the rest', () => {
    const rules = resolveRules('fevga', { primes: { p2Window: '7-12' } });
    expect(rules.primes).toEqual({ ...getPreset('fevga').primes, p2Window: '7-12' });
    expect(rules.movement).toEqual(getPreset('fevga').movement);
    expect(rules.presetId).toBe('fevga');
  });

  it('replaces lists instead of merging them', () => {
    const rules = resolveRules('portes', { match: { rotation: ['fevga'] } });
    expect(rules.match.rotation).toEqual(['fevga']);
  });

  it('merges several groups at once', () => {
    const rules = resolveRules('asodio.kafeneio', {
      entry: { moveWhileLoading: true },
      quarters: { moveInsideFrozenQuarter: true },
      match: { targetPoints: 7 },
    });
    expect(rules.entry.moveWhileLoading).toBe(true);
    expect(rules.quarters.moveInsideFrozenQuarter).toBe(true);
    expect(rules.match.targetPoints).toBe(7);
    expect(rules.entry.mustEnterAllFirst).toBe(true);
  });

  it('never changes the preset', () => {
    const before = JSON.stringify(getPreset('plakoto'));
    resolveRules('plakoto', { mother: { motherRule: 'none' } });
    expect(JSON.stringify(getPreset('plakoto'))).toBe(before);
  });

  it('skips fields set to undefined', () => {
    const overrides = { match: { targetPoints: undefined } } as unknown as RuleOverrides;
    expect(resolveRules('portes', overrides)).toEqual(getPreset('portes'));
  });

  it('rejects an unknown preset', () => {
    expect(errorOf(() => resolveRules('tavli')).code).toBe('UNKNOWN_PRESET');
  });

  type Bad = [string, unknown, string];
  it.each<Bad>([
    ['an unknown group', { cube: { on: true } }, 'overrides.cube'],
    ['an unknown field', { capture: { captureMod: 'pin' } }, 'overrides.capture.captureMod'],
    ['a group that is not an object', { capture: 'pin' }, 'overrides.capture'],
    ['a list as the overrides', [], 'overrides'],
    ['presetId', { presetId: 'plakoto' }, 'overrides.presetId'],
    ['version', { version: 2 }, 'overrides.version'],
    ['a bad enum value', { capture: { captureMode: 'smash' } }, 'rules.capture.captureMode'],
    ['a string for a boolean', { bearOff: { exactBearOff: 'yes' } }, 'rules.bearOff.exactBearOff'],
    ['targetPoints 0', { match: { targetPoints: 0 } }, 'rules.match.targetPoints'],
    ['an empty rotation', { match: { rotation: [] } }, 'rules.match.rotation'],
    [
      'a bad rotation entry',
      { match: { rotation: ['portes', 'chess'] } },
      'rules.match.rotation[1]',
    ],
    ['__proto__ from JSON', JSON.parse('{"__proto__": {"x": 1}}'), 'overrides.__proto__'],
  ])('rejects %s with INVALID_RULES', (_name, overrides, path) => {
    const error = errorOf(() => resolveRules('portes', overrides as RuleOverrides));
    expect(error.code).toBe('INVALID_RULES');
    expect(error.path).toBe(path);
  });
});

describe('backgammonScores3 is data, not code', () => {
  it('flipping the flag changes the resolved rules and survives JSON', () => {
    expect(getPreset('portes').scoring.backgammonScores3).toBe(false);
    const rules = resolveRules('portes', { scoring: { backgammonScores3: true } });
    expect(rules.scoring.backgammonScores3).toBe(true);
    expect({ ...rules, scoring: getPreset('portes').scoring }).toEqual(getPreset('portes'));

    const text = serializeRules(rules);
    expect(text).toContain('"backgammonScores3":true');
    expect(parseRules(text).scoring.backgammonScores3).toBe(true);

    const state = makeState({ rules });
    expect(parseGameState(serializeGameState(state)).rules.scoring.backgammonScores3).toBe(true);
  });
});

describe('combination rules (RULE_CONSTRAINTS)', () => {
  /** [constraint id, preset, overrides that break it, path of the error]. */
  type Case = [string, string, RuleOverrides, string];
  const cases: readonly Case[] = [
    [
      'hitAndRunNeedsHit',
      'plakoto',
      { capture: { noHitAndRunInHome: true } },
      'capture.noHitAndRunInHome',
    ],
    [
      'nominateBlotNeedsHit',
      'asodio.kafeneio',
      { capture: { nominateBlot: true } },
      'capture.nominateBlot',
    ],
    [
      'barEntryNeedsHit',
      'asodio.kafeneio',
      { entry: { barEntryNeedsSpecial: true } },
      'entry.barEntryNeedsSpecial',
    ],
    [
      'intermediatePinNeedsPin',
      'portes',
      { capture: { intermediatePinBlocks: true } },
      'capture.intermediatePinBlocks',
    ],
    [
      'bearOffWhilePinnedNeedsPin',
      'fevga',
      { bearOff: { bearOffWhilePinned: true } },
      'bearOff.bearOffWhilePinned',
    ],
    [
      'entryGateNeedsOffBoard',
      'portes',
      { entry: { firstEntryGate: true } },
      'entry.firstEntryGate',
    ],
    [
      'enterAllFirstNeedsOffBoard',
      'plakoto',
      { entry: { mustEnterAllFirst: true } },
      'entry.mustEnterAllFirst',
    ],
    [
      'loadingLockNeedsEnterAllFirst',
      'portes',
      { entry: { moveWhileLoading: false } },
      'entry.moveWhileLoading',
    ],
    [
      'quarterLockNeedsGathering',
      'asodio.kafeneio',
      { quarters: { quarterGathering: false } },
      'quarters.quarterGathering',
    ],
    [
      'quarterLockNeedsEnterAllFirst',
      'asodio.kafeneio',
      { entry: { mustEnterAllFirst: false, moveWhileLoading: true } },
      'entry.mustEnterAllFirst',
    ],
    [
      'frozenMoveNeedsLock',
      'portes',
      { quarters: { moveInsideFrozenQuarter: true } },
      'quarters.moveInsideFrozenQuarter',
    ],
    ['runnerNeedsParallel', 'plakoto', { movement: { runnerRule: true } }, 'movement.runnerRule'],
    [
      'runnerNeedsStartStack',
      'fevga',
      { board: { startPosition: 'portes' } },
      'movement.runnerRule',
    ],
    [
      'runnerBlocksGathering',
      'fevga',
      { quarters: { quarterGathering: true } },
      'quarters.quarterGathering',
    ],
    [
      'p2NeedsParallel',
      'portes',
      { primes: { p2NoPrimeFrontOfMother: true } },
      'primes.p2NoPrimeFrontOfMother',
    ],
    ['primeRulesOffMeansOff', 'fevga', { primes: { primeRulesOff: true } }, 'primes.primeRulesOff'],
    ['motherNeedsPin', 'portes', { mother: { motherRule: 'federation' } }, 'mother.motherRule'],
    [
      'motherNeedsStartStack',
      'asodio.kafeneio',
      { mother: { motherRule: 'instant' } },
      'mother.motherRule',
    ],
    [
      'backgammonNeedsTavliScoring',
      'asodio.aceyDeuceyAmerican',
      { scoring: { backgammonScores3: true } },
      'scoring.backgammonScores3',
    ],
  ];

  it('every constraint has a test case', () => {
    expect(cases.map(([id]) => id)).toEqual(RULE_CONSTRAINTS.map((c) => c.id));
  });

  it.each(cases)('%s: %s with the change fails', (id, presetId, overrides, path) => {
    const error = errorOf(() => resolveRules(presetId, overrides));
    const constraint = RULE_CONSTRAINTS.find((c) => c.id === id);
    expect(error.code).toBe<EngineErrorCode>('RULES_CONFLICT');
    expect(error.path).toBe(`rules.${path}`);
    expect(constraint?.flag).toBe(path);
    expect(error.message).toContain(`[${id}]`);
    expect(error.message).toContain(constraint?.message);
  });

  it('validateRules finds the same conflict in a hand-made RuleSet', () => {
    const raw = rawRules('portes');
    raw['mother'] = { ...raw['mother'], motherRule: 'instant' };
    const error = errorOf(() => validateRules(raw, 'x'));
    expect(error.code).toBe('RULES_CONFLICT');
    expect(error.path).toBe('x.mother.motherRule');
  });

  it.each<[string, string, RuleOverrides]>([
    [
      'prime rules all off',
      'fevga',
      {
        primes: {
          primeRulesOff: true,
          p1NoPrimeOwnStart: false,
          p2NoPrimeFrontOfMother: false,
          p3MustLeaveMove: false,
        },
      },
    ],
    [
      'Asodio without the army rules',
      'asodio.kafeneio',
      {
        entry: { mustEnterAllFirst: false, moveWhileLoading: true },
        quarters: { quarterGathering: false, quarterLock: false },
      },
    ],
    [
      'Asodio: move while loading (A2 not sure)',
      'asodio.kafeneio',
      { entry: { moveWhileLoading: true } },
    ],
    ['Asodio kafeneio with hitting', 'asodio.kafeneio', { capture: { captureMode: 'hit' } }],
    [
      'Asodio from the Plakoto stack',
      'asodio.aceyDeuceyAmerican',
      { board: { startPosition: 'allOnOwn24' } },
    ],
    ['Plakoto with no mother rule', 'plakoto', { mother: { motherRule: 'none' } }],
    ['Plakoto instant mother', 'plakoto', { mother: { motherRule: 'instant' } }],
    ['Plakoto may bear off while pinned', 'plakoto', { bearOff: { bearOffWhilePinned: true } }],
    ['Fevga without the runner rule (Gioul)', 'fevga', { movement: { runnerRule: false } }],
    ['Portes with hit-and-run ban', 'portes', { capture: { noHitAndRunInHome: true } }],
    ['Portes with exact bear-off', 'portes', { bearOff: { exactBearOff: true } }],
  ])('allows %s', (_name, presetId, overrides) => {
    expect(() => resolveRules(presetId, overrides)).not.toThrow();
  });
});

describe('validateRules: shape', () => {
  type Case = [string, (raw: Record<string, Record<string, unknown>>) => unknown, string];
  it.each<Case>([
    ['null', () => null, 'rules'],
    ['an array', () => [], 'rules'],
    [
      'a missing group',
      (r) => {
        delete r['primes'];
        return r;
      },
      'rules.primes',
    ],
    [
      'a missing field',
      (r) => {
        delete r['capture']?.['captureMode'];
        return r;
      },
      'rules.capture.captureMode',
    ],
    [
      'an unknown field in a group',
      (r) => {
        if (r['scoring']) r['scoring']['triple'] = true;
        return r;
      },
      'rules.scoring.triple',
    ],
    ['an unknown preset id', (r) => ({ ...r, presetId: 'portes.custom' }), 'rules.presetId'],
    ['version 1.5', (r) => ({ ...r, version: 1.5 }), 'rules.version'],
    [
      'targetPoints 2.5',
      (r) => ({ ...r, match: { ...r['match'], targetPoints: 2.5 } }),
      'rules.match.targetPoints',
    ],
    [
      'a rotation with 13 games',
      (r) => ({
        ...r,
        match: { ...r['match'], rotation: Array.from({ length: 13 }, () => 'fevga') },
      }),
      'rules.match.rotation',
    ],
    [
      'a rotation that is a string',
      (r) => ({ ...r, match: { ...r['match'], rotation: 'portes' } }),
      'rules.match.rotation',
    ],
    [
      'a number for an enum',
      (r) => ({ ...r, movement: { ...r['movement'], direction: 1 } }),
      'rules.movement.direction',
    ],
  ])('rejects %s', (_name, mutate, path) => {
    const error = errorOf(() => validateRules(mutate(rawRules())));
    expect(error.code).toBe('INVALID_RULES');
    expect(error.path).toBe(path);
  });

  it('returns a fresh copy', () => {
    const raw = rawRules('fevga');
    const rules = validateRules(raw);
    expect(rules).toEqual(raw);
    expect(rules.match.rotation).not.toBe((raw['match'] as Record<string, unknown>)['rotation']);
  });

  it('parseRules rejects text that is not JSON', () => {
    expect(errorOf(() => parseRules('{')).code).toBe('INVALID_JSON');
  });

  it('serializeRules refuses broken rules', () => {
    const broken = { ...getPreset('portes'), version: -1 } as RuleSet;
    expect(() => serializeRules(broken)).toThrow(EngineError);
  });

  it('every field in the schema is a boolean, an enum, an integer or a list', () => {
    for (const group of RULE_GROUPS) {
      for (const spec of Object.values(RULE_SCHEMA[group])) {
        expect(['boolean', 'enum', 'integer', 'list']).toContain(spec.kind);
      }
    }
  });
});

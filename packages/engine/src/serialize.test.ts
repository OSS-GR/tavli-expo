import { describe, expect, it } from 'vitest';

import { createBoard } from './board';
import { EngineError } from './errors';
import type { EngineErrorCode } from './errors';
import { getPreset, resolveRules } from './presets';
import { parseGameState, serializeGameState } from './serialize';
import { GAME_STATE_SCHEMA_VERSION } from './state';
import type { GameState } from './state';
import { makeState, startBoard } from './testing/fixtures';
import { validateGameState } from './validate';

/** A JSON-like copy we can break on purpose. */
type Mutable = Record<string, unknown> & {
  board: Record<string, unknown> & { points: Record<string, unknown>[] };
};

function rawState(overrides: Partial<GameState> = {}): Mutable {
  return JSON.parse(JSON.stringify(makeState(overrides))) as Mutable;
}

function errorOf(fn: () => unknown): EngineError {
  try {
    fn();
  } catch (error) {
    if (error instanceof EngineError) return error;
    throw error;
  }
  throw new Error('expected an EngineError');
}

describe('round trip', () => {
  const pinnedBoard = createBoard(
    {
      white: { points: { 20: 1, 23: 10 }, pinned: [20], off: 4 },
      black: { points: { 5: 2, 1: 3 }, bar: 0, outside: 10 },
    },
    'contrary',
  );

  it.each<[string, GameState]>([
    ['Portes start', makeState()],
    [
      'Fevga start, Black to move with dice',
      makeState({ variant: 'fevga', board: startBoard('fevga'), toMove: 'black', dice: [6, 6] }),
    ],
    [
      'Asodio start',
      makeState({
        variant: 'asodio',
        board: startBoard('asodio'),
        rules: resolveRules('asodio.kafeneio'),
      }),
    ],
    [
      'house rules: Plakoto instant mother, match to 7',
      makeState({
        variant: 'plakoto',
        board: startBoard('plakoto'),
        rules: resolveRules('plakoto', {
          mother: { motherRule: 'instant' },
          match: { targetPoints: 7, rotation: ['plakoto'] },
        }),
      }),
    ],
    [
      'pin, bar, outside, off and variantData',
      makeState({
        board: pinnedBoard,
        turnNumber: 41,
        dice: [2, 1],
        variantData: { chosenDouble: 5, history: [1, 'two', true, null, { deep: [[]] }] },
      }),
    ],
  ])('%s', (_name, state) => {
    const text = serializeGameState(state);
    const back = parseGameState(text);
    expect(back).toEqual(state);
    expect(back).not.toBe(state);
    expect(serializeGameState(back)).toBe(text);
    expect(text).toContain('"schemaVersion":2');
    expect(GAME_STATE_SCHEMA_VERSION).toBe(2);
  });

  it('validateGameState accepts a plain object (as Convex would return it)', () => {
    const state = makeState({ dice: [5, 3] });
    expect(validateGameState(JSON.parse(JSON.stringify(state)))).toEqual(state);
  });
});

describe('rejects bad input', () => {
  it('text that is not JSON', () => {
    expect(errorOf(() => parseGameState('{not json')).code).toBe('INVALID_JSON');
    expect(errorOf(() => parseGameState('')).code).toBe('INVALID_JSON');
  });

  it('another schema version', () => {
    const raw = rawState();
    raw['schemaVersion'] = 3;
    raw['somethingNew'] = true;
    const error = errorOf(() => parseGameState(JSON.stringify(raw)));
    expect(error.code).toBe('UNSUPPORTED_SCHEMA_VERSION');
    expect(error.path).toBe('state.schemaVersion');
  });

  type Case = [string, (raw: Mutable) => unknown, string, EngineErrorCode?];
  const point0 = (raw: Mutable): Record<string, unknown> => {
    const p = raw.board.points[0];
    if (p === undefined) throw new Error('no point');
    return p;
  };

  it.each<Case>([
    ['root is null', () => null, 'state'],
    ['root is an array', () => [], 'state'],
    [
      'missing schemaVersion',
      (r) => {
        delete r['schemaVersion'];
        return r;
      },
      'state.schemaVersion',
    ],
    [
      'schemaVersion is a string',
      (r) => {
        r['schemaVersion'] = '1';
        return r;
      },
      'state.schemaVersion',
    ],
    [
      'unknown field',
      (r) => {
        r['cheat'] = 1;
        return r;
      },
      'state.cheat',
    ],
    [
      'missing field',
      (r) => {
        delete r['dice'];
        return r;
      },
      'state.dice',
    ],
    [
      'empty variant id',
      (r) => {
        r['variant'] = '';
        return r;
      },
      'state.variant',
    ],
    [
      'rules version 0',
      (r) => {
        r['rules'] = { ...getPreset('portes'), version: 0 };
        return r;
      },
      'state.rules.version',
      'INVALID_RULES',
    ],
    [
      'rules with an extra key',
      (r) => {
        r['rules'] = { ...getPreset('portes'), x: 1 };
        return r;
      },
      'state.rules.x',
      'INVALID_RULES',
    ],
    [
      'rules as an old reference in a version 2 state',
      (r) => {
        r['rules'] = { id: 'portes', version: 1 };
        return r;
      },
      'state.rules.presetId',
      'INVALID_RULES',
    ],
    [
      'rules with a bad flag value',
      (r) => {
        r['rules'] = {
          ...getPreset('portes'),
          capture: { ...getPreset('portes').capture, captureMode: 'smash' },
        };
        return r;
      },
      'state.rules.capture.captureMode',
      'INVALID_RULES',
    ],
    [
      'rules with flags that conflict',
      (r) => {
        r['rules'] = {
          ...getPreset('portes'),
          mother: { ...getPreset('portes').mother, motherRule: 'federation' },
        };
        return r;
      },
      'state.rules.mother.motherRule',
      'RULES_CONFLICT',
    ],
    [
      'toMove is not a player',
      (r) => {
        r['toMove'] = 'red';
        return r;
      },
      'state.toMove',
    ],
    [
      'toMove is 0',
      (r) => {
        r['toMove'] = 0;
        return r;
      },
      'state.toMove',
    ],
    [
      'die value 0',
      (r) => {
        r['dice'] = [0, 3];
        return r;
      },
      'state.dice[0]',
    ],
    [
      'die value 7',
      (r) => {
        r['dice'] = [1, 7];
        return r;
      },
      'state.dice[1]',
    ],
    [
      'die value 1.5',
      (r) => {
        r['dice'] = [1.5, 2];
        return r;
      },
      'state.dice[0]',
    ],
    [
      'one die',
      (r) => {
        r['dice'] = [3];
        return r;
      },
      'state.dice',
    ],
    [
      'turnNumber 0',
      (r) => {
        r['turnNumber'] = 0;
        return r;
      },
      'state.turnNumber',
    ],
    [
      'turnNumber 2.5',
      (r) => {
        r['turnNumber'] = 2.5;
        return r;
      },
      'state.turnNumber',
    ],
    [
      '23 points',
      (r) => {
        r.board.points.pop();
        return r;
      },
      'state.board.points',
    ],
    [
      'board with an extra key',
      (r) => {
        r.board['cube'] = 2;
        return r;
      },
      'state.board.cube',
    ],
    [
      'negative count',
      (r) => {
        point0(r)['white'] = -1;
        return r;
      },
      'state.board.points[0].white',
    ],
    [
      'count 16',
      (r) => {
        point0(r)['black'] = 16;
        return r;
      },
      'state.board.points[0].black',
    ],
    [
      'count as a string',
      (r) => {
        point0(r)['black'] = '2';
        return r;
      },
      'state.board.points[0].black',
    ],
    [
      '14 black checkers',
      (r) => {
        point0(r)['black'] = 1;
        return r;
      },
      'state.board',
    ],
    [
      'bar with a bad player key',
      (r) => {
        r.board['bar'] = { white: 0, red: 0 };
        return r;
      },
      'state.board.bar.black',
    ],
    [
      'pinned is not a player',
      (r) => {
        point0(r)['pinned'] = 'x';
        return r;
      },
      'state.board.points[0].pinned',
    ],
    [
      'variantData is an array',
      (r) => {
        r['variantData'] = [1];
        return r;
      },
      'state.variantData',
    ],
    [
      'variantData is a string',
      (r) => {
        r['variantData'] = 'x';
        return r;
      },
      'state.variantData',
    ],
  ])('%s', (_name, mutate, path, code = 'INVALID_STATE') => {
    const error = errorOf(() => validateGameState(mutate(rawState())));
    expect(error.code).toBe(code);
    expect(error.path).toBe(path);
    expect(() => parseGameState(JSON.stringify(mutate(rawState())))).toThrow(EngineError);
  });

  it('two players on a point without a pin', () => {
    const raw = rawState();
    // Move one White checker from W24 onto Black's two checkers on W1.
    const p1 = raw.board.points[0];
    const p24 = raw.board.points[23];
    if (p1 === undefined || p24 === undefined) throw new Error('no point');
    p1['white'] = 1;
    p24['white'] = 1;
    expect(errorOf(() => validateGameState(raw)).message).toMatch(/no checker is pinned/);
  });

  it('a pinned player with more than one checker on the point', () => {
    const raw = rawState();
    const p1 = raw.board.points[0];
    const p24 = raw.board.points[23];
    if (p1 === undefined || p24 === undefined) throw new Error('no point');
    p1['white'] = 2;
    p1['pinned'] = 'white';
    p24['white'] = 0;
    expect(errorOf(() => validateGameState(raw)).message).toMatch(/must be alone/);
  });

  it('a pin on a point with only one player', () => {
    const raw = rawState();
    const p6 = raw.board.points[5];
    if (p6 === undefined) throw new Error('no point');
    p6['pinned'] = 'black';
    expect(errorOf(() => validateGameState(raw)).message).toMatch(/needs checkers of both/);
  });

  it('variantData values that are not JSON', () => {
    const cases: unknown[] = [
      { n: Number.NaN },
      { n: Number.POSITIVE_INFINITY },
      { u: undefined },
      { d: new Date(0) },
      { f: () => 1 },
    ];
    for (const variantData of cases) {
      const raw = { ...rawState(), variantData };
      expect(errorOf(() => validateGameState(raw)).path).toMatch(/^state\.variantData\./);
    }
  });

  it('variantData nested too deep', () => {
    let deep: unknown = 1;
    for (let i = 0; i < 40; i += 1) deep = { a: deep };
    const raw = { ...rawState(), variantData: deep };
    expect(errorOf(() => validateGameState(raw)).message).toMatch(/too deep/);
  });

  it('serializeGameState refuses a broken state', () => {
    const broken = { ...makeState(), turnNumber: -3 } as GameState;
    expect(() => serializeGameState(broken)).toThrow(EngineError);
  });
});

describe('version 1 states are upgraded', () => {
  /** A version 1 state, as #22 wrote it: `rules` is `{ id, version }`. */
  function v1State(rules: unknown, overrides: Partial<GameState> = {}): Record<string, unknown> {
    return { ...rawState(overrides), schemaVersion: 1, rules };
  }

  it.each([
    ['portes', 'portes'],
    ['plakoto', 'plakoto'],
    ['fevga', 'fevga'],
    ['asodio', 'asodio.kafeneio'],
    ['asodio.kafeneio', 'asodio.kafeneio'],
    ['plakoto.federation', 'plakoto.federation'],
  ] as const)('rules id "%s" becomes the full "%s" preset', (id, presetId) => {
    const upgraded = validateGameState(v1State({ id, version: 1 }));
    expect(upgraded.schemaVersion).toBe(2);
    expect(upgraded.rules).toEqual(getPreset(presetId));
    expect(upgraded.rules).not.toBe(getPreset(presetId));
  });

  it('keeps everything else and re-serializes as version 2', () => {
    const raw = v1State({ id: 'portes', version: 1 }, { dice: [6, 1], turnNumber: 9 });
    const upgraded = parseGameState(JSON.stringify(raw));
    expect(upgraded).toEqual(makeState({ dice: [6, 1], turnNumber: 9 }));
    expect(serializeGameState(upgraded)).toContain('"schemaVersion":2');
    expect(parseGameState(serializeGameState(upgraded))).toEqual(upgraded);
  });

  it('rejects an unknown rules id', () => {
    const error = errorOf(() => validateGameState(v1State({ id: 'test-race', version: 1 })));
    expect(error.code).toBe('UNKNOWN_PRESET');
    expect(error.path).toBe('state.rules.id');
  });

  it('rejects a rules version newer than the preset', () => {
    const error = errorOf(() => validateGameState(v1State({ id: 'portes', version: 2 })));
    expect(error.code).toBe('INVALID_STATE');
    expect(error.path).toBe('state.rules.version');
  });

  it('rejects a bad version 1 rules reference', () => {
    expect(errorOf(() => validateGameState(v1State({ id: '', version: 1 }))).path).toBe(
      'state.rules.id',
    );
    expect(errorOf(() => validateGameState(v1State({ id: 'portes', version: 0 }))).path).toBe(
      'state.rules.version',
    );
    expect(errorOf(() => validateGameState(v1State({ id: 'portes', version: 1, x: 1 }))).path).toBe(
      'state.rules.x',
    );
    expect(errorOf(() => validateGameState(v1State(getPreset('portes')))).path).toBe(
      'state.rules.id',
    );
  });

  it('rejects schema versions 0 and 3', () => {
    for (const schemaVersion of [0, 3]) {
      const raw = { ...rawState(), schemaVersion };
      expect(errorOf(() => validateGameState(raw)).code).toBe('UNSUPPORTED_SCHEMA_VERSION');
    }
  });
});

/**
 * The presets must match the "House-rule variants (flags)" tables in
 * `docs/rules/`. This test reads the tables from the docs themselves, so it
 * fails when someone changes a default in a doc but not in `presets.ts` (or
 * the other way round), or adds a flag to a doc that `RuleSet` does not have.
 */

import { describe, expect, it } from 'vitest';

import asodioDoc from '../../../docs/rules/asodio.md?raw';
import fevgaDoc from '../../../docs/rules/fevga.md?raw';
import plakotoDoc from '../../../docs/rules/plakoto.md?raw';
import portesDoc from '../../../docs/rules/portes.md?raw';
import matchDoc from '../../../docs/rules/tavli-match.md?raw';
import { getPreset } from './presets';
import gameFlowTests from './flow/game-flow.test.ts?raw';
import matchFlowTests from './flow/match-flow.test.ts?raw';
import matchTests from './match.test.ts?raw';
import asodioTests from './variants/asodio/asodio.test.ts?raw';
import fevgaTests from './variants/fevga/fevga.test.ts?raw';
import portesTests from './variants/portes/portes.test.ts?raw';
import { PRESET_IDS, RULE_GROUPS, RULE_SCHEMA } from './rules';
import type { PresetId, RuleSet } from './rules';
import { section, tableRows } from './testing/markdown';

type DocValue = string | number | boolean | readonly string[];

/** Reads a default cell: the first `code` or **bold** token, as a JSON-like value. */
function docValue(cell: string): DocValue {
  if (cell.startsWith('P→Pl→F')) return ['portes', 'plakoto', 'fevga'];
  const match = /`([^`]+)`|\*\*([^*]+)\*\*/.exec(cell);
  const token = (match?.[1] ?? match?.[2] ?? cell).replace(/^"|"$/g, '');
  if (token === 'true') return true;
  if (token === 'false') return false;
  if (/^\d+$/.test(token)) return Number(token);
  return token;
}

/** Doc flag name → `group.field` in a RuleSet. */
function fieldOf(flag: string): string | null {
  if (flag === 'scoring') return 'scoring.method';
  for (const group of RULE_GROUPS) {
    if (Object.hasOwn(RULE_SCHEMA[group], flag)) return `${group}.${flag}`;
  }
  return null;
}

function valueAt(rules: RuleSet, path: string): unknown {
  const [group, key] = path.split('.') as [keyof RuleSet, string];
  return (rules[group] as unknown as Record<string, unknown>)[key];
}

/** The flag table of a doc: flag → default value. */
function flagDefaults(doc: string): Map<string, DocValue> {
  const rows = tableRows(section(doc, '## House-rule variants (flags)'));
  return new Map(
    rows.map(([flag = '', , defaultCell = '']) => [flag.replace(/`/g, ''), docValue(defaultCell)]),
  );
}

const ALL: readonly PresetId[] = PRESET_IDS;
const STANDARD_ROTATION: readonly PresetId[] = ['tavli', 'plakoto', 'plakoto.federation', 'fevga'];

/** Which presets must follow each doc's table, and the exceptions. */
const DOCS: readonly {
  name: string;
  doc: string;
  presets: readonly PresetId[];
  /** Flags a preset sets on purpose to another value. */
  except?: Partial<Record<PresetId, readonly string[]>>;
}[] = [
  {
    name: 'tavli-match.md',
    doc: matchDoc,
    presets: ALL,
    // asodio.md: Asodio is not in the standard rotation; it is played alone.
    // The `portes` preset is a single-game match (note in the rotation row).
    except: {
      portes: ['rotation'],
      'asodio.kafeneio': ['rotation'],
      'asodio.aceyDeuceyGreek': ['rotation'],
      'asodio.aceyDeuceyAmerican': ['rotation'],
    },
  },
  { name: 'portes.md', doc: portesDoc, presets: ['portes'] },
  {
    name: 'plakoto.md',
    doc: plakotoDoc,
    presets: ['plakoto', 'plakoto.federation'],
    except: { 'plakoto.federation': ['motherRule'] },
  },
  { name: 'fevga.md', doc: fevgaDoc, presets: ['fevga'] },
  { name: 'asodio.md', doc: asodioDoc, presets: ['asodio.kafeneio'] },
];

describe('presets match the flag tables in docs/rules', () => {
  for (const { name, doc, presets, except = {} } of DOCS) {
    const defaults = flagDefaults(doc);

    it(`${name}: the table has flags`, () => {
      expect(defaults.size).toBeGreaterThan(3);
    });

    it(`${name}: every flag has a RuleSet field`, () => {
      const missing = [...defaults.keys()].filter((flag) => fieldOf(flag) === null);
      expect(missing).toEqual([]);
    });

    for (const presetId of presets) {
      it(`${name}: ${presetId} uses the table defaults`, () => {
        const rules = getPreset(presetId);
        const skip = except[presetId] ?? [];
        for (const [flag, value] of defaults) {
          const path = fieldOf(flag);
          if (path === null || skip.includes(flag)) continue;
          expect({ flag, value: valueAt(rules, path) }).toEqual({ flag, value });
        }
      });
    }
  }

  it('tavli-match.md: rematchStarter default (in the text, not the table)', () => {
    const match = /`rematchStarter: [^`]*`,\s*default `"(\w+)"`/.exec(matchDoc);
    expect(match?.[1]).toBe('lastGameWinner');
    for (const id of ALL) expect(getPreset(id).match.rematchStarter).toBe(match?.[1]);
  });

  it('portes and the Asodio presets play alone; the others use the standard rotation', () => {
    for (const id of STANDARD_ROTATION) {
      expect(getPreset(id).match.rotation).toEqual(['portes', 'plakoto', 'fevga']);
    }
    const row = tableRows(section(matchDoc, '## House-rule variants (flags)')).find(
      ([flag]) => flag === '`rotation`',
    );
    expect(row?.[3]).toContain('`portes` preset = single-game match; `tavli` preset = rotation');
    expect(getPreset('portes').match.rotation).toEqual(['portes']);
    for (const id of ALL.filter((p) => p.startsWith('asodio.'))) {
      expect(getPreset(id).match.rotation).toEqual(['asodio']);
    }
  });

  it('every RuleSet field is in a doc table, or listed here with where the doc says it', () => {
    const tableFields = new Set(
      DOCS.flatMap(({ doc }) => [...flagDefaults(doc).keys()].map(fieldOf)),
    );
    const allFields = RULE_GROUPS.flatMap((group) =>
      Object.keys(RULE_SCHEMA[group]).map((key) => `${group}.${key}`),
    );
    expect(allFields.filter((f) => !tableFields.has(f))).toEqual([
      'movement.direction', // tavli-match.md, "Direction of movement"
      'specialRolls.aceDeuceChoosesDouble', // asodio.md, "Turn & dice rules" 3.2 and A3
      'match.rematchStarter', // tavli-match.md, "Who starts later games"
    ]);
  });
});

describe('asodio.md "Presets" table', () => {
  const rows = tableRows(section(asodioDoc, '### Presets'));

  it('has the three presets', () => {
    expect(rows.map(([name = '']) => /`(\w+)`/.exec(name)?.[1])).toEqual([
      'kafeneio',
      'aceyDeuceyGreek',
      'aceyDeuceyAmerican',
    ]);
  });

  it.each(rows.map(([name = '', flags = '']) => [/`(\w+)`/.exec(name)?.[1] ?? '', flags]))(
    'asodio.%s has the listed flags',
    (name, flags) => {
      const rules = getPreset(`asodio.${name}`);
      const listed = [...flags.matchAll(/`(\w+)=(\w+)`/g)];
      expect(listed.length).toBeGreaterThan(0);
      for (const [, flag = '', raw = ''] of listed) {
        const path = fieldOf(flag);
        expect(path).not.toBeNull();
        expect({ flag, value: valueAt(rules, path ?? '') }).toEqual({ flag, value: docValue(raw) });
      }
      if (flags.includes('no extra rolls')) {
        expect(rules.extraRolls).toEqual({ aceDeuceExtraRoll: false, doublesGiveExtraRoll: false });
      }
    },
  );
});

/**
 * The numbers of the cases in a doc's "## Edge cases" list, and in the
 * `extra` sections (Asodio lists its owner cases under "### Presets").
 */
function edgeCaseNumbers(doc: string, extra: readonly string[] = []): number[] {
  return ['## Edge cases', ...extra].flatMap((heading) =>
    [...section(doc, heading).matchAll(/^(\d+)\. /gm)].map((m) => Number(m[1])),
  );
}

/**
 * CLAUDE.md rule 4: every numbered edge case in a rules doc needs a unit
 * test. A doc listed here must have a test named `<doc> #N: ...` for each
 * case `N`, in one of its test files (read as text with `?raw`).
 */
const EDGE_CASE_TESTS: readonly {
  name: string;
  doc: string;
  tests: readonly string[];
  extra?: readonly string[];
}[] = [
  {
    name: 'tavli-match.md',
    doc: matchDoc,
    tests: [matchTests, matchFlowTests, gameFlowTests, portesTests],
  },
  { name: 'fevga.md', doc: fevgaDoc, tests: [fevgaTests] },
  { name: 'asodio.md', doc: asodioDoc, tests: [asodioTests], extra: ['### Presets'] },
];

describe('every numbered edge case has a test', () => {
  it.each(EDGE_CASE_TESTS.map((entry) => [entry.name, entry] as const))('%s', (name, entry) => {
    const numbers = edgeCaseNumbers(entry.doc, entry.extra);
    expect(numbers.length).toBeGreaterThan(0);
    expect(numbers).toEqual(numbers.map((_, i) => i + 1));
    const missing = numbers.filter((n) => !entry.tests.some((t) => t.includes(`'${name} #${n}:`)));
    expect(missing).toEqual([]);
  });
});

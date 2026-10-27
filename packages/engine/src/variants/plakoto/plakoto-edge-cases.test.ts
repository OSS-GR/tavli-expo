/**
 * Every numbered edge case in `docs/rules/plakoto.md` needs a unit test
 * (CLAUDE.md, rule 4). The index of where each one is tested is the table
 * "Plakoto edge-case index" in `packages/engine/README.md`.
 *
 * This test reads the rules doc, that table and the test files themselves
 * (like `portes-edge-cases.test.ts`). It fails when the doc gets a new case
 * and the table does not list it, or when a listed file has no test named
 * `plakoto.md #N`.
 */

import { describe, expect, it } from 'vitest';

import plakotoDoc from '../../../../../docs/rules/plakoto.md?raw';
import readme from '../../../README.md?raw';
import { section, tableRows } from '../../testing/markdown';
import plakotoTests from './plakoto.test.ts?raw';

/** Test files the index may point to, by path from `src/`. */
const SOURCES: Readonly<Record<string, string>> = {
  'variants/plakoto/plakoto.test.ts': plakotoTests,
};

/** The numbers of the edge cases in the rules doc. */
function docCases(): number[] {
  const text = section(plakotoDoc, '## Edge cases');
  return [...text.matchAll(/^(\d+)\. /gm)].map((m) => Number(m[1]));
}

/** The README index: case number → test files. */
function indexRows(): Map<number, string[]> {
  const rows = tableRows(section(readme, '### Plakoto edge-case index'), /^\| \d+ +\|/);
  return new Map(
    rows.map(([n = '', , files = '']) => [
      Number(n),
      [...files.matchAll(/`([^`]+\.test\.ts)`/g)].map((m) => m[1] as string),
    ]),
  );
}

/** True when `source` has a test whose name starts with `plakoto.md #n`. */
function hasTest(source: string, n: number): boolean {
  return new RegExp(`\\bit\\(\\s*['\`]plakoto\\.md #${n}\\b`).test(source);
}

describe('plakoto.md edge cases: every case has a test', () => {
  it('the doc numbers its cases 1, 2, 3, … with no gaps (20 today)', () => {
    const cases = docCases();
    expect(cases.length).toBeGreaterThanOrEqual(20);
    expect(cases).toEqual(cases.map((_, i) => i + 1));
  });

  it('the README index lists every case of the doc, and nothing else', () => {
    expect([...indexRows().keys()]).toEqual(docCases());
  });

  it('each listed file has a test named after the case', () => {
    const missing: string[] = [];
    for (const [n, files] of indexRows()) {
      if (files.length === 0) missing.push(`#${n}: no test file listed`);
      for (const file of files) {
        const source = SOURCES[file];
        if (source === undefined) missing.push(`#${n}: add ${file} to SOURCES`);
        else if (!hasTest(source, n)) missing.push(`#${n}: no "plakoto.md #${n}" test in ${file}`);
      }
    }
    expect(missing).toEqual([]);
  });
});

/// <reference types="node" />
/**
 * The event plan in code (#163). `ANALYTICS_EVENTS` in `@tavli/contracts`
 * is the one list of event names. These tests read the source files and
 * fail when the code sends an event that is not in the list, when an event
 * in the list is never sent, or when the event plan doc is out of step.
 *
 * The types already stop a wrong name (`Analytics.track` takes only names
 * from the list). These tests also catch a cast, or a vendor call that goes
 * around the port.
 */
import fs from 'node:fs';
import path from 'node:path';

import { ANALYTICS_EVENTS } from '@tavli/contracts';

import { DEFAULT_SETTINGS } from '@/features/settings/settings';

const REPO = path.resolve(__dirname, '../../../../..');
const SCANNED = ['apps', 'packages'];
const SKIPPED_DIRS = new Set(['node_modules', '.expo', 'ios', 'android', 'dist', '_generated']);
const POSTHOG_ADAPTER = 'packages/adapters/analytics-posthog/src/index.ts';
const EVENT_PLAN_DOC = 'docs/architecture/analytics-events.md';

/** Every `.ts` and `.tsx` source file (no tests, no type files), as repo paths. */
function sourceFiles(dir: string = REPO, found: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIPPED_DIRS.has(entry.name)) sourceFiles(full, found);
      continue;
    }
    if (!/\.tsx?$/.test(entry.name) || /\.(test|d)\.tsx?$/.test(entry.name)) continue;
    found.push(path.relative(REPO, full).split(path.sep).join('/'));
  }
  return found;
}

interface TrackCall {
  /** The event name, or `null` when the first argument is not a string literal. */
  readonly event: string | null;
  /** The first argument as written. */
  readonly arg: string;
}

/** The `.track(...)` calls in `source`. */
function trackCalls(source: string): TrackCall[] {
  return [...source.matchAll(/\.track\(\s*([^,)]*)/g)].map((match) => {
    const arg = (match[1] ?? '').trim();
    const literal = /^(['"`])([\w$]+)\1$/.exec(arg);
    return { event: literal ? literal[2]! : null, arg };
  });
}

const files = SCANNED.flatMap((dir) => sourceFiles(path.join(REPO, dir)));
const read = (file: string) => fs.readFileSync(path.join(REPO, file), 'utf8');
const calls = files.flatMap((file) => trackCalls(read(file)).map((call) => ({ file, ...call })));
const names: readonly string[] = ANALYTICS_EVENTS;

describe('trackCalls (the scanner)', () => {
  it('finds literal names, and calls with a name it cannot read', () => {
    const source = [
      "analytics.track('app_opened');",
      "analytics.track('not_an_event', { a: 1 });",
      'analytics.track(event, ...props);',
    ].join('\n');
    expect(trackCalls(source)).toEqual([
      { event: 'app_opened', arg: "'app_opened'" },
      { event: 'not_an_event', arg: "'not_an_event'" },
      { event: null, arg: 'event' },
    ]);
  });
});

describe('the code and the event list (ANALYTICS_EVENTS)', () => {
  it('scans the app and the packages', () => {
    expect(files).toContain('apps/mobile/src/features/analytics/connect.ts');
    expect(files).toContain(POSTHOG_ADAPTER);
    expect(calls.length).toBeGreaterThan(0);
  });

  it('sends only events that are in the list', () => {
    const unknown = calls.filter((call) => call.event !== null && !names.includes(call.event));
    expect(unknown).toEqual([]);
  });

  it('names every event with a string literal, so this test can check it', () => {
    expect(calls.filter((call) => call.event === null)).toEqual([]);
  });

  it('sends every event in the list from the app (no unused events)', () => {
    const sent = new Set(
      calls.filter((call) => call.file.startsWith('apps/mobile/src/')).map((call) => call.event),
    );
    expect(names.filter((event) => !sent.has(event))).toEqual([]);
  });

  it('calls the vendor capture only in the PostHog adapter', () => {
    const capturing = files.filter((file) => /\.capture\(/.test(read(file)));
    expect(capturing).toEqual([POSTHOG_ADAPTER]);
  });
});

describe('the event plan doc', () => {
  const doc = read(EVENT_PLAN_DOC);

  it('lists every setting key that settings_changed can send', () => {
    const row = doc.split('\n').find((line) => line.startsWith('| `settings_changed` |')) ?? '';
    const keys = Object.keys(DEFAULT_SETTINGS).filter((k) => k !== 'theme' && k !== 'boardTheme');
    expect(keys.filter((key) => !row.includes(`\`${key}\``))).toEqual([]);
  });
});

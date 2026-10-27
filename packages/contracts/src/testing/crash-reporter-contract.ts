/**
 * The shared contract test for `CrashReporter` adapters. Every adapter runs
 * it in its own tests:
 *
 *   runCrashReporterContract('my adapter', () => createMyCrashReporter());
 *
 * It checks the rules every adapter must keep, whatever the vendor does:
 * calls never throw, in any order, with any thrown value.
 */
import { describe, expect, it } from 'vitest';

import type { CrashReporter } from '../crash-reporter';

const DSN = 'https://public@example.ingest.sentry.io/1';

/** Values code can throw. A reporter must accept all of them. */
const THROWN_VALUES: unknown[] = [
  new Error('boom'),
  new TypeError('bad type'),
  'a string',
  42,
  null,
  undefined,
  { message: 'plain object' },
  Object.create(null),
];

function everyCall(reporter: CrashReporter): void {
  for (const value of THROWN_VALUES) reporter.captureException(value);
  reporter.captureException(new Error('with context'), {
    tags: { screen: 'game' },
    extra: { turn: 3, variant: 'portes', online: false, seed: null },
    componentStack: '\n    in Board\n    in GameScreen',
    level: 'fatal',
  });
  reporter.captureMessage('hello');
  reporter.captureMessage('careful', 'warning');
  reporter.addBreadcrumb({ category: 'game', message: 'rolled', level: 'info', data: { die: 6 } });
  reporter.setUser('install_1234abcd');
  reporter.setUser('someone@example.com');
  reporter.setUser(null);
}

export function runCrashReporterContract(name: string, make: () => CrashReporter): void {
  describe(`${name}: CrashReporter contract`, () => {
    it('never throws before init', () => {
      expect(() => everyCall(make())).not.toThrow();
    });

    it('never throws after init without a DSN', () => {
      const reporter = make();
      reporter.init({});
      reporter.init({ dsn: '' });
      expect(() => everyCall(reporter)).not.toThrow();
    });

    it('never throws after init with a DSN', () => {
      const reporter = make();
      reporter.init({ dsn: DSN, environment: 'test' });
      expect(() => everyCall(reporter)).not.toThrow();
    });

    it('never throws while disabled, or when turned on and off', () => {
      const reporter = make();
      reporter.init({ dsn: DSN, enabled: false });
      expect(() => everyCall(reporter)).not.toThrow();
      expect(() => {
        reporter.setEnabled(true);
        reporter.setEnabled(true);
        everyCall(reporter);
        reporter.setEnabled(false);
        everyCall(reporter);
      }).not.toThrow();
    });
  });
}

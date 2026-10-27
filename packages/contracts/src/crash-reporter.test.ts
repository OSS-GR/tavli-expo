import { describe, expect, it } from 'vitest';

import {
  CRASH_LEVELS,
  createNoopCrashReporter,
  createRecordingCrashReporter,
  isAnonymousInstallId,
} from './crash-reporter';
import { runCrashReporterContract } from './testing/crash-reporter-contract';

runCrashReporterContract('no-op', createNoopCrashReporter);
runCrashReporterContract('recording', createRecordingCrashReporter);

describe('crash levels', () => {
  it('match the Sentry level names', () => {
    expect(CRASH_LEVELS).toEqual(['fatal', 'error', 'warning', 'info', 'debug']);
  });
});

describe('isAnonymousInstallId', () => {
  it('accepts random ids', () => {
    expect(isAnonymousInstallId('3f2b9c1e-7a4d-4e8f-9b0a-1c2d3e4f5a6b')).toBe(true);
    expect(isAnonymousInstallId('install_1234abcd')).toBe(true);
  });

  it('rejects personal data and junk', () => {
    expect(isAnonymousInstallId('someone@example.com')).toBe(false);
    expect(isAnonymousInstallId('Maria Papadopoulou')).toBe(false);
    expect(isAnonymousInstallId('short')).toBe(false);
    expect(isAnonymousInstallId('x'.repeat(65))).toBe(false);
    expect(isAnonymousInstallId(12345678)).toBe(false);
    expect(isAnonymousInstallId(null)).toBe(false);
  });
});

describe('createRecordingCrashReporter', () => {
  it('keeps the config and starts enabled', () => {
    const reporter = createRecordingCrashReporter();
    reporter.init({ dsn: 'x', environment: 'test' });
    expect(reporter.config).toEqual({ dsn: 'x', environment: 'test' });
    expect(reporter.enabled).toBe(true);
  });

  it('records exceptions, messages and breadcrumbs', () => {
    const reporter = createRecordingCrashReporter();
    const error = new Error('boom');
    reporter.captureException(error, { tags: { screen: 'game' } });
    reporter.captureException('plain');
    reporter.captureMessage('hello');
    reporter.captureMessage('careful', 'warning');
    reporter.addBreadcrumb({ category: 'ui', message: 'tapped Roll' });
    expect(reporter.reports).toEqual([
      { kind: 'exception', error, context: { tags: { screen: 'game' } } },
      { kind: 'exception', error: 'plain' },
      { kind: 'message', message: 'hello', level: 'info' },
      { kind: 'message', message: 'careful', level: 'warning' },
    ]);
    expect(reporter.breadcrumbs).toEqual([{ category: 'ui', message: 'tapped Roll' }]);
  });

  it('keeps nothing while disabled', () => {
    const reporter = createRecordingCrashReporter();
    reporter.init({ enabled: false });
    reporter.captureException(new Error('boom'));
    reporter.captureMessage('hello');
    reporter.addBreadcrumb({ category: 'ui' });
    expect(reporter.reports).toEqual([]);
    expect(reporter.breadcrumbs).toEqual([]);

    reporter.setEnabled(true);
    reporter.captureMessage('back');
    expect(reporter.reports).toHaveLength(1);
  });

  it('accepts only anonymous ids as the user', () => {
    const reporter = createRecordingCrashReporter();
    reporter.setUser('someone@example.com');
    expect(reporter.user).toBeNull();
    reporter.setUser('install_1234abcd');
    expect(reporter.user).toBe('install_1234abcd');
    reporter.setUser('Maria Papadopoulou');
    expect(reporter.user).toBe('install_1234abcd');
    reporter.setUser(null);
    expect(reporter.user).toBeNull();
  });

  it('forgets everything on clear', () => {
    const reporter = createRecordingCrashReporter();
    reporter.captureMessage('hello');
    reporter.addBreadcrumb({ category: 'ui' });
    reporter.clear();
    expect(reporter.reports).toEqual([]);
    expect(reporter.breadcrumbs).toEqual([]);
  });
});

import { describe, expect, it } from 'vitest';

import eventsDoc from '../../../docs/architecture/analytics-events.md?raw';

import {
  ANALYTICS_EVENTS,
  createConsentGate,
  createNoopAnalytics,
  createRecordingAnalytics,
} from './analytics';
import { isAnonymousInstallId } from './install-id';
import { analyticsContract } from './testing';

describe('recording analytics (port contract)', () => {
  for (const check of analyticsContract({ sends: true })) {
    it(check.name, () => {
      const analytics = createRecordingAnalytics();
      check.run({ analytics, sent: () => analytics.sent });
    });
  }
});

describe('no-op analytics (port contract)', () => {
  for (const check of analyticsContract({ sends: false })) {
    it(check.name, () => {
      // The no-op adapter has nothing to observe, so "sent" is always empty.
      check.run({ analytics: createNoopAnalytics(), sent: () => [] });
    });
  }

  it('never throws', () => {
    const analytics = createNoopAnalytics();
    analytics.optIn();
    expect(() => {
      analytics.track('game_started', {
        mode: 'bot',
        game: 'portes',
        variant: 'portes',
        matchLength: 3,
      });
      analytics.identify('x');
      analytics.screen('/');
    }).not.toThrow();
  });
});

describe('the contract checks', () => {
  it('catch an adapter that sends before opt-in', () => {
    const leaky = createRecordingAnalytics();
    leaky.optIn(); // Opted in from the start: breaks the rule.
    const [startsOut, before] = analyticsContract({ sends: true });
    expect(() => startsOut!.run({ analytics: leaky, sent: () => leaky.sent })).toThrow();
    expect(() => before!.run({ analytics: leaky, sent: () => leaky.sent })).toThrow(
      /sent before optIn/,
    );
  });
});

describe('createConsentGate', () => {
  it('swallows errors from the vendor', () => {
    const gate = createConsentGate();
    gate.set(true);
    expect(() =>
      gate.send(() => {
        throw new Error('network');
      }),
    ).not.toThrow();
  });
});

describe('isAnonymousInstallId', () => {
  it('accepts random ids and rejects personal data', () => {
    expect(isAnonymousInstallId('3f2b9c1e-7a4d-4e8f-9b0a-1c2d3e4f5a6b')).toBe(true);
    expect(isAnonymousInstallId('someone@example.com')).toBe(false);
    expect(isAnonymousInstallId('Maria P')).toBe(false);
    expect(isAnonymousInstallId('short')).toBe(false);
    expect(isAnonymousInstallId(42)).toBe(false);
  });
});

describe('event names', () => {
  it('lists the event plan (issues #61, #128, #163, #209)', () => {
    expect(ANALYTICS_EVENTS).toEqual([
      'app_opened',
      'game_started',
      'game_finished',
      'game_abandoned',
      'undo_used',
      'resign',
      'settings_changed',
      'theme_changed',
      'tutorial_started',
      'tutorial_step',
      'tutorial_finished',
      'tutorial_skipped',
      'hint_shown',
    ]);
  });

  // The rows of the "Events" table: `| \`name\` | ...`.
  const docEvents = [...eventsDoc.matchAll(/^\| `([\w$]+)` \|/gm)].map((match) => match[1] ?? '');

  it('are all in the event plan doc (docs/architecture/analytics-events.md)', () => {
    for (const event of ANALYTICS_EVENTS) {
      expect({ event, listed: docEvents.includes(event) }).toEqual({ event, listed: true });
    }
  });

  it('match the doc: the doc lists no event the code does not have', () => {
    // `$screen` is PostHog's own screen event, sent by `screen()`.
    const known: readonly string[] = [...ANALYTICS_EVENTS, '$screen'];
    expect(docEvents.filter((event) => !known.includes(event))).toEqual([]);
    expect(new Set(docEvents).size).toBe(docEvents.length);
  });
});

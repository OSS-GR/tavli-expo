import { createMemoryStorage } from '@tavli/contracts';
import { analyticsContract } from '@tavli/contracts/testing';
import { describe, expect, it } from 'vitest';

import { createPostHogAnalytics } from './posthog.web';

const make = () => createPostHogAnalytics({ apiKey: 'phc_test', storage: createMemoryStorage() });

describe('the browser twin of the PostHog adapter', () => {
  for (const check of analyticsContract({ sends: false })) {
    it(check.name, () => {
      check.run({ analytics: make(), sent: () => [] });
    });
  }

  it('keeps the opt-in answer and never throws', () => {
    const analytics = make();
    expect(analytics.isOptedIn()).toBe(false);
    analytics.optIn();
    expect(analytics.isOptedIn()).toBe(true);
    expect(() => analytics.screen('home')).not.toThrow();
    analytics.optOut();
    expect(analytics.isOptedIn()).toBe(false);
  });
});

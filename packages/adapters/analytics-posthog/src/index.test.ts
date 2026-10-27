import { createMemoryStorage, type SentAnalytics } from '@tavli/contracts';
import { analyticsContract } from '@tavli/contracts/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// posthog-react-native ships React Native code, which Node cannot load.
// Replace it with a fake client that records every call.
interface Created {
  apiKey: string;
  options: Record<string, unknown>;
  calls: string[];
}
const created: Created[] = [];

class FakePostHog {
  readonly calls: string[] = [];
  constructor(apiKey: string, options: Record<string, unknown>) {
    created.push({ apiKey, options, calls: this.calls });
  }
  capture(event: string, props?: object) {
    this.calls.push(`capture:${event}:${JSON.stringify(props ?? {})}`);
  }
  identify(id: string) {
    this.calls.push(`identify:${id}`);
  }
  screen(name: string) {
    this.calls.push(`screen:${name}`);
    return Promise.resolve();
  }
  optIn() {
    this.calls.push('optIn');
    return Promise.resolve();
  }
  optOut() {
    this.calls.push('optOut');
    return Promise.resolve();
  }
  reset() {
    this.calls.push('reset');
  }
}

vi.mock('posthog-react-native', () => ({ PostHog: FakePostHog }));

const { createPostHogAnalytics, fromPostHogClient, POSTHOG_EU_HOST } = await import('./index');

/** Turns the fake's capture/identify/screen calls back into port calls. */
function sentFrom(calls: readonly string[]): SentAnalytics[] {
  return calls.flatMap((call): SentAnalytics[] => {
    const [kind, name = '', ...rest] = call.split(':');
    if (kind === 'capture') {
      return [{ type: 'track', event: name as never, props: JSON.parse(rest.join(':')) }];
    }
    if (kind === 'identify') return [{ type: 'identify', id: name }];
    if (kind === 'screen') return [{ type: 'screen', name }];
    return [];
  });
}

beforeEach(() => {
  created.length = 0;
});

describe('PostHog analytics (port contract)', () => {
  for (const check of analyticsContract({ sends: true })) {
    it(check.name, () => {
      const analytics = createPostHogAnalytics({
        apiKey: 'phc_test',
        storage: createMemoryStorage(),
      });
      const client = created[0]!;
      check.run({ analytics, sent: () => sentFrom(client.calls) });
    });
  }
});

describe('createPostHogAnalytics', () => {
  it('uses PostHog EU, starts opted out and turns off automatic capture', () => {
    createPostHogAnalytics({ apiKey: 'phc_test', storage: createMemoryStorage() });
    const { apiKey, options, calls } = created[0]!;

    expect(apiKey).toBe('phc_test');
    expect(POSTHOG_EU_HOST).toBe('https://eu.i.posthog.com');
    expect(options).toMatchObject({
      host: POSTHOG_EU_HOST,
      defaultOptIn: false,
      captureAppLifecycleEvents: false,
      enableSessionReplay: false,
      preloadFeatureFlags: false,
      disableRemoteFeatureFlags: true,
      disableRemoteConfig: true,
      disableSurveys: true,
      disableGeoip: true,
    });
    // PostHog's own saved opt-in from the last run is reset at start.
    expect(calls).toEqual(['optOut']);
  });

  it('keeps PostHog data in the Storage port', () => {
    const storage = createMemoryStorage();
    createPostHogAnalytics({ apiKey: 'k', storage });
    const custom = created[0]!.options['customStorage'] as {
      getItem: (key: string) => string | null;
      setItem: (key: string, value: string) => void;
    };

    expect(custom.getItem('posthog')).toBeNull();
    custom.setItem('posthog', '{"a":1}');
    expect(storage.getString('posthog')).toBe('{"a":1}');
    expect(custom.getItem('posthog')).toBe('{"a":1}');
  });

  it('sends the app version when given', () => {
    createPostHogAnalytics({ apiKey: 'k', storage: createMemoryStorage(), appVersion: '1.2.3' });
    const custom = created[0]!.options['customAppProperties'] as (p: object) => object;
    expect(custom({ $os_name: 'iOS' })).toEqual({ $os_name: 'iOS', $app_version: '1.2.3' });
  });

  it('forgets the PostHog IDs on opt-out', () => {
    const analytics = createPostHogAnalytics({ apiKey: 'k', storage: createMemoryStorage() });
    analytics.optIn();
    analytics.optOut();
    expect(created[0]!.calls).toEqual(['optOut', 'optIn', 'optOut', 'reset']);
  });
});

describe('fromPostHogClient', () => {
  it('never throws when the SDK throws or rejects', async () => {
    const broken = {
      capture: () => {
        throw new Error('boom');
      },
      identify: () => {
        throw new Error('boom');
      },
      screen: () => Promise.reject(new Error('offline')),
      optIn: () => Promise.reject(new Error('offline')),
      optOut: () => {
        throw new Error('boom');
      },
      reset: () => undefined,
    };
    const analytics = fromPostHogClient(broken);
    expect(() => {
      analytics.optIn();
      analytics.track('undo_used');
      analytics.identify('x');
      analytics.screen('/');
      analytics.optOut();
    }).not.toThrow();
    // Let the rejected promises settle: they must not surface as errors.
    await Promise.resolve();
    await Promise.resolve();
    expect(analytics.isOptedIn()).toBe(false);
  });
});

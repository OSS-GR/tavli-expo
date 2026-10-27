/**
 * `Analytics` adapter backed by posthog-react-native, sending to PostHog EU
 * cloud (issue #61, ADR-0003).
 *
 * Privacy (GDPR):
 * - PostHog starts opted out (`defaultOptIn: false`), and the adapter has its
 *   own opt-in gate on top. Nothing is captured before `optIn()`.
 * - No automatic capture: no app lifecycle events, no touch autocapture, no
 *   session replay, no surveys, no feature flags and no remote config. So
 *   the SDK makes no network calls of its own before opt-in.
 * - `optOut()` also empties PostHog's event queue and calls `reset()`.
 *   PostHog's own `optOut()` only stops new captures: events already in the
 *   queue would still upload on the next flush, and `reset()` keeps the
 *   queue on purpose. So we clear it, and PostHog forgets the IDs it stored.
 * - GeoIP lookup is off. The owner should also turn on "Discard client IP
 *   data" in the PostHog project settings.
 *
 * PostHog keeps its queue and IDs in the `Storage` port (MMKV in the app),
 * so it needs no extra native modules.
 */
import {
  createConsentGate,
  isAnonymousInstallId,
  type Analytics,
  type Storage,
} from '@tavli/contracts';
import { PostHog, PostHogPersistedProperty, type PostHogOptions } from 'posthog-react-native';

/** PostHog EU cloud, the ingestion host for EU projects. */
export const POSTHOG_EU_HOST = 'https://eu.i.posthog.com';

/** The PostHog methods this adapter uses. Tests pass a fake. */
export type PostHogClient = Pick<
  PostHog,
  'capture' | 'identify' | 'screen' | 'optIn' | 'optOut' | 'reset' | 'setPersistedProperty'
>;

export interface PostHogAnalyticsOptions {
  /** The PostHog project API key. A public key (`EXPO_PUBLIC_POSTHOG_KEY`). */
  apiKey: string;
  /** Where PostHog keeps its event queue and anonymous IDs. */
  storage: Storage;
  /** Default: PostHog EU cloud. */
  host?: string;
  /** Sent as `$app_version`, so events can be grouped by test build. */
  appVersion?: string;
}

/** Drops a rejected promise: analytics must never surface an error. */
function settle(result: unknown): void {
  if (result instanceof Promise) result.catch(() => undefined);
}

/** Runs one SDK call and drops its errors (thrown or rejected). */
function attempt(call: () => unknown): void {
  try {
    settle(call());
  } catch {
    // Ignore: the gate still blocks every event.
  }
}

/** The PostHog settings we use. Exported for tests. */
export function postHogOptions({
  storage,
  host = POSTHOG_EU_HOST,
  appVersion,
}: Omit<PostHogAnalyticsOptions, 'apiKey'>): PostHogOptions {
  return {
    host,
    defaultOptIn: false,
    persistence: 'file',
    customStorage: {
      getItem: (key) => storage.getString(key) ?? null,
      setItem: (key, value) => storage.setString(key, value),
    },
    captureAppLifecycleEvents: false,
    enableSessionReplay: false,
    preloadFeatureFlags: false,
    disableRemoteFeatureFlags: true,
    disableRemoteConfig: true,
    disableSurveys: true,
    disableGeoip: true,
    setDefaultPersonProperties: false,
    capturePushNotificationSubscriptions: false,
    capturePushNotificationOpened: false,
    ...(appVersion === undefined
      ? {}
      : { customAppProperties: (props) => ({ ...props, $app_version: appVersion }) }),
  };
}

/** Wraps a PostHog client in the `Analytics` port. Starts opted out. */
export function fromPostHogClient(client: PostHogClient): Analytics {
  const gate = createConsentGate();
  // PostHog keeps its own opt-in flag from the last run. Our gate is the
  // source of truth, so start PostHog opted out too. (Its queue stays: it
  // only holds events from after an "Allow", and an opt-out empties it.)
  attempt(() => client.optOut());
  return {
    track: (event, ...props) =>
      gate.send(() =>
        client.capture(event, props[0] as Record<string, string | number> | undefined),
      ),
    identify: (id) => {
      if (isAnonymousInstallId(id)) gate.send(() => client.identify(id));
    },
    screen: (name) => gate.send(() => settle(client.screen(name))),
    optIn: () => {
      gate.set(true);
      attempt(() => client.optIn());
    },
    optOut: () => {
      gate.set(false);
      // Each step on its own, so one failure does not skip the others.
      attempt(() => client.optOut());
      // Events captured before the opt-out must not upload after it.
      attempt(() => client.setPersistedProperty(PostHogPersistedProperty.Queue, null));
      attempt(() => client.reset());
    },
    isOptedIn: gate.isOptedIn,
  };
}

/** The app's analytics: a PostHog client for the EU cloud behind the port. */
export function createPostHogAnalytics({ apiKey, ...options }: PostHogAnalyticsOptions): Analytics {
  return fromPostHogClient(new PostHog(apiKey, postHogOptions(options)));
}

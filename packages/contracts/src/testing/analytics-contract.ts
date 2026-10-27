/**
 * The `Analytics` port contract, as plain checks that work in any test
 * runner (Vitest in packages, Jest in the app).
 *
 *   for (const check of analyticsContract({ sends: true })) {
 *     it(check.name, () => check.run(makeSubject()));
 *   }
 *
 * A check throws an `Error` when the adapter breaks the contract.
 */
import type { Analytics, SentAnalytics } from '../analytics';

export interface AnalyticsContractSubject {
  readonly analytics: Analytics;
  /** What reached the vendor so far, oldest first. */
  readonly sent: () => readonly SentAnalytics[];
}

export interface AnalyticsContractCheck {
  readonly name: string;
  readonly run: (subject: AnalyticsContractSubject) => void;
}

export interface AnalyticsContractOptions {
  /** `false` for the no-op adapter: it never sends, even when opted in. */
  readonly sends: boolean;
}

function same(actual: unknown, expected: unknown, what: string): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${what}: expected ${e}, got ${a}`);
}

function sendAll(analytics: Analytics): void {
  analytics.track('app_opened');
  analytics.track('settings_changed', { key: 'sound' });
  analytics.identify('install-0001');
  analytics.screen('/settings');
}

const ALL: readonly SentAnalytics[] = [
  { type: 'track', event: 'app_opened', props: {} },
  { type: 'track', event: 'settings_changed', props: { key: 'sound' } },
  { type: 'identify', id: 'install-0001' },
  { type: 'screen', name: '/settings' },
];

export function analyticsContract({ sends }: AnalyticsContractOptions): AnalyticsContractCheck[] {
  const expected = sends ? ALL : [];
  return [
    {
      name: 'starts opted out',
      run: ({ analytics }) => same(analytics.isOptedIn(), false, 'isOptedIn()'),
    },
    {
      name: 'sends nothing before opt-in',
      run: ({ analytics, sent }) => {
        sendAll(analytics);
        same(sent(), [], 'sent before optIn()');
      },
    },
    {
      name: sends ? 'sends events after opt-in' : 'never sends, even after opt-in',
      run: ({ analytics, sent }) => {
        analytics.optIn();
        same(analytics.isOptedIn(), true, 'isOptedIn() after optIn()');
        sendAll(analytics);
        same(sent(), expected, 'sent after optIn()');
      },
    },
    {
      name: 'opt-out stops events at once',
      run: ({ analytics, sent }) => {
        analytics.optIn();
        analytics.optOut();
        same(analytics.isOptedIn(), false, 'isOptedIn() after optOut()');
        sendAll(analytics);
        same(sent(), [], 'sent after optOut()');
      },
    },
    {
      name: 'ignores an identify ID that is not anonymous',
      run: ({ analytics, sent }) => {
        analytics.optIn();
        analytics.identify('someone@example.com');
        analytics.identify('Maria Papadopoulou');
        same(sent(), [], 'sent for a personal ID');
      },
    },
    {
      name: 'opting in again sends again',
      run: ({ analytics, sent }) => {
        analytics.optIn();
        analytics.optOut();
        analytics.optIn();
        sendAll(analytics);
        same(sent(), expected, 'sent after optIn() again');
      },
    },
  ];
}

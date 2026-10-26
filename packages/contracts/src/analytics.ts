/**
 * Analytics port: anonymous usage events (issue #61, ADR-0003).
 *
 * The event names and properties are fixed here, so a typo is a type error.
 * The plan for each event (when it fires, what it means) is in
 * `docs/architecture/analytics-events.md`. Keep the two in step.
 *
 * Privacy rules (GDPR) every adapter must follow:
 * - It starts **opted out**. `track`, `identify` and `screen` send nothing
 *   until `optIn()` is called. The app calls `optIn()` only after the user
 *   says yes.
 * - After `optOut()` nothing more is sent.
 * - No personal data: no names, no emails. The app passes the random
 *   install ID to `identify`, never an account ID. Adapters drop IDs that
 *   fail `isAnonymousInstallId` (an email, a name with spaces).
 * - Calls never throw. Analytics must not break the game.
 *
 * Adapters: `@tavli/analytics-posthog` (the app), `createNoopAnalytics` (no
 * key, local dev) and `createRecordingAnalytics` (tests).
 */
import type { Difficulty } from './bot-runner';
import { isAnonymousInstallId } from './install-id';

/** How a game is played. */
export type GameMode = 'bot' | 'local' | 'online';

/**
 * How a game ended: 1 point (mono), 2 or more points (diplo), a resign, or a
 * draw (Plakoto both mothers pinned, Asodio deadlock).
 */
export type GameResultKind = 'mono' | 'diplo' | 'resign' | 'draw';

/** Every event and its properties. Property values are short strings, numbers or booleans. */
export interface AnalyticsEvents {
  app_opened: Record<string, never>;
  game_started: {
    mode: GameMode;
    /** Engine variant id, for example `portes`. */
    variant: string;
    /** Points to win the match. */
    matchLength: number;
    /** Only for `mode: 'bot'`. */
    botLevel?: Difficulty;
  };
  game_finished: {
    mode: GameMode;
    variant: string;
    result: GameResultKind;
    /** Turns played in this game. */
    turns: number;
    durationSec: number;
  };
  game_abandoned: {
    mode: GameMode;
    variant: string;
    /** The turn number when the player left. */
    turn: number;
  };
  undo_used: Record<string, never>;
  resign: Record<string, never>;
  /** A setting changed. Only the key, never the value. Theme uses `theme_changed`. */
  settings_changed: { key: string };
  theme_changed: { theme: string };
}

export type AnalyticsEventName = keyof AnalyticsEvents;

/** Every event name, for run-time checks and docs tests. */
export const ANALYTICS_EVENTS = [
  'app_opened',
  'game_started',
  'game_finished',
  'game_abandoned',
  'undo_used',
  'resign',
  'settings_changed',
  'theme_changed',
] as const satisfies readonly AnalyticsEventName[];

type MissingEvent = Exclude<AnalyticsEventName, (typeof ANALYTICS_EVENTS)[number]>;
const NO_MISSING_EVENT: MissingEvent extends never ? true : false = true;
void NO_MISSING_EVENT;

/** Events without properties take no second argument. */
export type AnalyticsPropsArg<E extends AnalyticsEventName> =
  AnalyticsEvents[E] extends Record<string, never> ? [] : [props: AnalyticsEvents[E]];

export interface Analytics {
  /** Sends one event. Does nothing while opted out. */
  track<E extends AnalyticsEventName>(event: E, ...props: AnalyticsPropsArg<E>): void;
  /** Sets the anonymous install ID. Does nothing while opted out, or for an ID that is not anonymous. */
  identify(id: string): void;
  /** Records a screen view. `name` is a route pattern such as `/settings`, never a URL with IDs. */
  screen(name: string): void;
  /** The user said yes: start sending. */
  optIn(): void;
  /** The user said no (or changed their mind): stop sending at once. */
  optOut(): void;
  /** `true` after `optIn()`, until `optOut()`. */
  isOptedIn(): boolean;
}

/** One call that reached the vendor (or the recorder). */
export type SentAnalytics =
  | { readonly type: 'track'; readonly event: AnalyticsEventName; readonly props: object }
  | { readonly type: 'identify'; readonly id: string }
  | { readonly type: 'screen'; readonly name: string };

/**
 * The opt-in switch every adapter shares. `send` runs only while opted in.
 * Adapters build on this, so the "no events before opt-in" rule lives in one place.
 */
export function createConsentGate() {
  let optedIn = false;
  return {
    isOptedIn: () => optedIn,
    set: (value: boolean) => {
      optedIn = value;
    },
    /** Runs `send` only while opted in, and swallows its errors. */
    send: (send: () => void) => {
      if (!optedIn) return;
      try {
        send();
      } catch {
        // Analytics must never break the app.
      }
    },
  };
}

/** Analytics that never sends anything. Used when there is no PostHog key, and in tests. */
export function createNoopAnalytics(): Analytics {
  const gate = createConsentGate();
  return {
    track: () => undefined,
    identify: () => undefined,
    screen: () => undefined,
    optIn: () => gate.set(true),
    optOut: () => gate.set(false),
    isOptedIn: gate.isOptedIn,
  };
}

/** Analytics that keeps every call it would send, for tests. Follows the opt-in rules. */
export function createRecordingAnalytics(): Analytics & { readonly sent: SentAnalytics[] } {
  const gate = createConsentGate();
  const sent: SentAnalytics[] = [];
  return {
    sent,
    track: (event, ...props) =>
      gate.send(() => sent.push({ type: 'track', event, props: props[0] ?? {} })),
    identify: (id) => {
      if (isAnonymousInstallId(id)) gate.send(() => sent.push({ type: 'identify', id }));
    },
    screen: (name) => gate.send(() => sent.push({ type: 'screen', name })),
    optIn: () => gate.set(true),
    optOut: () => gate.set(false),
    isOptedIn: gate.isOptedIn,
  };
}

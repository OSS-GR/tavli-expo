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
import type { PresetId } from '@tavli/engine';

import type { Difficulty } from './bot-runner';
import { isAnonymousInstallId } from './install-id';

/** How a game is played. `online` is for online play (MVP2): no screen sends it yet. */
export type GameMode = 'bot' | 'local' | 'online';

/**
 * The game picked on the new-game screen (#109): one game, or `tavli`, a full
 * Tavli match (Portes, Plakoto and Fevga in rotation). `variant` on the game
 * events is the game in play, so only this property tells a Tavli match apart.
 */
export type MatchGame = 'portes' | 'plakoto' | 'fevga' | 'tavli' | 'asodio';

/**
 * The opening roll house rule of the match (#207), the engine flag
 * `match.openingRoll`: `useOpeningDice` (the federation rule, default),
 * `rerollBoth` or `chosenStarterRolls`. A value id only.
 */
export type OpeningRollRule = 'useOpeningDice' | 'rerollBoth' | 'chosenStarterRolls';

/** What a `theme_changed` event is about: the app colors or the board. */
export type ThemeKind = 'app' | 'board';

/**
 * How a game ended: 1 point (mono), 2 or more points (diplo), a resign, a
 * draw (Plakoto both mothers pinned, Asodio deadlock), or a time-out (an
 * online turn timer ran out, #170).
 */
export type GameResultKind = 'mono' | 'diplo' | 'resign' | 'draw' | 'timeout';

/** Where the tutorial was opened: the Home card, a rules page, or Settings. */
export type TutorialSource = 'home' | 'rules' | 'settings';

/**
 * Which lesson set of the tutorial: Portes (the first-run tutorial),
 * Plakoto or Fevga (#149), or Asodio (#159).
 */
export type TutorialGame = 'portes' | 'plakoto' | 'fevga' | 'asodio';

/** Every event and its properties. Property values are short strings, numbers or booleans. */
export interface AnalyticsEvents {
  app_opened: Record<string, never>;
  game_started: {
    mode: GameMode;
    game: MatchGame;
    /** Engine variant id, for example `portes`. */
    variant: string;
    /** Points to win the match. */
    matchLength: number;
    /** Only for `mode: 'bot'`. */
    botLevel?: Difficulty;
    /** The opening roll house rule (#207). */
    openingRoll: OpeningRollRule;
    /**
     * The rules version of the game in play (#241): its engine preset id,
     * for example `plakoto.federation`. A value id only.
     */
    rulesVersion: PresetId;
  };
  game_finished: {
    mode: GameMode;
    game: MatchGame;
    variant: string;
    result: GameResultKind;
    /** Turns played in this game. */
    turns: number;
    /**
     * Seconds since `game_started`. Left out when the start is not known:
     * the game in play of a match resumed from a save.
     */
    durationSec?: number;
  };
  game_abandoned: {
    mode: GameMode;
    game: MatchGame;
    variant: string;
    /** The turn number when the player left. */
    turn: number;
  };
  undo_used: Record<string, never>;
  resign: Record<string, never>;
  /** A setting changed. Only the key, never the value. The themes use `theme_changed`. */
  settings_changed: { key: string };
  /** The app colors (`kind: 'app'`) or the board theme (`kind: 'board'`) changed. `theme` is its id. */
  theme_changed: { kind: ThemeKind; theme: string };
  /** The tutorial opened. `game` is the lesson set. */
  tutorial_started: { source: TutorialSource; game: TutorialGame };
  /** A lesson of the tutorial was learnt. `step` counts from 1. */
  tutorial_step: { game: TutorialGame; step: number; lesson: string };
  /** The last lesson was learnt. */
  tutorial_finished: { game: TutorialGame };
  /** Skip was tapped. `step` is the lesson on screen, from 1. */
  tutorial_skipped: { game: TutorialGame; step: number; lesson: string };
  /**
   * The Hint button (#209) showed the best turn. Only which game: never the
   * position, the dice or the moves.
   */
  hint_shown: {
    game: MatchGame;
    /** Engine variant id: the game in play. */
    variant: string;
  };
  /**
   * The game review (#215) opened after a game. Only which game was picked
   * for the match: never the position, the dice, the moves or the mistakes.
   */
  review_opened: { game: MatchGame };
  /**
   * The player made an invite to play a friend online (#281). Only the
   * game, the match length and the turn time: never the code, a game id or a
   * user id.
   */
  invite_created: {
    game: MatchGame;
    /** Points to win. */
    matchLength: number;
    /**
     * A per-turn time limit in minutes, or `undefined` for the 24-hour
     * default (the async behaviour, #183). Omitted when `undefined`.
     */
    turnTimeMinutes?: number;
  };
  /**
   * The phone's answer to the system prompt for turn notifications (#285),
   * after the player asked to turn them on. Only `granted` or `denied`:
   * never the push token or a user id.
   */
  push_permission_answered: {
    answer: 'granted' | 'denied';
  };
}

export type AnalyticsEventName = keyof AnalyticsEvents;

/**
 * A property value: never an object or a list. A string is an id from a
 * fixed set, never a name or free text.
 */
type AnalyticsValue = string | number | boolean | undefined;
type EventWithBadProps = {
  [E in AnalyticsEventName]: AnalyticsEvents[E] extends Record<string, AnalyticsValue> ? never : E;
}[AnalyticsEventName];
const NO_BAD_PROPS: EventWithBadProps extends never ? true : false = true;
void NO_BAD_PROPS;

/**
 * Every event name: the one list in code. Tests check it against the code
 * that sends events (`apps/mobile/src/features/analytics/eventPlan.test.ts`)
 * and against the event plan doc.
 */
export const ANALYTICS_EVENTS = [
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
  'review_opened',
  'invite_created',
  'push_permission_answered',
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

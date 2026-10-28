/**
 * Turn notifications on the phone (#285): the app side of "Your turn"
 * pushes. Two ports:
 *
 * - `PushNotifications`: the phone's notification system. The permission,
 *   the system prompt, the Expo push token, and taps on a push.
 * - `PushTokens`: the server's list of push tokens (`registerPushToken`
 *   and `removePushToken` in `apps/server/convex/push.ts`).
 *
 * Do not mix them up with `PushProvider` (`push.ts`): that is the
 * server's sender, which gives the pushes to Expo.
 *
 * Rules for every `PushNotifications` adapter:
 * - No call rejects or throws. A phone with no notification system (a
 *   simulator, no network) gives `denied` and no token.
 * - `requestPermission` shows the system prompt only while the answer is
 *   `undetermined`. The phone shows it once; after that only the phone's
 *   own settings can change the answer. A prompt that fails (the native
 *   call throws) resolves `undetermined`: the player gave no answer.
 * - `getToken` asks for no token while the permission is not `granted`.
 * - A listener is never called inside the call that adds it, and never
 *   after its stop function.
 *
 * The Expo adapter is `@tavli/notifications-expo`. The in-memory ones
 * below are for tests. The contract checks are `pushNotificationsContract`
 * and `pushTokensContract` in `@tavli/contracts/testing`. See "Turn
 * notifications" in `docs/architecture/app-shell.md`.
 */
import type { GameTransportErrorData } from './game-transport';

/**
 * What the phone allows:
 * - `granted`: the app may show pushes (on iOS also "provisional": quiet pushes).
 * - `denied`: it may not, and the system prompt will not show again. Only
 *   the phone's settings can turn it on.
 * - `undetermined`: not asked yet. `requestPermission` shows the system prompt.
 */
export const PUSH_PERMISSIONS = ['granted', 'denied', 'undetermined'] as const;

export type PushPermission = (typeof PUSH_PERMISSIONS)[number];

export function isPushPermission(value: unknown): value is PushPermission {
  return typeof value === 'string' && (PUSH_PERMISSIONS as readonly string[]).includes(value);
}

/** The platform of a push token, as the server keeps it (`pushPlatform` in `schema.ts`). */
export const PUSH_PLATFORMS = ['ios', 'android'] as const;

export type PushPlatform = (typeof PUSH_PLATFORMS)[number];

/** A tap on a push. Plain JSON. */
export interface PushTap {
  /** The id of the push. The same tap reported twice has the same id. */
  readonly id: string;
  /** `data.gameId` of the push, or `null` when it has none (or it is not a string). */
  readonly gameId: string | null;
}

export interface PushNotifications {
  /** The platform of this phone, for `PushTokens.register`. */
  readonly platform: PushPlatform;
  /** What the phone allows now. Shows nothing. */
  permission(): Promise<PushPermission>;
  /**
   * Shows the system prompt when the answer is `undetermined`, and
   * resolves with the answer. Otherwise resolves with the answer it has,
   * and shows nothing.
   */
  requestPermission(): Promise<PushPermission>;
  /**
   * The Expo push token of this phone, or `null` when the permission is
   * not `granted` or the token cannot be had now (no network, a simulator).
   * Asking for it may reach Expo's servers: call it only when the user
   * plays online.
   */
  getToken(): Promise<string | null>;
  /** Calls `listener` with the new token when the push service changes it. Returns a stop function. */
  onTokenChange(listener: (token: string) => void): () => void;
  /**
   * The tap that opened the app, once: a second call resolves `null`.
   * `null` when the app was not opened by a tap.
   */
  lastTap(): Promise<PushTap | null>;
  /** Calls `listener` for each tap on a push while the app runs. Returns a stop function. */
  onTap(listener: (tap: PushTap) => void): () => void;
}

/**
 * The server's push tokens of the signed-in user (#280). No call takes a
 * player id: the server reads the caller from the sign-in.
 */
export interface PushTokens {
  /**
   * Saves `token` for the signed-in user (again is fine: it marks it
   * fresh). Rejects with `GameTransportErrorData`: `NOT_SIGNED_IN` with
   * nobody signed in, `BAD_REQUEST` for a token that is not an Expo push token.
   */
  register(token: string, platform: PushPlatform): Promise<void>;
  /**
   * Removes `token` of the signed-in user. A token that is not theirs, or
   * not saved, stays as it is. Rejects like `register`. Call it before
   * sign-out: after it, the call fails `NOT_SIGNED_IN`.
   */
  remove(token: string): Promise<void>;
}

/** The shape of an Expo push token (the same check as `isExpoPushToken` in `@tavli/push-expo`). */
const EXPO_TOKEN_SHAPE = /^Expo(?:nent)?PushToken\[[^\s[\]]+\]$/;
/** The longest token the server keeps (`MAX_EXPO_PUSH_TOKEN_LENGTH` in `@tavli/push-expo`). */
const MAX_PUSH_TOKEN_LENGTH = 200;

/** The data of a push: `gameId` when it is a string that is not empty. */
export function gameIdOfPush(data: unknown): string | null {
  if (typeof data !== 'object' || data === null) return null;
  const gameId = (data as { gameId?: unknown }).gameId;
  return typeof gameId === 'string' && gameId !== '' ? gameId : null;
}

// ---------------------------------------------------------------------------
// In memory, for tests

/** A `PushNotifications` in memory, with controls for tests. */
export interface MemoryPushNotifications extends PushNotifications {
  /** Sets what the phone allows. */
  setPermission(permission: PushPermission): void;
  /** What the system prompt answers from now on (default `granted`). */
  answerPromptWith(answer: 'granted' | 'denied'): void;
  /** How many times the system prompt showed. */
  readonly prompts: number;
  /** How many times `getToken` asked for a token (it was granted then). */
  readonly tokenRequests: number;
  /** The token of this phone (`ExponentPushToken[memory-<n>]`). */
  readonly token: string;
  /** The push service gives the phone a new token, and tells the listeners. Returns it. */
  rollToken(): string;
  /**
   * The player taps a push with `data`. With `opensApp`, the tap opened
   * the app: `lastTap` gives it, and the listeners get nothing. Returns the tap.
   */
  tap(data: unknown, options?: { readonly opensApp?: boolean }): PushTap;
  /** From now on every call fails like a phone with no notification system (`true`), or works again. */
  breakPlatform(broken: boolean): void;
  /** Back to the start: `undetermined`, the first token, no taps. The listeners stay. */
  reset(): void;
}

/** Calls each listener later, on a microtask, if it is still on. */
function tell<T>(listeners: Set<(value: T) => void>, value: T): void {
  for (const listener of [...listeners]) {
    void Promise.resolve().then(() => {
      if (listeners.has(listener)) listener(value);
    });
  }
}

function on<T>(listeners: Set<(value: T) => void>, listener: (value: T) => void): () => void {
  const own = (value: T) => listener(value);
  listeners.add(own);
  return () => {
    listeners.delete(own);
  };
}

/**
 * A `PushNotifications` in memory: it starts `undetermined`, the system
 * prompt answers `granted`, and the token is `ExponentPushToken[memory-1]`
 * (`rollToken` makes `memory-2`, …).
 */
export function createMemoryPushNotifications(
  platform: PushPlatform = 'ios',
): MemoryPushNotifications {
  let permission: PushPermission = 'undetermined';
  let answer: 'granted' | 'denied' = 'granted';
  let prompts = 0;
  let tokenRequests = 0;
  let tokenNumber = 1;
  let taps = 0;
  let opening: PushTap | null = null;
  let broken = false;
  const tokenListeners = new Set<(token: string) => void>();
  const tapListeners = new Set<(tap: PushTap) => void>();
  const token = () => `ExponentPushToken[memory-${tokenNumber}]`;

  return {
    platform,
    permission: () => Promise.resolve(broken ? 'denied' : permission),
    async requestPermission() {
      await Promise.resolve();
      if (broken) return 'denied';
      if (permission === 'undetermined') {
        prompts += 1;
        permission = answer;
      }
      return permission;
    },
    async getToken() {
      await Promise.resolve();
      if (broken || permission !== 'granted') return null;
      tokenRequests += 1;
      return token();
    },
    onTokenChange: (listener) => on(tokenListeners, listener),
    async lastTap() {
      await Promise.resolve();
      if (broken) return null;
      const tap = opening;
      opening = null;
      return tap === null ? null : { ...tap };
    },
    onTap: (listener) => on(tapListeners, listener),

    setPermission(next) {
      permission = next;
    },
    answerPromptWith(next) {
      answer = next;
    },
    get prompts() {
      return prompts;
    },
    get tokenRequests() {
      return tokenRequests;
    },
    get token() {
      return token();
    },
    rollToken() {
      tokenNumber += 1;
      tell(tokenListeners, token());
      return token();
    },
    tap(data, options = {}) {
      taps += 1;
      const tap: PushTap = { id: `tap-${taps}`, gameId: gameIdOfPush(data) };
      if (options.opensApp === true) opening = tap;
      else tell(tapListeners, tap);
      return { ...tap };
    },
    breakPlatform(next) {
      broken = next;
    },
    reset() {
      permission = 'undetermined';
      answer = 'granted';
      prompts = 0;
      tokenRequests = 0;
      tokenNumber = 1;
      taps = 0;
      opening = null;
      broken = false;
    },
  };
}

/** One saved push token in `createMemoryPushTokens`. */
export interface SavedPushToken {
  readonly playerId: string;
  readonly token: string;
  readonly platform: PushPlatform;
}

/** One call to `createMemoryPushTokens`, with the user signed in at that moment. */
export type PushTokenCall =
  | {
      readonly kind: 'register';
      readonly playerId: string | null;
      readonly token: string;
      readonly platform: PushPlatform;
    }
  | { readonly kind: 'remove'; readonly playerId: string | null; readonly token: string };

/** A `PushTokens` in memory, with what it saved and every call, for tests. */
export interface MemoryPushTokens extends PushTokens {
  /** The saved tokens, oldest first. */
  readonly saved: readonly SavedPushToken[];
  /** Every call so far, in order (also the ones that failed). */
  readonly calls: readonly PushTokenCall[];
  /** Forgets the saved tokens and the calls. */
  reset(): void;
}

function tokenError(
  code: 'NOT_SIGNED_IN' | 'BAD_REQUEST',
  message: string,
): GameTransportErrorData {
  return { code, message };
}

/**
 * The server's push token list in memory, like `registerPushToken` and
 * `removePushToken`: each call comes from `currentUser()` (a player id,
 * or `null` with nobody signed in). A token registered by another player
 * moves to the caller.
 */
export function createMemoryPushTokens(currentUser: () => string | null): MemoryPushTokens {
  let saved: SavedPushToken[] = [];
  let calls: PushTokenCall[] = [];

  async function caller(token: string): Promise<string> {
    await Promise.resolve();
    const playerId = currentUser();
    if (playerId === null) throw tokenError('NOT_SIGNED_IN', 'nobody is signed in');
    if (token.length > MAX_PUSH_TOKEN_LENGTH || !EXPO_TOKEN_SHAPE.test(token)) {
      throw tokenError('BAD_REQUEST', 'not an Expo push token');
    }
    return playerId;
  }

  return {
    async register(token, platform) {
      calls = [...calls, { kind: 'register', playerId: currentUser(), token, platform }];
      const playerId = await caller(token);
      saved = [...saved.filter((row) => row.token !== token), { playerId, token, platform }];
    },
    async remove(token) {
      calls = [...calls, { kind: 'remove', playerId: currentUser(), token }];
      const playerId = await caller(token);
      saved = saved.filter((row) => !(row.token === token && row.playerId === playerId));
    },
    get saved() {
      return saved;
    },
    get calls() {
      return calls;
    },
    reset() {
      saved = [];
      calls = [];
    },
  };
}

/**
 * Turn notifications (#285): when the app asks for the push permission,
 * and the push token on the server. See "Turn notifications" in
 * `docs/architecture/app-shell.md`.
 *
 * - Never at first launch. `offer()` runs after the player makes or
 *   accepts an async invite. It shows the offer (`offering`) only while
 *   the phone has not been asked and the player has not said "Not now".
 * - "Not now" (or "no" to the system prompt) is saved (`declined`): the
 *   app offers again only from Settings (`turnOn`).
 * - `sync()` registers the token once per app run for the signed-in user,
 *   and again when the token or the user changes. It needs a granted
 *   permission and a signed-in user; it makes no account.
 * - `unregister()` removes the token from the server. Call it before
 *   sign-out (`signOutOfOnline` in `features/online/account.ts`): the
 *   server call needs a live session.
 *
 * Pure: the ports come in as arguments, so tests pass in-memory ones.
 * The app's instance is `features/notifications/appTurnPushes.ts`.
 * Never send the token or the user id to analytics.
 */
import type {
  AuthProvider,
  PushNotifications,
  PushPermission,
  PushTokens,
  Storage,
} from '@tavli/contracts';
import { createStore, type StoreApi } from 'zustand/vanilla';

/** Storage key. The saved value is `{ "declined": boolean }` JSON. */
export const TURN_PUSHES_STORAGE_KEY = 'turnPushes';

export interface TurnPushesState {
  /**
   * The player said "Not now" to the offer, or no to the system prompt.
   * The app does not offer again by itself; Settings still can. Saved.
   */
  readonly declined: boolean;
  /** What the phone allows, as last read. `null` before the first read. */
  readonly permission: PushPermission | null;
  /** The offer shows ("We tell you when it is your turn"). */
  readonly offering: boolean;
  /** The system prompt is open (the player tapped "Turn on"). */
  readonly asking: boolean;
}

export interface TurnPushesDeps {
  readonly storage: Storage;
  readonly notifications: PushNotifications;
  readonly pushTokens: PushTokens;
  readonly auth: AuthProvider;
  /** The player answered the system prompt. Only for the analytics event. */
  readonly onAnswer?: (answer: 'granted' | 'denied') => void;
}

export interface TurnPushes {
  readonly store: StoreApi<TurnPushesState>;
  /**
   * After an async invite: shows the offer when it may, or registers the
   * token when the phone already allows pushes.
   */
  offer(): Promise<void>;
  /** "Not now" on the offer: hide it, and do not offer again by itself. */
  notNow(): void;
  /**
   * "Turn on" (the offer or Settings): shows the system prompt while the
   * phone has not been asked, then registers the token on a yes. Resolves
   * to what the phone allows after it.
   */
  turnOn(): Promise<PushPermission>;
  /** Reads what the phone allows (Settings, and the app coming back). */
  refresh(): Promise<PushPermission>;
  /** Registers the token for the signed-in user, when it is new. Never rejects. */
  sync(): Promise<void>;
  /** Removes this phone's token from the server, for the signed-in user. Never rejects. */
  unregister(): Promise<void>;
  /** Stops the token listener (tests). */
  stop(): void;
}

function loadDeclined(storage: Storage): boolean {
  const raw = storage.getString(TURN_PUSHES_STORAGE_KEY);
  if (raw === undefined) return false;
  try {
    const saved: unknown = JSON.parse(raw);
    return (
      typeof saved === 'object' &&
      saved !== null &&
      (saved as { declined?: unknown }).declined === true
    );
  } catch {
    return false;
  }
}

/** What was registered on the server in this app run. */
interface Registered {
  readonly userId: string;
  readonly token: string;
}

export function createTurnPushes(deps: TurnPushesDeps): TurnPushes {
  const { storage, notifications, pushTokens, auth, onAnswer } = deps;
  const store = createStore<TurnPushesState>()(() => ({
    declined: loadDeclined(storage),
    permission: null,
    offering: false,
    asking: false,
  }));
  /** One sync (or removal) at a time, in order. */
  let chain: Promise<void> = Promise.resolve();
  let registered: Registered | null = null;
  let stopTokenListener: (() => void) | null = null;
  /** An `offer()` that has not decided yet: a second one does nothing. */
  let offerRunning = false;

  function setDeclined(declined: boolean): void {
    if (store.getState().declined === declined) return;
    storage.setString(TURN_PUSHES_STORAGE_KEY, JSON.stringify({ declined }));
    store.setState({ declined });
  }

  async function refresh(): Promise<PushPermission> {
    const permission = await notifications.permission();
    store.setState({ permission });
    return permission;
  }

  /** Runs `step` after every step before it. The chain never rejects. */
  function queue(step: () => Promise<void>): Promise<void> {
    const next = chain.then(step).catch(() => undefined);
    chain = next;
    return next;
  }

  async function syncNow(): Promise<void> {
    const user = await auth.ready();
    if (user === null) return;
    if ((await refresh()) !== 'granted') return;
    // A new token later (the push service may change it) registers again.
    stopTokenListener ??= notifications.onTokenChange(() => {
      void sync();
    });
    const token = await notifications.getToken();
    if (token === null) return;
    const before = registered;
    if (before !== null && before.userId === user.id && before.token === token) return;
    await pushTokens.register(token, notifications.platform);
    registered = { userId: user.id, token };
    // The old token of this user is dead: take it off the list. A failed
    // call only leaves it until Expo says it is gone.
    if (before !== null && before.userId === user.id && before.token !== token) {
      await pushTokens.remove(before.token).catch(() => undefined);
    }
  }

  function sync(): Promise<void> {
    return queue(syncNow);
  }

  return {
    store,

    async offer() {
      if (offerRunning || store.getState().offering) return;
      offerRunning = true;
      try {
        const permission = await refresh();
        if (permission === 'granted') {
          void sync();
          return;
        }
        if (permission !== 'undetermined' || store.getState().declined) return;
        store.setState({ offering: true });
      } finally {
        offerRunning = false;
      }
    },

    notNow() {
      store.setState({ offering: false });
      setDeclined(true);
    },

    async turnOn() {
      if (store.getState().asking) return store.getState().permission ?? 'undetermined';
      store.setState({ asking: true });
      const before = await notifications.permission();
      const answer = await notifications.requestPermission();
      // Only a real answer to the system prompt: granted or denied.
      if (before === 'undetermined') onAnswer?.(answer === 'granted' ? 'granted' : 'denied');
      setDeclined(answer !== 'granted');
      store.setState({ permission: answer, offering: false, asking: false });
      if (answer === 'granted') void sync();
      return answer;
    },

    refresh,
    sync,

    unregister() {
      return queue(async () => {
        const token = registered?.token ?? (await notifications.getToken());
        registered = null;
        if (token === null) return;
        await pushTokens.remove(token);
      });
    },

    stop() {
      stopTokenListener?.();
      stopTokenListener = null;
    },
  };
}

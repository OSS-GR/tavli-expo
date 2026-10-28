/**
 * Turn notifications (#285): when the app asks for the push permission,
 * and the push token on the server. See "Turn notifications" in
 * `docs/architecture/app-shell.md`.
 *
 * - Never at first launch. `offer()` runs after the player makes or
 *   accepts an async invite. It shows the offer (`offering`) unless the
 *   player turned them on already, said "Not now", or the phone blocks
 *   them. It shows also when the phone allows pushes already (Android 12
 *   and older allow them from the install): only "Turn on" sends a token.
 * - "Turn on" (the offer or Settings) is the in-app choice (`turnedOn`,
 *   saved). It shows the system prompt only while the phone has not been
 *   asked.
 * - "Not now" (or "no" to the system prompt) is saved (`declined`): the
 *   app offers again only from Settings (`turnOn`).
 * - `sync()` registers the token once per app run for the signed-in user,
 *   and again when the token or the user changes. It needs the in-app
 *   choice, a phone that has used an online account (`hasAccount`), a
 *   granted permission and a signed-in user; it makes no account.
 * - `unregister(then)` removes the token from the server, then runs
 *   `then` (the sign-out) before any later sync, so a sync cannot put the
 *   token back while the user signs out (`signOutOfOnline` in
 *   `features/online/account.ts`). The server call needs a live session.
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

/** Storage key. The saved value is `{ "declined": boolean, "turnedOn": boolean }` JSON. */
export const TURN_PUSHES_STORAGE_KEY = 'turnPushes';

export interface TurnPushesState {
  /**
   * The player said "Not now" to the offer, or no to the system prompt.
   * The app does not offer again by itself; Settings still can. Saved.
   */
  readonly declined: boolean;
  /**
   * The player tapped "Turn on" (the offer or Settings) and the phone
   * allowed it. Only then does a token go to the server. Saved.
   */
  readonly turnedOn: boolean;
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
  /**
   * True when this phone has used an online account (`accountHint.ts`).
   * Without one, `sync()` does not ask for the session: a player who never
   * played online makes no server call. Default: always true.
   */
  readonly hasAccount?: () => boolean;
}

export interface TurnPushes {
  readonly store: StoreApi<TurnPushesState>;
  /**
   * After an async invite: shows the offer when it may, or registers the
   * token when the player turned them on before.
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
  /**
   * Removes this phone's token from the server, for the signed-in user,
   * then runs `then` (the sign-out) before any later sync. A failed
   * removal is ignored; it rejects only when `then` rejects.
   */
  unregister(then?: () => Promise<void>): Promise<void>;
  /** Stops the token listener (tests). */
  stop(): void;
}

interface Saved {
  readonly declined: boolean;
  readonly turnedOn: boolean;
}

function loadSaved(storage: Storage): Saved {
  const none = { declined: false, turnedOn: false };
  const raw = storage.getString(TURN_PUSHES_STORAGE_KEY);
  if (raw === undefined) return none;
  try {
    const saved: unknown = JSON.parse(raw);
    if (typeof saved !== 'object' || saved === null) return none;
    const { declined, turnedOn } = saved as { declined?: unknown; turnedOn?: unknown };
    return { declined: declined === true, turnedOn: turnedOn === true };
  } catch {
    return none;
  }
}

/** What was registered on the server in this app run. */
interface Registered {
  readonly userId: string;
  readonly token: string;
}

export function createTurnPushes(deps: TurnPushesDeps): TurnPushes {
  const { storage, notifications, pushTokens, auth, onAnswer, hasAccount = () => true } = deps;
  const store = createStore<TurnPushesState>()(() => ({
    ...loadSaved(storage),
    permission: null,
    offering: false,
    asking: false,
  }));
  /** One sync (or removal) at a time, in order. */
  let chain: Promise<void> = Promise.resolve();
  let registered: Registered | null = null;
  let stopTokenListener: (() => void) | null = null;
  /** The push service gave a new token: the next sync asks for it. */
  let tokenChanged = false;
  /** An `offer()` that has not decided yet: a second one does nothing. */
  let offerRunning = false;

  function save(next: Saved): void {
    const { declined, turnedOn } = store.getState();
    if (declined === next.declined && turnedOn === next.turnedOn) return;
    storage.setString(TURN_PUSHES_STORAGE_KEY, JSON.stringify(next));
    store.setState(next);
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
    // No in-app choice, or no online account on this phone: no server call.
    if (!store.getState().turnedOn || !hasAccount()) return;
    const user = await auth.ready();
    if (user === null) return;
    if ((await refresh()) !== 'granted') return;
    // A new token later (the push service may change it) registers again.
    stopTokenListener ??= notifications.onTokenChange(() => {
      tokenChanged = true;
      void sync();
    });
    // Registered in this run for this user, and no new token since: asking
    // Expo for the token again would only give the same one.
    if (registered?.userId === user.id && !tokenChanged) return;
    tokenChanged = false;
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
        const { turnedOn, declined } = store.getState();
        if (turnedOn) {
          void sync();
          return;
        }
        // The phone blocks them, or the player said "Not now".
        if (permission === 'denied' || declined) return;
        // Not asked yet, or allowed by the phone with no in-app choice:
        // "Turn on" decides.
        store.setState({ offering: true });
      } finally {
        offerRunning = false;
      }
    },

    notNow() {
      store.setState({ offering: false });
      save({ declined: true, turnedOn: store.getState().turnedOn });
    },

    async turnOn() {
      if (store.getState().asking) return store.getState().permission ?? 'undetermined';
      store.setState({ asking: true });
      let answer: PushPermission = 'denied';
      try {
        const before = await notifications.permission();
        // The system prompt shows only while the phone was not asked.
        answer = await notifications.requestPermission();
        // Only a real answer to the system prompt: granted or denied.
        if (before === 'undetermined') onAnswer?.(answer === 'granted' ? 'granted' : 'denied');
        const on = answer === 'granted';
        // A no keeps an earlier yes: the server may still hold the token,
        // and sign-out must remove it. Nothing is sent without a grant.
        save({ declined: !on, turnedOn: on || store.getState().turnedOn });
      } finally {
        store.setState({ permission: answer, offering: false, asking: false });
      }
      if (answer === 'granted') void sync();
      return answer;
    },

    refresh,
    sync,

    unregister(then) {
      const step = chain.then(async () => {
        try {
          // Not registered in this run and never turned on in the app: the
          // server has no token of this phone, so do not ask Expo for one.
          const token =
            registered?.token ??
            (store.getState().turnedOn ? await notifications.getToken() : null);
          registered = null;
          if (token !== null) await pushTokens.remove(token);
        } catch {
          // The token stays until Expo says it is gone: never stop a sign-out.
        }
        // Inside the chain: a sync asked for meanwhile runs after it.
        if (then) await then();
      });
      chain = step.catch(() => undefined);
      return step;
    },

    stop() {
      stopTokenListener?.();
      stopTokenListener = null;
    },
  };
}

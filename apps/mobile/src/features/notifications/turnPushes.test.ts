// Turn notifications (#285): when the app offers them, the saved "Not
// now", and the push token on the server. In-memory ports only.
import {
  createMemoryAuthProvider,
  createMemoryAuthStore,
  createMemoryPushNotifications,
  createMemoryPushTokens,
  createMemoryStorage,
  type Storage,
} from '@tavli/contracts';

import { signOutOfOnline } from '@/features/online/account';
import { hasOnlineAccount, rememberOnlineAccount } from '@/features/online/accountHint';

import { TURN_PUSHES_STORAGE_KEY, createTurnPushes } from './turnPushes';

function setup(storage: Storage = createMemoryStorage(), hasAccount = () => true) {
  const authStore = createMemoryAuthStore();
  const auth = createMemoryAuthProvider(authStore);
  const notifications = createMemoryPushNotifications('android');
  const pushTokens = createMemoryPushTokens(() => auth.currentUser()?.id ?? null);
  const answers: string[] = [];
  const pushes = createTurnPushes({
    storage,
    notifications,
    pushTokens,
    auth,
    onAnswer: (answer) => answers.push(answer),
    hasAccount,
  });
  return { storage, auth, authStore, notifications, pushTokens, answers, pushes };
}

/** A phone where the player tapped "Turn on" in an earlier app run. */
function optedIn(): Storage {
  const storage = createMemoryStorage();
  storage.setString(TURN_PUSHES_STORAGE_KEY, JSON.stringify({ declined: false, turnedOn: true }));
  return storage;
}

/** Lets the in-memory ports answer (they answer on later microtasks). */
async function settle(): Promise<void> {
  for (let i = 0; i < 20; i += 1) await Promise.resolve();
}

describe('offer', () => {
  it('shows the offer while the phone was not asked, with no system prompt yet', async () => {
    const { pushes, notifications } = setup();
    await pushes.offer();
    expect(pushes.store.getState()).toMatchObject({ offering: true, permission: 'undetermined' });
    expect(notifications.prompts).toBe(0);
  });

  it('does not show it when the phone already said no', async () => {
    const { pushes, notifications } = setup();
    notifications.setPermission('denied');
    await pushes.offer();
    expect(pushes.store.getState().offering).toBe(false);
  });

  it('shows it also when the phone allows pushes (Android 12), and sends nothing until Turn on', async () => {
    const { pushes, notifications, pushTokens, auth, answers } = setup();
    await auth.signInAsGuest();
    notifications.setPermission('granted');
    await pushes.offer();
    await settle();
    expect(pushes.store.getState().offering).toBe(true);
    // An online game opens: still no in-app choice, so no token.
    await pushes.sync();
    expect(pushTokens.calls).toEqual([]);
    expect(notifications.tokenRequests).toBe(0);

    await expect(pushes.turnOn()).resolves.toBe('granted');
    await settle();
    // No system prompt showed, so there is no answer to tell.
    expect(notifications.prompts).toBe(0);
    expect(answers).toEqual([]);
    expect(pushes.store.getState()).toMatchObject({ offering: false, turnedOn: true });
    expect(pushTokens.saved).toEqual([
      { playerId: 'guest-1', token: notifications.token, platform: 'android' },
    ]);
  });

  it('after "Turn on" in an earlier run, registers the token and shows nothing', async () => {
    const { pushes, notifications, pushTokens, auth } = setup(optedIn());
    await auth.signInAsGuest();
    notifications.setPermission('granted');
    await pushes.offer();
    await settle();
    expect(pushes.store.getState().offering).toBe(false);
    expect(pushTokens.saved).toHaveLength(1);
  });

  it('a phone with no notification system shows nothing', async () => {
    const { pushes, notifications } = setup();
    notifications.breakPlatform(true);
    await pushes.offer();
    expect(pushes.store.getState()).toMatchObject({ offering: false, permission: 'denied' });
  });
});

describe('"Not now"', () => {
  it('is kept: the app does not offer again, also after a restart', async () => {
    const { pushes, storage, notifications } = setup();
    await pushes.offer();
    pushes.notNow();
    expect(pushes.store.getState()).toMatchObject({ offering: false, declined: true });
    expect(JSON.parse(storage.getString(TURN_PUSHES_STORAGE_KEY)!)).toEqual({
      declined: true,
      turnedOn: false,
    });
    await pushes.offer();
    expect(pushes.store.getState().offering).toBe(false);
    expect(notifications.prompts).toBe(0);

    // The next app run reads the saved answer.
    const next = setup(storage).pushes;
    expect(next.store.getState().declined).toBe(true);
    await next.offer();
    expect(next.store.getState().offering).toBe(false);
  });

  it('Settings can still turn them on', async () => {
    const { pushes, notifications, answers } = setup();
    pushes.notNow();
    await expect(pushes.turnOn()).resolves.toBe('granted');
    expect(notifications.prompts).toBe(1);
    expect(answers).toEqual(['granted']);
    expect(pushes.store.getState().declined).toBe(false);
  });

  it('a no to the system prompt counts as "Not now"', async () => {
    const { pushes, notifications, answers, pushTokens, auth } = setup();
    await auth.signInAsGuest();
    notifications.answerPromptWith('denied');
    await pushes.offer();
    await expect(pushes.turnOn()).resolves.toBe('denied');
    await settle();
    expect(pushes.store.getState()).toMatchObject({
      offering: false,
      declined: true,
      permission: 'denied',
    });
    expect(answers).toEqual(['denied']);
    expect(pushTokens.calls).toEqual([]);
  });
});

describe('turnOn', () => {
  it('shows the system prompt once, and tells the answer only when the prompt showed', async () => {
    const { pushes, notifications, answers } = setup();
    await pushes.offer();
    await pushes.turnOn();
    expect(pushes.store.getState()).toMatchObject({
      offering: false,
      asking: false,
      permission: 'granted',
    });
    await pushes.turnOn();
    expect(notifications.prompts).toBe(1);
    expect(answers).toEqual(['granted']);
  });

  it('a failed prompt does not leave the button off', async () => {
    const { pushes, notifications } = setup();
    jest.spyOn(notifications, 'requestPermission').mockRejectedValueOnce(new Error('native'));
    await expect(pushes.turnOn()).rejects.toThrow('native');
    expect(pushes.store.getState()).toMatchObject({ asking: false, turnedOn: false });
  });

  it('a second tap while the prompt is open does nothing', async () => {
    const { pushes, notifications } = setup();
    const first = pushes.turnOn();
    expect(pushes.store.getState().asking).toBe(true);
    await pushes.turnOn();
    await first;
    expect(notifications.prompts).toBe(1);
  });
});

describe('the token on the server', () => {
  it('is registered once for the signed-in user, and again when it changes', async () => {
    const { pushes, notifications, pushTokens, auth } = setup();
    await auth.signInAsGuest();
    await pushes.offer();
    await pushes.turnOn();
    await settle();
    const first = notifications.token;
    expect(pushTokens.calls).toEqual([
      { kind: 'register', playerId: 'guest-1', token: first, platform: 'android' },
    ]);
    // Again in the same app run (an online game opens): nothing new, and
    // no new call to Expo for the token.
    await pushes.sync();
    await pushes.sync();
    expect(pushTokens.calls).toHaveLength(1);
    expect(notifications.tokenRequests).toBe(1);

    // The push service gives the phone a new token.
    const second = notifications.rollToken();
    await settle();
    expect(pushTokens.calls.slice(1)).toEqual([
      { kind: 'register', playerId: 'guest-1', token: second, platform: 'android' },
      { kind: 'remove', playerId: 'guest-1', token: first },
    ]);
    expect(pushTokens.saved).toEqual([{ playerId: 'guest-1', token: second, platform: 'android' }]);
  });

  it('is not registered while nobody is signed in, or the phone does not allow pushes', async () => {
    const { pushes, notifications, pushTokens, auth } = setup(optedIn());
    notifications.setPermission('granted');
    await pushes.sync();
    expect(pushTokens.calls).toEqual([]);
    await auth.signInAsGuest();
    notifications.setPermission('denied');
    await pushes.sync();
    expect(pushTokens.calls).toEqual([]);
    expect(notifications.tokenRequests).toBe(0);
  });

  it('a phone that never used an online account asks the server nothing', async () => {
    const { pushes, notifications, pushTokens, auth } = setup(optedIn(), () => false);
    const ready = jest.spyOn(auth, 'ready');
    notifications.setPermission('granted');
    await pushes.turnOn();
    await pushes.sync();
    expect(ready).not.toHaveBeenCalled();
    expect(pushTokens.calls).toEqual([]);
  });

  it('a failed register is tried again on the next sync', async () => {
    const { pushes, notifications, pushTokens, authStore } = setup(optedIn());
    notifications.setPermission('granted');
    const register = jest.spyOn(pushTokens, 'register').mockRejectedValueOnce(new Error('offline'));
    authStore.session = { id: 'guest-1', isGuest: true };
    await expect(pushes.sync()).resolves.toBeUndefined();
    expect(pushTokens.saved).toEqual([]);
    await pushes.sync();
    expect(register).toHaveBeenCalledTimes(2);
    expect(pushTokens.saved).toHaveLength(1);
  });

  it('a new user on the phone registers it for that user', async () => {
    const { pushes, notifications, pushTokens, authStore } = setup(optedIn());
    notifications.setPermission('granted');
    authStore.session = { id: 'guest-1', isGuest: true };
    await pushes.sync();
    authStore.session = { id: 'guest-2', isGuest: true };
    await pushes.sync();
    expect(pushTokens.saved).toEqual([
      { playerId: 'guest-2', token: notifications.token, platform: 'android' },
    ]);
  });

  it('is removed before sign-out, while the session can still call the server', async () => {
    const { pushes, notifications, pushTokens, auth } = setup(optedIn());
    await auth.signInAsGuest();
    notifications.setPermission('granted');
    await pushes.sync();
    await signOutOfOnline(auth, pushes);
    expect(auth.currentUser()).toBeNull();
    expect(pushTokens.calls.at(-1)).toEqual({
      kind: 'remove',
      playerId: 'guest-1',
      token: notifications.token,
    });
    expect(pushTokens.saved).toEqual([]);
  });

  it('a sync asked for during the sign-out does not put the token back', async () => {
    const { pushes, notifications, pushTokens, auth } = setup(optedIn());
    await auth.signInAsGuest();
    notifications.setPermission('granted');
    await pushes.sync();
    const out = signOutOfOnline(auth, pushes);
    const again = pushes.sync();
    await Promise.all([out, again]);
    expect(auth.currentUser()).toBeNull();
    expect(pushTokens.saved).toEqual([]);
  });

  it('a failed removal does not stop the sign-out', async () => {
    const { pushes, notifications, pushTokens, auth } = setup(optedIn());
    await auth.signInAsGuest();
    notifications.setPermission('granted');
    await pushes.sync();
    jest.spyOn(pushTokens, 'remove').mockRejectedValueOnce(new Error('offline'));
    await expect(signOutOfOnline(auth, pushes)).resolves.toBeUndefined();
    expect(auth.currentUser()).toBeNull();
  });

  it('sign-out asks Expo for no token when they were never turned on in the app', async () => {
    const { pushes, notifications, pushTokens, auth } = setup();
    await auth.signInAsGuest();
    notifications.setPermission('granted');
    await signOutOfOnline(auth, pushes);
    expect(auth.currentUser()).toBeNull();
    expect(notifications.tokenRequests).toBe(0);
    expect(pushTokens.calls).toEqual([]);
  });

  it('a no to a later prompt keeps an earlier "Turn on", so sign-out still removes the token', async () => {
    const { pushes, notifications, pushTokens, auth } = setup(optedIn());
    await auth.signInAsGuest();
    // Android "ask again": the phone took the permission back.
    notifications.answerPromptWith('denied');
    await expect(pushes.turnOn()).resolves.toBe('denied');
    expect(pushes.store.getState()).toMatchObject({ turnedOn: true, declined: true });
    // Later the player allows them again in the phone settings.
    notifications.setPermission('granted');
    await signOutOfOnline(auth, pushes);
    expect(pushTokens.calls).toEqual([
      { kind: 'remove', playerId: 'guest-1', token: notifications.token },
    ]);
  });

  it('sign-out with no turn notifications only signs out', async () => {
    const { auth } = setup();
    await auth.signInAsGuest();
    await signOutOfOnline(auth, undefined);
    expect(auth.currentUser()).toBeNull();
  });

  it('sign-out forgets the account note, so Home loads no session (#297)', async () => {
    const { auth } = setup();
    await auth.signInAsGuest();
    rememberOnlineAccount();
    await signOutOfOnline(auth, undefined);
    expect(hasOnlineAccount()).toBe(false);
  });
});

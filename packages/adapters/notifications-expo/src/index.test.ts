import { pushNotificationsContract } from '@tavli/contracts/testing';
import type { PushNotificationsContractSubject } from '@tavli/contracts/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// expo-notifications ships React Native code, which Node cannot load. A
// fake phone stands in for it: the permission, the prompt, the tokens and
// the taps. `phone.broken` makes every call throw.
const phone = vi.hoisted(() => ({
  status: 'undetermined' as 'undetermined' | 'granted' | 'denied',
  canAskAgain: true,
  iosStatus: undefined as number | undefined,
  answer: 'granted' as 'granted' | 'denied',
  prompts: 0,
  device: 1,
  expoRequests: [] as { projectId?: string; devicePushToken?: { data: string } }[],
  channels: [] as { id: string; name: string; importance: number }[],
  tokenListeners: new Set<(token: { type: string; data: string }) => void>(),
  responseListeners: new Set<(response: unknown) => void>(),
  last: null as unknown,
  broken: false,
  promptFails: false,
  reset() {
    this.status = 'undetermined';
    this.canAskAgain = true;
    this.iosStatus = undefined;
    this.answer = 'granted';
    this.prompts = 0;
    this.device = 1;
    this.expoRequests = [];
    this.channels = [];
    this.tokenListeners.clear();
    this.responseListeners.clear();
    this.last = null;
    this.broken = false;
    this.promptFails = false;
  },
}));

const DEFAULT_ACTION = 'expo.modules.notifications.actions.DEFAULT';

function check(): void {
  if (phone.broken) throw new Error('no notification system');
}

function statusNow() {
  return {
    status: phone.status,
    granted: phone.status === 'granted',
    canAskAgain: phone.canAskAgain,
    expires: 'never',
    ...(phone.iosStatus === undefined ? {} : { ios: { status: phone.iosStatus } }),
  };
}

vi.mock('expo-notifications', () => ({
  AndroidImportance: { HIGH: 6 },
  DEFAULT_ACTION_IDENTIFIER: 'expo.modules.notifications.actions.DEFAULT',
  IosAuthorizationStatus: {
    NOT_DETERMINED: 0,
    DENIED: 1,
    AUTHORIZED: 2,
    PROVISIONAL: 3,
    EPHEMERAL: 4,
  },
  getPermissionsAsync: () => {
    check();
    return Promise.resolve(statusNow());
  },
  requestPermissionsAsync: () => {
    check();
    if (phone.promptFails) throw new Error('the prompt failed');
    if (phone.status === 'undetermined') {
      phone.prompts += 1;
      phone.status = phone.answer;
      // Like iOS: one answer, for good.
      phone.canAskAgain = false;
    }
    return Promise.resolve(statusNow());
  },
  setNotificationChannelAsync: (id: string, channel: { name: string; importance: number }) => {
    check();
    phone.channels.push({ id, ...channel });
    return Promise.resolve(null);
  },
  getExpoPushTokenAsync: (options: { projectId?: string; devicePushToken?: { data: string } }) => {
    check();
    phone.expoRequests.push(options);
    const device = options.devicePushToken?.data ?? `device-${phone.device}`;
    return Promise.resolve({ type: 'expo', data: `ExponentPushToken[${device}]` });
  },
  addPushTokenListener: (listener: (token: { type: string; data: string }) => void) => {
    check();
    phone.tokenListeners.add(listener);
    return { remove: () => phone.tokenListeners.delete(listener) };
  },
  addNotificationResponseReceivedListener: (listener: (response: unknown) => void) => {
    check();
    phone.responseListeners.add(listener);
    return { remove: () => phone.responseListeners.delete(listener) };
  },
  getLastNotificationResponse: () => {
    check();
    return phone.last;
  },
  clearLastNotificationResponse: () => {
    check();
    phone.last = null;
  },
}));

const { ANDROID_CHANNEL_ID, createExpoPushNotifications, tapOf, toPermission } =
  await import('./index');

let taps = 0;

function response(data: Record<string, unknown>, action = DEFAULT_ACTION) {
  taps += 1;
  return {
    actionIdentifier: action,
    notification: {
      date: 0,
      request: { identifier: `push-${taps}`, content: { data }, trigger: null },
    },
  };
}

function rollToken(): void {
  phone.device += 1;
  for (const listener of [...phone.tokenListeners]) {
    listener({ type: 'ios', data: `device-${phone.device}` });
  }
}

const OPTIONS = {
  platform: 'ios',
  projectId: 'project-1',
  channelName: () => 'Your turn',
} as const;

async function flush(): Promise<void> {
  for (let i = 0; i < 10; i++) await Promise.resolve();
}

beforeEach(() => {
  phone.reset();
});

function subject(): PushNotificationsContractSubject {
  phone.reset();
  const broken = createExpoPushNotifications(OPTIONS);
  const notifications = createExpoPushNotifications(OPTIONS);
  return {
    notifications,
    setSystem: (permission) => {
      phone.status = permission;
      phone.canAskAgain = permission === 'undetermined';
    },
    answerPrompt: (answer) => {
      phone.answer = answer;
    },
    prompts: () => phone.prompts,
    rollToken,
    tap: (data) => {
      for (const listener of [...phone.responseListeners]) listener(response(data));
    },
    openingTap: (data) => {
      phone.last = response(data);
    },
    // Every native call of this one throws; the other port works as before.
    broken: {
      platform: broken.platform,
      permission: () => withBroken(() => broken.permission()),
      requestPermission: () => withBroken(() => broken.requestPermission()),
      getToken: () => withBroken(() => broken.getToken()),
      lastTap: () => withBroken(() => broken.lastTap()),
      onTap: (listener) => withBrokenNow(() => broken.onTap(listener)),
      onTokenChange: (listener) => withBrokenNow(() => broken.onTokenChange(listener)),
    },
    settle: () => Promise.resolve(),
  };
}

async function withBroken<T>(call: () => Promise<T>): Promise<T> {
  phone.broken = true;
  try {
    return await call();
  } finally {
    phone.broken = false;
  }
}

function withBrokenNow<T>(call: () => T): T {
  phone.broken = true;
  try {
    return call();
  } finally {
    phone.broken = false;
  }
}

describe('createExpoPushNotifications: PushNotifications contract', () => {
  for (const contractCheck of pushNotificationsContract()) {
    it(contractCheck.name, () => contractCheck.run(subject()));
  }
});

describe('createExpoPushNotifications', () => {
  it('asks Expo for a token with the project id, and for none without one', async () => {
    phone.status = 'granted';
    await expect(createExpoPushNotifications(OPTIONS).getToken()).resolves.toBe(
      'ExponentPushToken[device-1]',
    );
    expect(phone.expoRequests).toEqual([{ projectId: 'project-1' }]);
    const noProject = createExpoPushNotifications({ ...OPTIONS, projectId: undefined });
    await expect(noProject.getToken()).resolves.toBeNull();
    expect(phone.expoRequests).toHaveLength(1);
  });

  it('asks Expo for no token while the permission is not granted', async () => {
    const notifications = createExpoPushNotifications(OPTIONS);
    await expect(notifications.getToken()).resolves.toBeNull();
    expect(phone.expoRequests).toEqual([]);
  });

  it('on Android makes the channel once, before the prompt', async () => {
    const notifications = createExpoPushNotifications({ ...OPTIONS, platform: 'android' });
    expect(notifications.platform).toBe('android');
    await expect(notifications.requestPermission()).resolves.toBe('granted');
    await notifications.getToken();
    expect(phone.channels).toEqual([{ id: ANDROID_CHANNEL_ID, name: 'Your turn', importance: 6 }]);
  });

  it('on iOS makes no channel', async () => {
    const notifications = createExpoPushNotifications(OPTIONS);
    await notifications.requestPermission();
    await notifications.getToken();
    expect(phone.channels).toEqual([]);
  });

  it('a prompt call that throws is no answer: undetermined', async () => {
    const notifications = createExpoPushNotifications(OPTIONS);
    phone.promptFails = true;
    await expect(notifications.requestPermission()).resolves.toBe('undetermined');
    expect(phone.prompts).toBe(0);
  });

  it('an Android "no" that may be asked once more is undetermined, but the answer is denied', async () => {
    const notifications = createExpoPushNotifications({ ...OPTIONS, platform: 'android' });
    phone.status = 'denied';
    phone.canAskAgain = true;
    await expect(notifications.permission()).resolves.toBe('undetermined');
  });

  it('tells a token change only when the token is new', async () => {
    phone.status = 'granted';
    const notifications = createExpoPushNotifications(OPTIONS);
    const got: string[] = [];
    notifications.onTokenChange((token) => got.push(token));
    await notifications.getToken();
    // The same device token again (getDevicePushTokenAsync fires the listener too).
    for (const listener of [...phone.tokenListeners]) listener({ type: 'ios', data: 'device-1' });
    await flush();
    expect(got).toEqual([]);
    rollToken();
    await flush();
    expect(got).toEqual(['ExponentPushToken[device-2]']);
  });

  it('keeps one native token listener, and removes it with the last stop', () => {
    const notifications = createExpoPushNotifications(OPTIONS);
    const stops = [notifications.onTokenChange(() => {}), notifications.onTokenChange(() => {})];
    expect(phone.tokenListeners.size).toBe(1);
    stops[0]?.();
    expect(phone.tokenListeners.size).toBe(1);
    stops[1]?.();
    expect(phone.tokenListeners.size).toBe(0);
  });

  it('a tap on an action button is not a tap', async () => {
    const notifications = createExpoPushNotifications(OPTIONS);
    const got: unknown[] = [];
    notifications.onTap((tap) => got.push(tap));
    for (const listener of [...phone.responseListeners]) {
      listener(response({ gameId: 'g1' }, 'reply'));
    }
    await flush();
    expect(got).toEqual([]);
    phone.last = response({ gameId: 'g1' }, 'reply');
    await expect(notifications.lastTap()).resolves.toBeNull();
  });
});

describe('toPermission', () => {
  const base = { expires: 'never', granted: false, canAskAgain: false } as const;
  it('counts iOS provisional and ephemeral as granted', () => {
    for (const status of [3, 4]) {
      expect(toPermission({ ...base, status: 'denied', ios: { status } } as never)).toBe('granted');
    }
    expect(toPermission({ ...base, status: 'denied', ios: { status: 1 } } as never)).toBe('denied');
  });
});

describe('tapOf', () => {
  it('reads the id and the game id', () => {
    expect(tapOf(response({ gameId: 'k57' }) as never)).toEqual({
      id: expect.stringMatching(/^push-/),
      gameId: 'k57',
    });
    expect(tapOf(null)).toBeNull();
  });
});

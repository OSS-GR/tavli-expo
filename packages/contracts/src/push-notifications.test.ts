import { describe, expect, it } from 'vitest';

import {
  PUSH_PERMISSIONS,
  createMemoryPushNotifications,
  createMemoryPushTokens,
  gameIdOfPush,
  isPushPermission,
} from './push-notifications';
import { pushNotificationsContract, pushTokensContract } from './testing';
import type { PushNotificationsContractSubject, PushTokensContractSubject } from './testing';

function notificationsSubject(): PushNotificationsContractSubject {
  const phone = createMemoryPushNotifications();
  const broken = createMemoryPushNotifications();
  broken.breakPlatform(true);
  return {
    notifications: phone,
    setSystem: (permission) => phone.setPermission(permission),
    answerPrompt: (answer) => phone.answerPromptWith(answer),
    prompts: () => phone.prompts,
    rollToken: () => void phone.rollToken(),
    tap: (data) => void phone.tap(data),
    openingTap: (data) => void phone.tap(data, { opensApp: true }),
    broken,
  };
}

describe('createMemoryPushNotifications: PushNotifications contract', () => {
  for (const check of pushNotificationsContract()) {
    it(check.name, () => check.run(notificationsSubject()));
  }
});

function tokensSubject(): PushTokensContractSubject {
  let user: string | null = null;
  const tokens = createMemoryPushTokens(() => user);
  const ids = { me: 'alice', other: 'bob' } as const;
  return {
    tokensFor: (player) => ({
      register: (token, platform) => {
        user = player === null ? null : ids[player];
        return tokens.register(token, platform);
      },
      remove: (token) => {
        user = player === null ? null : ids[player];
        return tokens.remove(token);
      },
    }),
    token: (i) => `ExponentPushToken[test-${i}]`,
    savedFor: (player) =>
      Promise.resolve(
        tokens.saved.filter((row) => row.playerId === ids[player]).map((row) => row.token),
      ),
  };
}

describe('createMemoryPushTokens: PushTokens contract', () => {
  for (const check of pushTokensContract()) {
    it(check.name, () => check.run(tokensSubject()));
  }
});

describe('createMemoryPushNotifications', () => {
  it('counts prompts and token requests, and starts over on reset', async () => {
    const phone = createMemoryPushNotifications('android');
    expect(phone.platform).toBe('android');
    await expect(phone.getToken()).resolves.toBeNull();
    expect(phone.tokenRequests).toBe(0);
    await expect(phone.requestPermission()).resolves.toBe('granted');
    await expect(phone.getToken()).resolves.toBe('ExponentPushToken[memory-1]');
    expect(phone.rollToken()).toBe('ExponentPushToken[memory-2]');
    expect({ prompts: phone.prompts, tokenRequests: phone.tokenRequests }).toEqual({
      prompts: 1,
      tokenRequests: 1,
    });
    phone.tap({ gameId: 'g1' }, { opensApp: true });
    phone.reset();
    expect(phone.token).toBe('ExponentPushToken[memory-1]');
    await expect(phone.permission()).resolves.toBe('undetermined');
    await expect(phone.lastTap()).resolves.toBeNull();
    expect(phone.prompts).toBe(0);
  });
});

describe('createMemoryPushTokens', () => {
  it('records every call with the user signed in then', async () => {
    let user: string | null = 'alice';
    const tokens = createMemoryPushTokens(() => user);
    await tokens.register('ExponentPushToken[a]', 'ios');
    user = null;
    await expect(tokens.remove('ExponentPushToken[a]')).rejects.toMatchObject({
      code: 'NOT_SIGNED_IN',
    });
    expect(tokens.calls).toEqual([
      { kind: 'register', playerId: 'alice', token: 'ExponentPushToken[a]', platform: 'ios' },
      { kind: 'remove', playerId: null, token: 'ExponentPushToken[a]' },
    ]);
    expect(tokens.saved).toEqual([
      { playerId: 'alice', token: 'ExponentPushToken[a]', platform: 'ios' },
    ]);
    tokens.reset();
    expect({ saved: tokens.saved, calls: tokens.calls }).toEqual({ saved: [], calls: [] });
  });
});

describe('gameIdOfPush', () => {
  it('reads a game id that is a string, and nothing else', () => {
    expect(gameIdOfPush({ gameId: 'k57' })).toBe('k57');
    for (const data of [null, undefined, 'k57', {}, { gameId: '' }, { gameId: 3 }]) {
      expect(gameIdOfPush(data)).toBeNull();
    }
  });
});

describe('isPushPermission', () => {
  it('knows the three answers and nothing else', () => {
    for (const permission of PUSH_PERMISSIONS) expect(isPushPermission(permission)).toBe(true);
    for (const value of ['provisional', '', null, 1]) expect(isPushPermission(value)).toBe(false);
  });
});

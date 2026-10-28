import { describe, expect, it } from 'vitest';

import { MAX_EXPO_PUSH_TOKEN_LENGTH, isExpoPushToken } from './token';

describe('isExpoPushToken', () => {
  it('accepts both Expo token shapes', () => {
    expect(isExpoPushToken('ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]')).toBe(true);
    expect(isExpoPushToken('ExpoPushToken[AbC-123_xyz]')).toBe(true);
  });

  it('rejects anything else', () => {
    for (const value of [
      '',
      'ExponentPushToken[]',
      'ExponentPushToken[a b]',
      'ExponentPushToken[a]b]',
      'ExponentPushToken[a',
      'exponentpushtoken[a]',
      ' ExponentPushToken[a]',
      'ExponentPushToken[a] ',
      'FCM:abcdef',
      `ExponentPushToken[${'x'.repeat(MAX_EXPO_PUSH_TOKEN_LENGTH)}]`,
      42,
      null,
      undefined,
    ]) {
      expect(isExpoPushToken(value)).toBe(false);
    }
  });
});

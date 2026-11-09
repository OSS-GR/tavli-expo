import { beforeEach, describe, expect, it, vi } from 'vitest';

// expo-apple-authentication ships React Native code, which Node cannot
// load. A fake Apple stands in for it.
const apple = vi.hoisted(() => ({
  available: true as boolean | 'throw',
  answer: null as unknown,
  calls: [] as unknown[],
}));

vi.mock('expo-apple-authentication', () => ({
  AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 },
  isAvailableAsync: () =>
    apple.available === 'throw'
      ? Promise.reject(new Error('no module'))
      : Promise.resolve(apple.available),
  signInAsync: (options: unknown) => {
    apple.calls.push(options);
    return apple.answer instanceof Error
      ? Promise.reject(apple.answer)
      : Promise.resolve(apple.answer);
  },
}));
vi.mock('./AppleSignInButton', () => ({ AppleSignInButton: () => null }));

const { createExpoAppleSheet } = await import('./index');

function appleError(code: string): Error {
  return Object.assign(new Error(code), { code });
}

beforeEach(() => {
  apple.available = true;
  apple.answer = null;
  apple.calls = [];
});

describe('createExpoAppleSheet', () => {
  it('asks for the email only, with the nonce as it is', async () => {
    apple.answer = { identityToken: 'id-token', authorizationCode: 'code-1' };
    expect(await createExpoAppleSheet().signIn('nonce-1')).toEqual({
      idToken: 'id-token',
      authorizationCode: 'code-1',
    });
    expect(apple.calls).toEqual([{ requestedScopes: [1], nonce: 'nonce-1' }]);
  });

  it('a closed sheet is null; other problems reject', async () => {
    const sheet = createExpoAppleSheet();
    apple.answer = appleError('ERR_REQUEST_CANCELED');
    expect(await sheet.signIn('n')).toBeNull();
    apple.answer = appleError('ERR_REQUEST_FAILED');
    await expect(sheet.signIn('n')).rejects.toThrow('ERR_REQUEST_FAILED');
    apple.answer = { identityToken: null, authorizationCode: 'c' };
    await expect(sheet.signIn('n')).rejects.toThrow('no id token');
  });

  it('a missing code is null', async () => {
    apple.answer = { identityToken: 'id-token', authorizationCode: null };
    expect(await createExpoAppleSheet().signIn('n')).toEqual({
      idToken: 'id-token',
      authorizationCode: null,
    });
  });

  it('is available only when Apple says so', async () => {
    const sheet = createExpoAppleSheet();
    expect(await sheet.isAvailable()).toBe(true);
    apple.available = false;
    expect(await sheet.isAvailable()).toBe(false);
    apple.available = 'throw';
    expect(await sheet.isAvailable()).toBe(false);
  });
});

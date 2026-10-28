import { describe, expect, it } from 'vitest';

import {
  AUTH_ERROR_CODES,
  MEMORY_AUTH_TOKEN_PREFIX,
  createMemoryAuthProvider,
  createMemoryAuthStore,
  isAuthErrorData,
} from './index';
import { authProviderContract } from './testing';

function memorySubject() {
  const store = createMemoryAuthStore();
  return {
    auth: createMemoryAuthProvider(store),
    restart: () => createMemoryAuthProvider(store),
    tokenSubject: (token: string) => {
      if (!token.startsWith(MEMORY_AUTH_TOKEN_PREFIX)) throw new Error(`not a memory token`);
      return token.slice(MEMORY_AUTH_TOKEN_PREFIX.length);
    },
  };
}

describe('the in-memory AuthProvider passes the contract (#131)', () => {
  for (const check of authProviderContract()) {
    it(check.name, () => check.run(memorySubject()));
  }
});

describe('the in-memory AuthProvider', () => {
  it('names guests guest-1, guest-2, …', async () => {
    const { auth } = memorySubject();
    expect(await auth.signInAsGuest()).toEqual({ id: 'guest-1', isGuest: true });
    await auth.signOut();
    expect((await auth.signInAsGuest()).id).toBe('guest-2');
  });
});

describe('the contract catches a broken provider', () => {
  it('a token that names another user fails', async () => {
    const subject = { ...memorySubject(), tokenSubject: () => 'someone-else' };
    const check = authProviderContract().find((c) => c.name.startsWith('a guest sign-in'));
    await expect(check?.run(subject)).rejects.toThrow(/token subject/);
  });

  it('a provider that forgets the session on restart fails', async () => {
    const subject = { ...memorySubject(), restart: () => createMemoryAuthProvider() };
    const check = authProviderContract().find((c) => c.name === 'a restart keeps the session');
    await expect(check?.run(subject)).rejects.toThrow(/after a restart/);
  });
});

describe('isAuthErrorData', () => {
  it('accepts every error code with a message', () => {
    for (const code of AUTH_ERROR_CODES) {
      expect(isAuthErrorData({ code, message: 'x' })).toBe(true);
    }
  });

  it('rejects other values', () => {
    expect(isAuthErrorData({ code: 'NOT_FOUND', message: 'x' })).toBe(false);
    expect(isAuthErrorData({ code: 'NETWORK' })).toBe(false);
    expect(isAuthErrorData(null)).toBe(false);
  });
});

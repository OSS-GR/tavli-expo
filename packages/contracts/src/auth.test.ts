import { describe, expect, it } from 'vitest';

import {
  AUTH_ERROR_CODES,
  MEMORY_AUTH_TOKEN_PREFIX,
  createMemoryAuthProvider,
  createMemoryAuthStore,
  isAuthErrorData,
  memoryAppleIdToken,
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
    appleIdToken: (sub: string, nonce: string) => Promise.resolve(memoryAppleIdToken(sub, nonce)),
    emailCode: (email: string) => {
      const sent = store.sentEmailCodes.filter((mail) => mail.email === email).at(-1);
      return sent === undefined ? Promise.reject(new Error('no code')) : Promise.resolve(sent.code);
    },
    store,
  };
}

describe('the in-memory AuthProvider passes the contract (#131)', () => {
  for (const check of authProviderContract()) {
    it(check.name, () => check.run(memorySubject()));
  }
});

describe('the in-memory AuthProvider', () => {
  it('keeps the sent codes in its inbox, in lower case and with the language', async () => {
    const { auth, store } = memorySubject();
    await auth.requestEmailCode(' Eleni@Example.com', 'el');
    expect(store.sentEmailCodes).toEqual([
      { email: 'eleni@example.com', code: '100001', language: 'el' },
    ]);
  });

  it('names guests guest-1, guest-2, …', async () => {
    const { auth } = memorySubject();
    expect(await auth.signInAsGuest()).toEqual({ id: 'guest-1', isGuest: true });
    await auth.signOut();
    expect((await auth.signInAsGuest()).id).toBe('guest-2');
  });

  it('names key accounts user-1, user-2, … and nonces nonce-1, …', async () => {
    const { auth } = memorySubject();
    const nonce = await auth.keyNonce();
    expect(nonce).toBe('nonce-1');
    const credential = {
      provider: 'apple' as const,
      idToken: memoryAppleIdToken('a', nonce),
      nonce,
    };
    expect(await auth.signInWithKey(credential)).toEqual({ id: 'user-1', isGuest: false });
  });

  it('turns down a token for another provider format', async () => {
    const { auth } = memorySubject();
    const nonce = await auth.keyNonce();
    await expect(
      auth.signInWithKey({ provider: 'apple', idToken: 'not-a-token', nonce }),
    ).rejects.toMatchObject({ code: 'REJECTED' });
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

  it('a provider that lets anyone save a taken key fails', async () => {
    const base = memorySubject();
    const auth = {
      ...base.auth,
      saveKey: () => Promise.resolve({ id: 'guest-1', isGuest: false }),
    };
    const subject = { ...base, auth };
    const check = authProviderContract().find((c) => c.name.includes('KEY_BELONGS_TO_OTHER'));
    await expect(check?.run(subject)).rejects.toThrow(/KEY_BELONGS_TO_OTHER/);
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

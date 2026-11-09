import { beforeEach, describe, expect, it, vi } from 'vitest';

// expo-secure-store ships native code, which Node cannot load. Replace it
// with a map that can also fail like a phone.
const saved = new Map<string, string>();
let unreadable = false;

vi.mock('expo-secure-store', () => ({
  getItem: (key: string) => {
    if (unreadable) throw new Error('could not decrypt');
    return saved.get(key) ?? null;
  },
  setItem: (key: string, value: string) => {
    saved.set(key, value);
  },
  getItemAsync: (key: string) => {
    if (unreadable) return Promise.reject(new Error('could not decrypt'));
    return Promise.resolve(saved.get(key) ?? null);
  },
  setItemAsync: (key: string, value: string) => {
    saved.set(key, value);
    return Promise.resolve();
  },
}));

const { createSecureSessionStorage } = await import('./secureStore');

describe('createSecureSessionStorage', () => {
  beforeEach(() => {
    saved.clear();
    unreadable = false;
  });

  it('keeps values in the secure store', () => {
    const storage = createSecureSessionStorage();
    expect(storage.getItem('tavlaki_cookie')).toBeNull();
    storage.setItem('tavlaki_cookie', '{"a":1}');
    expect(saved.get('tavlaki_cookie')).toBe('{"a":1}');
    expect(storage.getItem('tavlaki_cookie')).toBe('{"a":1}');
  });

  it('reads a value it cannot decrypt as null', async () => {
    const storage = createSecureSessionStorage();
    storage.setItem('tavlaki_cookie', '{"a":1}');
    unreadable = true;
    expect(storage.getItem('tavlaki_cookie')).toBeNull();
    expect(await storage.getItemAsync('tavlaki_cookie')).toBeNull();
  });

  it('keeps values with the async calls too, in the same store', async () => {
    const storage = createSecureSessionStorage();
    await storage.setItemAsync('tavlaki_cookie', '{"b":2}');
    expect(storage.getItem('tavlaki_cookie')).toBe('{"b":2}');
    expect(await storage.getItemAsync('tavlaki_cookie')).toBe('{"b":2}');
  });
});

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

  it('reads a value it cannot decrypt as null', () => {
    const storage = createSecureSessionStorage();
    storage.setItem('tavlaki_cookie', '{"a":1}');
    unreadable = true;
    expect(storage.getItem('tavlaki_cookie')).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';

import { createMemoryStorage } from './storage';

describe('createMemoryStorage', () => {
  it('stores, reads and removes strings', () => {
    const storage = createMemoryStorage();
    expect(storage.getString('a')).toBeUndefined();

    storage.setString('a', '1');
    expect(storage.getString('a')).toBe('1');

    storage.remove('a');
    expect(storage.getString('a')).toBeUndefined();
  });

  it('starts with initial data', () => {
    const storage = createMemoryStorage({ a: 'x' });
    expect(storage.getString('a')).toBe('x');
  });

  it('ignores a remove of a missing key', () => {
    const storage = createMemoryStorage();
    expect(() => storage.remove('missing')).not.toThrow();
  });
});

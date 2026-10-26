import { beforeEach, describe, expect, it, vi } from 'vitest';

// react-native-mmkv ships React Native source, which Node cannot load.
// Replace it with a tiny map-backed fake that has the same methods.
const instances = new Map<string, Map<string, string | number | boolean>>();

vi.mock('react-native-mmkv', () => ({
  createMMKV: ({ id }: { id: string }) => {
    const data = instances.get(id) ?? new Map<string, string | number | boolean>();
    instances.set(id, data);
    return {
      getString: (key: string) => {
        const value = data.get(key);
        return typeof value === 'string' ? value : undefined;
      },
      set: (key: string, value: string | number | boolean) => {
        data.set(key, value);
      },
      remove: (key: string) => data.delete(key),
    };
  },
}));

const { createMmkvStorage } = await import('./index');

describe('createMmkvStorage', () => {
  beforeEach(() => {
    instances.clear();
  });

  it('implements the Storage port on top of MMKV', () => {
    const storage = createMmkvStorage();
    expect(storage.getString('k')).toBeUndefined();

    storage.setString('k', 'v');
    expect(storage.getString('k')).toBe('v');

    storage.remove('k');
    expect(storage.getString('k')).toBeUndefined();
  });

  it('keeps instances with different ids apart', () => {
    createMmkvStorage({ id: 'a' }).setString('k', 'a');
    expect(createMmkvStorage({ id: 'b' }).getString('k')).toBeUndefined();
    expect(createMmkvStorage({ id: 'a' }).getString('k')).toBe('a');
  });
});

import { createMemoryStorage, isAnonymousInstallId } from '@tavli/contracts';

import { INSTALL_ID_STORAGE_KEY, getInstallId, randomInstallId } from './installId';

describe('install id', () => {
  it('makes an anonymous id on first launch and saves it', () => {
    const storage = createMemoryStorage();
    const id = getInstallId(storage, () => 'install_1234abcd');
    expect(id).toBe('install_1234abcd');
    expect(storage.getString(INSTALL_ID_STORAGE_KEY)).toBe('install_1234abcd');
  });

  it('keeps the saved id on later launches', () => {
    const storage = createMemoryStorage({ [INSTALL_ID_STORAGE_KEY]: 'install_1234abcd' });
    expect(getInstallId(storage, () => 'other_id_9999')).toBe('install_1234abcd');
  });

  it('replaces a saved value that is not an anonymous id', () => {
    const storage = createMemoryStorage({ [INSTALL_ID_STORAGE_KEY]: 'someone@example.com' });
    expect(getInstallId(storage, () => 'install_1234abcd')).toBe('install_1234abcd');
  });

  it('makes random ids that pass the anonymous id check', () => {
    const a = randomInstallId();
    const b = randomInstallId();
    expect(isAnonymousInstallId(a)).toBe(true);
    expect(isAnonymousInstallId(b)).toBe(true);
    expect(a).not.toBe(b);
  });
});

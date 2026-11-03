import { describe, expect, it } from 'vitest';

import { NO_UPDATE_POLICY, createMemoryAppUpdates } from './app-update';

describe('createMemoryAppUpdates', () => {
  it('blocks no build until a policy is set', async () => {
    const updates = createMemoryAppUpdates();
    await expect(updates.updatePolicy('ios')).resolves.toEqual(NO_UPDATE_POLICY);
    expect(updates.calls).toEqual(['ios']);
  });

  it('answers the policy of each phone system', async () => {
    const updates = createMemoryAppUpdates();
    const ios = { minBuild: 13, force: false, updateUrl: null };
    updates.set('ios', ios);
    await expect(updates.updatePolicy('ios')).resolves.toEqual(ios);
    await expect(updates.updatePolicy('android')).resolves.toEqual(NO_UPDATE_POLICY);
  });

  it('fails every call after failCalls, and reset starts over', async () => {
    const updates = createMemoryAppUpdates();
    updates.set('ios', { minBuild: 13, force: true, updateUrl: null });
    updates.failCalls();
    await expect(updates.updatePolicy('ios')).rejects.toThrow();
    updates.reset();
    await expect(updates.updatePolicy('ios')).resolves.toEqual(NO_UPDATE_POLICY);
    expect(updates.calls).toEqual(['ios']);
  });
});

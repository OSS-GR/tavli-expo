import { createMemoryStorage } from '@tavli/contracts';

import { CONSENT_STORAGE_KEY } from '@/features/privacy/consent';

import { TOUR_STORAGE_KEY, createTourStore } from './tourStatus';

describe('tour status (#573)', () => {
  it('is new on a phone that never answered consent', () => {
    expect(createTourStore(createMemoryStorage()).getState().status).toBe('new');
  });

  it('is due after begin, and stays due after a restart', () => {
    const storage = createMemoryStorage();
    const store = createTourStore(storage);
    store.getState().begin();
    expect(store.getState().status).toBe('due');
    storage.setString(CONSENT_STORAGE_KEY, 'granted');
    expect(createTourStore(storage).getState().status).toBe('due');
  });

  it('is done after finish, and begin does not bring it back', () => {
    const storage = createMemoryStorage();
    const store = createTourStore(storage);
    store.getState().begin();
    store.getState().finish();
    store.getState().begin();
    expect(store.getState().status).toBe('done');
    expect(storage.getString(TOUR_STORAGE_KEY)).toBe('done');
    expect(createTourStore(storage).getState().status).toBe('done');
  });

  it('loads as done for a player from before the tour (a consent answer, no status)', () => {
    const storage = createMemoryStorage();
    storage.setString(CONSENT_STORAGE_KEY, 'denied');
    const store = createTourStore(storage);
    expect(store.getState().status).toBe('done');
    store.getState().begin();
    expect(store.getState().status).toBe('done');
  });
});

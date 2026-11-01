import { createMemoryStorage } from '@tavli/contracts';

import { CONSENT_STORAGE_KEY, CONSENT_VERSION } from '@/features/privacy/consent';

import { createBoardStepStore, WELCOME_BOARD_STORAGE_KEY } from './boardStep';

const answered = (status: 'granted' | 'denied', version = CONSENT_VERSION) =>
  JSON.stringify({ version, status });

describe('the board step (#350)', () => {
  it('is new on a phone that never answered consent', () => {
    expect(createBoardStepStore(createMemoryStorage()).getState().status).toBe('new');
  });

  it('is due after the first consent answer, also on the next launch', () => {
    const storage = createMemoryStorage();
    const store = createBoardStepStore(storage);
    store.getState().begin();
    expect(store.getState().status).toBe('due');
    // The app closes before the step, after the answer was saved.
    storage.setString(CONSENT_STORAGE_KEY, answered('granted'));
    expect(createBoardStepStore(storage).getState().status).toBe('due');
  });

  it('is done after Continue, for good', () => {
    const storage = createMemoryStorage();
    const store = createBoardStepStore(storage);
    store.getState().begin();
    store.getState().finish();
    expect(store.getState().status).toBe('done');
    expect(storage.getString(WELCOME_BOARD_STORAGE_KEY)).toBe('done');
    // A later consent answer (a new consent text) does not bring it back.
    store.getState().begin();
    expect(store.getState().status).toBe('done');
    expect(createBoardStepStore(storage).getState().status).toBe('done');
  });

  it.each([
    ['Allow', answered('granted')],
    ["Don't allow", answered('denied')],
    ['an answer to an older consent text', answered('denied', CONSENT_VERSION - 1)],
  ])('is done for a player who updated the app after %s', (_name, saved) => {
    const storage = createMemoryStorage();
    storage.setString(CONSENT_STORAGE_KEY, saved);
    const store = createBoardStepStore(storage);
    expect(store.getState().status).toBe('done');
    store.getState().begin();
    expect(store.getState().status).toBe('done');
  });

  it('reads a broken save like no save', () => {
    const storage = createMemoryStorage();
    storage.setString(WELCOME_BOARD_STORAGE_KEY, 'maybe');
    expect(createBoardStepStore(storage).getState().status).toBe('new');
    storage.setString(CONSENT_STORAGE_KEY, answered('granted'));
    expect(createBoardStepStore(storage).getState().status).toBe('done');
  });
});

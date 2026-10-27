import { createMemoryStorage } from '@tavli/contracts';

import {
  createSettingsStore,
  DEFAULT_SETTINGS,
  migrateSettings,
  sanitizeSettings,
  SETTINGS_STORAGE_KEY,
  SETTINGS_VERSION,
} from './settings';

function savedJson(storage: ReturnType<typeof createMemoryStorage>): unknown {
  const raw = storage.getString(SETTINGS_STORAGE_KEY);
  return raw === undefined ? undefined : JSON.parse(raw);
}

describe('settings store', () => {
  it('starts with the defaults', () => {
    const store = createSettingsStore(createMemoryStorage());
    const state = store.getState();

    expect(state.sound).toBe(true);
    expect(state.haptics).toBe(true);
    expect(state.language).toBe('system');
    expect(state.autoConfirmMoves).toBe(false);
    expect(state.showPipCounts).toBe(true);
    expect(state.boardFlipMode).toBe('flip');
    // The move list follows the screen reader until the player picks On or Off.
    expect(state.moveList).toBe('auto');
    expect(state.theme).toBe('walnut-kafeneio');
  });

  it('saves every change at once, with a version', () => {
    const storage = createMemoryStorage();
    const store = createSettingsStore(storage);

    store.getState().setSetting('sound', false);
    store.getState().setSetting('language', 'el');

    expect(savedJson(storage)).toEqual({
      version: SETTINGS_VERSION,
      state: { ...DEFAULT_SETTINGS, sound: false, language: 'el' },
    });
  });

  it('loads saved settings on the next start', () => {
    const storage = createMemoryStorage();
    const first = createSettingsStore(storage);
    first.getState().setSetting('autoConfirmMoves', true);
    first.getState().setSetting('boardFlipMode', 'fixed');
    first.getState().setSetting('showPipCounts', false);
    first.getState().setSetting('moveList', 'on');

    const second = createSettingsStore(storage);
    expect(second.getState()).toMatchObject({
      autoConfirmMoves: true,
      boardFlipMode: 'fixed',
      showPipCounts: false,
      moveList: 'on',
    });
  });

  it('does not save the actions', () => {
    const storage = createMemoryStorage();
    createSettingsStore(storage).getState().setSetting('haptics', false);

    const saved = savedJson(storage) as { state: Record<string, unknown> };
    expect(Object.keys(saved.state).sort()).toEqual(Object.keys(DEFAULT_SETTINGS).sort());
  });

  it('resets to the defaults', () => {
    const store = createSettingsStore(createMemoryStorage());
    store.getState().setSetting('sound', false);
    store.getState().resetSettings();
    expect(store.getState().sound).toBe(true);
  });

  it('replaces bad saved values with defaults', () => {
    const storage = createMemoryStorage({
      [SETTINGS_STORAGE_KEY]: JSON.stringify({
        version: SETTINGS_VERSION,
        state: {
          sound: 'yes',
          language: 'de',
          boardFlipMode: 'faceToFace',
          moveList: true,
          theme: 'neon',
        },
      }),
    });

    const store = createSettingsStore(storage);
    expect(store.getState()).toMatchObject(DEFAULT_SETTINGS);
  });

  it('survives broken JSON', () => {
    const storage = createMemoryStorage({ [SETTINGS_STORAGE_KEY]: '{not json' });
    const store = createSettingsStore(storage);
    expect(store.getState()).toMatchObject(DEFAULT_SETTINGS);
  });

  it('migrates a save from an older version', () => {
    const storage = createMemoryStorage({
      [SETTINGS_STORAGE_KEY]: JSON.stringify({ version: 0, state: { sound: false } }),
    });

    const store = createSettingsStore(storage);
    expect(store.getState().sound).toBe(false);
    expect(store.getState().haptics).toBe(true);
  });
});

describe('sanitizeSettings', () => {
  it('returns defaults for anything that is not an object', () => {
    expect(sanitizeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeSettings([])).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeSettings('x')).toEqual(DEFAULT_SETTINGS);
  });

  it('drops unknown keys', () => {
    expect(sanitizeSettings({ extra: 1, sound: false })).toEqual({
      ...DEFAULT_SETTINGS,
      sound: false,
    });
  });
});

describe('migrateSettings', () => {
  it('keeps valid values from any version', () => {
    expect(migrateSettings({ language: 'en' }, 0)).toEqual({ ...DEFAULT_SETTINGS, language: 'en' });
    expect(migrateSettings({ language: 'en' }, SETTINGS_VERSION + 1)).toEqual({
      ...DEFAULT_SETTINGS,
      language: 'en',
    });
  });
});

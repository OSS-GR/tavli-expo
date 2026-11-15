/**
 * The app colors follow the settings (#528): Match the board switches with
 * the board, a picked theme stays with any board. `jest.setup.ts` loads
 * `unistyles.ts`, so its settings listener is live here.
 */
import { themes } from '@tavli/ui';
import { act } from '@testing-library/react-native';
import { UnistylesRuntime } from 'react-native-unistyles';

import { DEFAULT_SETTINGS } from '@/features/settings/settings';
import { settingsStore } from '@/features/settings/store';

let setTheme: jest.SpyInstance;
let setRootBackground: jest.SpyInstance;

beforeEach(() => {
  settingsStore.setState({ ...DEFAULT_SETTINGS });
  setTheme = jest.spyOn(UnistylesRuntime, 'setTheme');
  setRootBackground = jest.spyOn(UnistylesRuntime, 'setRootViewBackgroundColor');
});

afterEach(() => {
  jest.restoreAllMocks();
  settingsStore.setState({ ...DEFAULT_SETTINGS });
});

async function pick<K extends 'theme' | 'boardTheme'>(
  key: K,
  value: (typeof DEFAULT_SETTINGS)[K],
): Promise<void> {
  await act(async () => {
    settingsStore.getState().setSetting(key, value);
  });
}

describe('app colors', () => {
  it('turns the whole app to Olive Inlay with the Olive Inlay board', async () => {
    expect(DEFAULT_SETTINGS.theme).toBe('match-board');
    await pick('boardTheme', 'olive-inlay');
    expect(setTheme).toHaveBeenLastCalledWith('olive-inlay');
    // A light root background under the light theme.
    expect(setRootBackground).toHaveBeenLastCalledWith(themes['olive-inlay'].colors.background);

    await pick('boardTheme', 'kafeneio-night');
    expect(setTheme).toHaveBeenLastCalledWith('kafeneio-night');
    expect(setRootBackground).toHaveBeenLastCalledWith(themes['kafeneio-night'].colors.background);
  });

  it('keeps a picked theme with any board', async () => {
    await pick('theme', 'kafeneio-night');
    expect(setTheme).toHaveBeenLastCalledWith('kafeneio-night');
    setTheme.mockClear();

    await pick('boardTheme', 'olive-inlay');
    await pick('boardTheme', 'walnut-kafeneio');
    expect(setTheme).not.toHaveBeenCalled();
  });

  it('switches back to the board colors with Match the board', async () => {
    await pick('boardTheme', 'olive-inlay');
    await pick('theme', 'walnut-kafeneio');
    expect(setTheme).toHaveBeenLastCalledWith('walnut-kafeneio');
    await pick('theme', 'match-board');
    expect(setTheme).toHaveBeenLastCalledWith('olive-inlay');
  });

  it('does nothing when the shown theme stays the same', async () => {
    // Walnut board, Match the board: picking Walnut shows the same colors.
    await pick('theme', 'walnut-kafeneio');
    await act(async () => {
      settingsStore.getState().setSetting('sound', false);
    });
    expect(setTheme).not.toHaveBeenCalled();
  });
});

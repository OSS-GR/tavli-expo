/**
 * The app's settings store, saved on the phone through the `Storage` port.
 * Every change saves at once. There is no Save button.
 */
import { useStore } from 'zustand';

import { storage } from '@/services';

import { createSettingsStore, type SettingsState } from './settings';

export const settingsStore = createSettingsStore(storage);

/** Reads settings in a component. Pass a selector to re-render only on what you use. */
export function useSettings<T>(selector: (state: SettingsState) => T): T {
  return useStore(settingsStore, selector);
}

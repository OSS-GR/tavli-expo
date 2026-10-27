/**
 * App settings: shape, defaults, validation, migrations and the store factory.
 *
 * The store is a Zustand store persisted through the `Storage` port. The app
 * passes the MMKV adapter (see `store.ts`); tests pass an in-memory one.
 *
 * To add a setting:
 * 1. Add the field to `Settings` and `DEFAULT_SETTINGS`.
 * 2. Add a check in `sanitizeSettings` (bad or missing values fall back to the default).
 * 3. Only if an old saved value must change meaning: raise `SETTINGS_VERSION`
 *    and add a step in `migrateSettings`.
 */
import type { Storage } from '@tavli/contracts';
import { DEFAULT_THEME_ID as DEFAULT_BOARD_THEME_ID, hasTheme } from '@tavli/themes';
import { DEFAULT_THEME_ID, isThemeId, type ThemeId } from '@tavli/ui';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import { createStore } from 'zustand/vanilla';

import { LANGUAGE_PREFERENCES, type LanguagePreference } from '@/i18n/languages';

/**
 * How the board turns in pass-and-play.
 * - `flip`: it turns to the player whose turn it is.
 * - `fixed`: it never turns.
 * Face-to-face (phone flat between the players) comes later.
 */
export type BoardFlipMode = 'flip' | 'fixed';

export const BOARD_FLIP_MODES: readonly BoardFlipMode[] = ['flip', 'fixed'];

/**
 * The move list next to the board (#134): one button per legal move.
 * - `auto`: shown while a screen reader (VoiceOver, TalkBack) is on.
 * - `on`: always shown. `off`: never shown.
 */
export type MoveListMode = 'auto' | 'on' | 'off';

export const MOVE_LIST_MODES: readonly MoveListMode[] = ['auto', 'on', 'off'];

/**
 * Where your home is, as on a real board seen from your seat (#175).
 * The phone shows the board on its side (portrait), so on screen your home
 * is always at the bottom.
 * - `right` (default): home on the bottom right of a real board. Checkers go
 *   round counterclockwise. On screen: home bottom left, start bottom right.
 * - `left`: home on the bottom left of a real board. The board is mirrored
 *   left to right, so checkers go round clockwise. On screen: home bottom
 *   right, start bottom left.
 */
export type HomeBoardSide = 'right' | 'left';

export const HOME_BOARD_SIDES: readonly HomeBoardSide[] = ['right', 'left'];

export interface Settings {
  sound: boolean;
  haptics: boolean;
  language: LanguagePreference;
  /** End the turn as soon as all dice are used, without a Confirm tap. */
  autoConfirmMoves: boolean;
  showPipCounts: boolean;
  boardFlipMode: BoardFlipMode;
  /** Where your home is (a real board seen from your seat). `left` mirrors the board. */
  homeBoardSide: HomeBoardSide;
  moveList: MoveListMode;
  /** The app colors (`@tavli/ui`). */
  theme: ThemeId;
  /** The board theme (`@tavli/themes`): the game, the tutorial and the rules pictures use it. */
  boardTheme: string;
}

export const DEFAULT_SETTINGS: Readonly<Settings> = {
  sound: true,
  haptics: true,
  language: 'system',
  autoConfirmMoves: false,
  showPipCounts: true,
  boardFlipMode: 'flip',
  homeBoardSide: 'right',
  moveList: 'auto',
  theme: DEFAULT_THEME_ID,
  boardTheme: DEFAULT_BOARD_THEME_ID,
};

/** Raise this when the saved shape changes, and add a step to `migrateSettings`. */
export const SETTINGS_VERSION = 1;

/** Storage key. The saved value is `{ state, version }` JSON (Zustand persist). */
export const SETTINGS_STORAGE_KEY = 'settings';

export interface SettingsActions {
  setSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
  resetSettings: () => void;
}

export type SettingsState = Settings & SettingsActions;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function oneOf<T extends string>(allowed: readonly T[], value: unknown, fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

/** Turns any saved value into valid settings. Unknown keys are dropped. */
export function sanitizeSettings(raw: unknown): Settings {
  const input = isRecord(raw) ? raw : {};
  const d = DEFAULT_SETTINGS;
  return {
    sound: bool(input['sound'], d.sound),
    haptics: bool(input['haptics'], d.haptics),
    language: oneOf(LANGUAGE_PREFERENCES, input['language'], d.language),
    autoConfirmMoves: bool(input['autoConfirmMoves'], d.autoConfirmMoves),
    showPipCounts: bool(input['showPipCounts'], d.showPipCounts),
    boardFlipMode: oneOf(BOARD_FLIP_MODES, input['boardFlipMode'], d.boardFlipMode),
    // Saves from before #175 have no value: they load as `right`, the board as it was.
    homeBoardSide: oneOf(HOME_BOARD_SIDES, input['homeBoardSide'], d.homeBoardSide),
    moveList: oneOf(MOVE_LIST_MODES, input['moveList'], d.moveList),
    theme: isThemeId(input['theme']) ? input['theme'] : d.theme,
    boardTheme:
      typeof input['boardTheme'] === 'string' && hasTheme(input['boardTheme'])
        ? input['boardTheme']
        : d.boardTheme,
  };
}

/**
 * Upgrades saved settings from an older `version`.
 * Version 1 is the first one, so there are no steps yet. Add them like this:
 *
 *   if (version < 2) { state = { ...state, newField: state.oldField }; }
 *
 * A save from a newer app version (after a downgrade) is sanitized as well.
 */
export function migrateSettings(persisted: unknown, version: number): Settings {
  const state: unknown = persisted;
  if (version < 1) {
    // Nothing was saved before version 1.
  }
  return sanitizeSettings(state);
}

function toStateStorage(storage: Storage): StateStorage {
  return {
    getItem: (key) => storage.getString(key) ?? null,
    setItem: (key, value) => storage.setString(key, value),
    removeItem: (key) => storage.remove(key),
  };
}

function pickSettings(state: SettingsState): Settings {
  return {
    sound: state.sound,
    haptics: state.haptics,
    language: state.language,
    autoConfirmMoves: state.autoConfirmMoves,
    showPipCounts: state.showPipCounts,
    boardFlipMode: state.boardFlipMode,
    homeBoardSide: state.homeBoardSide,
    moveList: state.moveList,
    theme: state.theme,
    boardTheme: state.boardTheme,
  };
}

/**
 * Creates a settings store saved in `storage`. The storage is synchronous, so
 * the saved settings are loaded before this function returns.
 */
export function createSettingsStore(storage: Storage) {
  return createStore<SettingsState>()(
    persist(
      (set) => ({
        ...DEFAULT_SETTINGS,
        setSetting: (key, value) => set({ [key]: value } as Partial<Settings>),
        resetSettings: () => set({ ...DEFAULT_SETTINGS }),
      }),
      {
        name: SETTINGS_STORAGE_KEY,
        version: SETTINGS_VERSION,
        storage: createJSONStorage<Settings>(() => toStateStorage(storage)),
        partialize: pickSettings,
        migrate: migrateSettings,
        // Runs on every load: keeps the actions and cleans the saved values.
        merge: (persisted, current) => ({ ...current, ...sanitizeSettings(persisted) }),
      },
    ),
  );
}

export type SettingsStore = ReturnType<typeof createSettingsStore>;

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

import { BOT_SPEEDS, type BotSpeed } from '@/features/bot/botSpeed';
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

/**
 * How the game screen shows the board in portrait (#184).
 * - `tall` (default): the board on its side, as large as the screen allows.
 *   The long side runs from the top to the bottom of the screen.
 * - `classic`: the board as it lies on a table, seen from your seat, as wide
 *   as the screen and centred on it.
 * The tutorial and the small board pictures always use `tall`.
 */
export type BoardLayoutMode = 'tall' | 'classic';

export const BOARD_LAYOUT_MODES: readonly BoardLayoutMode[] = ['tall', 'classic'];

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
  /** The game screen layout: the tall board on its side, or the classic wide board (#184). */
  boardLayout: BoardLayoutMode;
  moveList: MoveListMode;
  /** How fast the bot plays its turn (#172, timings in `features/bot/botSpeed.ts`). */
  botSpeed: BotSpeed;
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
  boardLayout: 'tall',
  moveList: 'auto',
  botSpeed: 'normal',
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
    // Saves from before #184 have no layout: they load as `tall`, close to the board they had.
    boardLayout: oneOf(BOARD_LAYOUT_MODES, input['boardLayout'], d.boardLayout),
    moveList: oneOf(MOVE_LIST_MODES, input['moveList'], d.moveList),
    // Saves from before #172 have no bot speed: they load as Normal.
    botSpeed: oneOf(BOT_SPEEDS, input['botSpeed'], d.botSpeed),
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
    boardLayout: state.boardLayout,
    moveList: state.moveList,
    botSpeed: state.botSpeed,
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

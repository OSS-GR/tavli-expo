/**
 * Game feedback for the app: sound and haptics, in one place.
 *
 * Call `feedback.event('checkerPlace')`. The board theme maps each event to
 * a sound (`theme.sounds`) and a haptic pattern (`theme.haptics`);
 * `createGameFeedback` plays both. It also drops an event that comes too
 * soon after the same one (`MIN_GAP_MS`), so fast moves do not pile up.
 *
 * `appSound` follows Settings → Sound and `appFeedback` follows
 * Settings → Haptics. Either can be off while the other is on.
 */
import {
  gatedFeedback,
  gatedSoundPlayer,
  type Feedback,
  type SoundBank,
  type SoundPlayer,
} from '@tavli/contracts';
import {
  FEEDBACK_EVENTS,
  soundFiles,
  type FeedbackEvent,
  type HapticKey,
  type ThemeManifest,
} from '@tavli/themes';

import { settingsStore } from '@/features/settings/store';
import { feedback, sound } from '@/services';

import { THEME_SOUNDS } from './themeSounds';

export type { FeedbackEvent };

/** Haptics that follow the Haptics setting. */
export const appFeedback: Feedback = gatedFeedback(
  feedback,
  () => settingsStore.getState().haptics,
);

/** Sounds that follow the Sound setting. */
export const appSound: SoundPlayer = gatedSoundPlayer(sound, () => settingsStore.getState().sound);

/**
 * The shortest time between two plays of the same event, in ms. A second
 * event inside the gap plays nothing (no sound, no haptic).
 */
export const MIN_GAP_MS: Readonly<Record<FeedbackEvent, number>> = {
  checkerPickUp: 60,
  checkerPlace: 70,
  checkerHit: 70,
  bearOff: 70,
  diceShake: 250,
  diceRoll: 250,
  diceLand: 0,
  invalidMove: 350,
  turnStart: 500,
  gameWin: 1500,
  matchWin: 1500,
};

export interface GameFeedback {
  /** Plays the theme's sound and haptic for `event`. */
  event(event: FeedbackEvent): void;
}

export interface GameFeedbackOptions {
  theme: ThemeManifest;
  sound?: SoundPlayer;
  haptics?: Feedback;
  /** A clock in ms. Default `Date.now`. */
  now?: () => number;
}

/** Sound and haptic for each game event of `theme`, with the `MIN_GAP_MS` throttle. */
export function createGameFeedback({
  theme,
  sound: player = appSound,
  haptics = appFeedback,
  now = Date.now,
}: GameFeedbackOptions): GameFeedback {
  const last = new Map<FeedbackEvent, number>();
  return {
    event: (event) => {
      const t = now();
      const before = last.get(event);
      // A clock that jumped back (t < before) counts as enough time passed.
      if (before !== undefined && t >= before && t - before < MIN_GAP_MS[event]) return;
      last.set(event, t);
      if (soundFiles(theme, event).length > 0) player.play(event);
      const style = theme.haptics[event];
      if (style !== undefined) haptics.haptic(style);
    },
  };
}

/** The theme's sounds as a bank for `SoundPlayer.load`. Files without a Metro asset are left out. */
export function soundBank(
  theme: ThemeManifest,
  assets: Readonly<Record<string, number>> = THEME_SOUNDS[theme.id] ?? {},
): SoundBank {
  const bank: Record<string, number[]> = {};
  for (const event of FEEDBACK_EVENTS) {
    const takes = soundFiles(theme, event)
      .map((f) => assets[f])
      .filter((id): id is number => id !== undefined);
    if (takes.length > 0) bank[event] = takes;
  }
  return bank;
}

let loadedThemeId: string | null = null;

/** Preloads the theme's sounds. Loading the same theme again does nothing. */
export function loadThemeSounds(theme: ThemeManifest, player: SoundPlayer = appSound): void {
  if (loadedThemeId === theme.id && player === appSound) return;
  player.load(soundBank(theme));
  if (player === appSound) loadedThemeId = theme.id;
}

/** Plays only the theme's haptic for `event`. Prefer `createGameFeedback(...).event`. */
export function playHaptic(
  theme: ThemeManifest,
  event: HapticKey,
  target: Feedback = appFeedback,
): void {
  const style = theme.haptics[event];
  if (style !== undefined) target.haptic(style);
}

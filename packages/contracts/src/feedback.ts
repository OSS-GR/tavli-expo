/**
 * Feedback port: haptics (small vibrations) for game events.
 *
 * Board themes name a pattern for each event (`theme.haptics.diceLand`
 * = `'light'`); the app passes that pattern here. Sound comes later.
 *
 * Adapters: `@tavli/haptics-expo` (the app), `createNoopFeedback` and
 * `createRecordingFeedback` (tests).
 */

/** Haptic patterns. Same names as the theme manifest's `HapticStyle`. */
export const HAPTIC_STYLES = [
  'selection',
  'light',
  'medium',
  'heavy',
  'success',
  'warning',
  'error',
] as const;

export type HapticStyle = (typeof HAPTIC_STYLES)[number];

export interface Feedback {
  /** Plays a haptic pattern. Never throws; a phone without haptics does nothing. */
  haptic(style: HapticStyle): void;
}

/** Feedback that does nothing. */
export function createNoopFeedback(): Feedback {
  return { haptic: () => undefined };
}

/** Feedback that remembers every call, for tests. */
export function createRecordingFeedback(): Feedback & { readonly calls: HapticStyle[] } {
  const calls: HapticStyle[] = [];
  return {
    calls,
    haptic: (style) => {
      calls.push(style);
    },
  };
}

/** Passes calls on only while `enabled()` is true (the Haptics setting). */
export function gatedFeedback(base: Feedback, enabled: () => boolean): Feedback {
  return {
    haptic: (style) => {
      if (enabled()) base.haptic(style);
    },
  };
}

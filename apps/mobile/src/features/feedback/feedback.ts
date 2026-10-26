/**
 * Game feedback (haptics) for the app.
 *
 * `appFeedback` follows the Haptics setting. `playHaptic` takes a theme
 * event name (`diceLand`, `checkerHit`, …) and plays the pattern the board
 * theme gives for it.
 */
import { gatedFeedback, type Feedback } from '@tavli/contracts';
import type { HapticKey, ThemeManifest } from '@tavli/themes';

import { settingsStore } from '@/features/settings/store';
import { feedback } from '@/services';

export const appFeedback: Feedback = gatedFeedback(
  feedback,
  () => settingsStore.getState().haptics,
);

/** Plays the theme's pattern for `event`. Does nothing if the theme has none. */
export function playHaptic(
  theme: ThemeManifest,
  event: HapticKey,
  target: Feedback = appFeedback,
): void {
  const style = theme.haptics[event];
  if (style !== undefined) target.haptic(style);
}

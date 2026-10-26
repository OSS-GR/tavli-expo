/**
 * `Feedback` adapter backed by expo-haptics.
 *
 * Calls never throw: a phone without a haptic engine (or a simulator)
 * rejects the promise, and we drop that error.
 */
import type { Feedback, HapticStyle } from '@tavli/contracts';
import {
  ImpactFeedbackStyle,
  NotificationFeedbackType,
  impactAsync,
  notificationAsync,
  selectionAsync,
} from 'expo-haptics';

function play(style: HapticStyle): Promise<void> {
  switch (style) {
    case 'selection':
      return selectionAsync();
    case 'light':
      return impactAsync(ImpactFeedbackStyle.Light);
    case 'medium':
      return impactAsync(ImpactFeedbackStyle.Medium);
    case 'heavy':
      return impactAsync(ImpactFeedbackStyle.Heavy);
    case 'success':
      return notificationAsync(NotificationFeedbackType.Success);
    case 'warning':
      return notificationAsync(NotificationFeedbackType.Warning);
    case 'error':
      return notificationAsync(NotificationFeedbackType.Error);
  }
}

export function createExpoFeedback(): Feedback {
  return {
    haptic: (style) => {
      try {
        void play(style).catch(() => undefined);
      } catch {
        // No haptics on this device.
      }
    },
  };
}

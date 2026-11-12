import { router } from 'expo-router';

/**
 * Back from a Settings page (#501): to the page under it, or to the
 * Settings index when the page opened alone (a deep link).
 */
export function backToSettings(): void {
  if (router.canGoBack()) router.back();
  else router.replace('/settings');
}

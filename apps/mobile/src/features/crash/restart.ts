import { reloadAppAsync } from 'expo';

/** Reloads the JavaScript app, like a fresh start. Works in release builds too. */
export function restartApp(): Promise<void> {
  return reloadAppAsync('Restart after a crash');
}

/**
 * `SoundPlayer` adapter.
 *
 * - On a phone it is backed by expo-audio (`player.ts`).
 * - In a browser Metro picks `player.web.ts`: the Web Audio API
 *   (`web-audio.ts`), because expo-audio on the web blocks Safari (#675).
 *
 * Both files export the same `createExpoSoundPlayer`, so `services.ts`
 * picks one adapter and knows nothing about the platform.
 */
export { createExpoSoundPlayer, type ExpoSoundPlayerOptions } from './player';

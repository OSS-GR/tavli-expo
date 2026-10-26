/**
 * Ports (interfaces) and shared types.
 *
 * Each outside service (auth, backend, push, analytics) gets an interface
 * here. Vendor code lives in `packages/adapters/*` and implements these
 * interfaces. This package has no runtime dependencies.
 */

/** The Greek tavli games the app supports. */
export const GAME_IDS = ['portes', 'plakoto', 'fevga', 'asodio'] as const;

export type GameId = (typeof GAME_IDS)[number];

export {
  HAPTIC_STYLES,
  createNoopFeedback,
  createRecordingFeedback,
  gatedFeedback,
  type Feedback,
  type HapticStyle,
} from './feedback';
export { createMemoryStorage, type Storage } from './storage';

/**
 * SoundPlayer port: short sound effects for game events.
 *
 * The app loads the sounds of the board theme once (`load`), then plays them
 * by name (`play('checkerPlace')`). A sound can have several takes; the
 * player plays them in turn, so repeats sound natural.
 *
 * This is a separate port from `Feedback` (haptics): each port has one job
 * and one vendor adapter (`expo-audio` here, `expo-haptics` there), and each
 * follows its own setting (Sound, Haptics). `features/feedback` in the app
 * plays both for one game event.
 *
 * Adapters: `@tavli/audio-expo` (the app), `createNoopSoundPlayer` and
 * `createRecordingSoundPlayer` (tests).
 */

/**
 * Where a sound comes from: a bundled asset id (`require('./x.m4a')` gives a
 * number in React Native) or a URI.
 */
export type SoundSource = number | string;

/** Sound name -> its takes. Names are the theme's sound keys. */
export type SoundBank = Readonly<Record<string, readonly SoundSource[]>>;

export interface SoundPlayer {
  /**
   * Loads (preloads) every take, so `play` starts without delay. Replaces the
   * bank loaded before. Never throws.
   */
  load(bank: SoundBank): void;
  /** Plays the next take of `name`. A name without takes does nothing. Never throws. */
  play(name: string): void;
  /** Stops all sounds and frees them. */
  unload(): void;
}

/** A sound player that does nothing. */
export function createNoopSoundPlayer(): SoundPlayer {
  return { load: () => undefined, play: () => undefined, unload: () => undefined };
}

/** A sound player that remembers what it loaded and played, for tests. */
export function createRecordingSoundPlayer(): SoundPlayer & {
  readonly played: string[];
  readonly loaded: SoundBank[];
} {
  const played: string[] = [];
  const loaded: SoundBank[] = [];
  return {
    played,
    loaded,
    load: (bank) => {
      loaded.push(bank);
    },
    play: (name) => {
      played.push(name);
    },
    unload: () => undefined,
  };
}

/** Plays only while `enabled()` is true (the Sound setting). Loading always passes on. */
export function gatedSoundPlayer(base: SoundPlayer, enabled: () => boolean): SoundPlayer {
  return {
    load: (bank) => base.load(bank),
    play: (name) => {
      if (enabled()) base.play(name);
    },
    unload: () => base.unload(),
  };
}

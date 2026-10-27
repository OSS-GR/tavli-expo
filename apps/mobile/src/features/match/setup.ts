/**
 * The choices of the new-game screen (wireframes 4 and 5) and how a local
 * match is set up from them. Pure.
 *
 * Vs bot: the human plays White (at the bottom), the bot plays Black.
 */
import { BOT_DIFFICULTIES, type Difficulty } from '@tavli/contracts';
import type { PerPlayer, PlayerId } from '@tavli/engine';

/** `bot`: vs the bot. `local`: pass-and-play on one phone. */
export type MatchMode = 'bot' | 'local';

export const MATCH_MODES: readonly MatchMode[] = ['bot', 'local'];

export function isMatchMode(value: unknown): value is MatchMode {
  return value === 'bot' || value === 'local';
}

/** Match lengths on the new-game screen. The owner's default is 3. */
export const MATCH_LENGTHS = [1, 3, 5, 7] as const;

export type MatchLength = (typeof MATCH_LENGTHS)[number];

export function isMatchLength(value: unknown): value is MatchLength {
  return (MATCH_LENGTHS as readonly unknown[]).includes(value);
}

/** The games of the picker. Only Portes is playable in MVP1. */
export const GAME_CHOICES = ['portes', 'plakoto', 'fevga', 'asodio', 'tavli'] as const;

export type GameChoice = (typeof GAME_CHOICES)[number];

export const PLAYABLE_GAMES: readonly GameChoice[] = ['portes'];

/** Names longer than this are cut (wireframe 5). */
export const MAX_NAME_LENGTH = 16;

export const HUMAN_SIDE: PlayerId = 'white';
export const BOT_SIDE: PlayerId = 'black';

export interface MatchSetup {
  readonly mode: MatchMode;
  readonly game: 'portes';
  readonly targetPoints: MatchLength;
  /** Used vs bot only. */
  readonly botLevel: Difficulty;
  /** Pass-and-play names as typed (trimmed). Empty = "Player 1" / "Player 2". */
  readonly names: PerPlayer<string>;
}

export function defaultSetup(mode: MatchMode): MatchSetup {
  return {
    mode,
    game: 'portes',
    targetPoints: 3,
    botLevel: 'easy',
    names: { white: '', black: '' },
  };
}

/** Trims a typed name and cuts it to `MAX_NAME_LENGTH` characters. */
export function cleanName(value: unknown): string {
  if (typeof value !== 'string') return '';
  return [...value.trim()].slice(0, MAX_NAME_LENGTH).join('').trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Turns any saved value into a valid setup for `mode`. Bad fields fall
 * back to the defaults. A bot level this build cannot play becomes the
 * easiest one it can (`levels`).
 */
export function sanitizeSetup(
  raw: unknown,
  mode: MatchMode,
  levels: readonly Difficulty[] = BOT_DIFFICULTIES,
): MatchSetup {
  const d = defaultSetup(mode);
  const input = isRecord(raw) ? raw : {};
  const names = isRecord(input['names']) ? input['names'] : {};
  const level = input['botLevel'];
  return {
    mode,
    game: 'portes',
    targetPoints: isMatchLength(input['targetPoints']) ? input['targetPoints'] : d.targetPoints,
    botLevel: levels.includes(level as Difficulty)
      ? (level as Difficulty)
      : (levels[0] ?? d.botLevel),
    names: { white: cleanName(names['white']), black: cleanName(names['black']) },
  };
}

/**
 * The player names inside the engine match. The screen shows names from
 * the setup (in the app language), so these are only labels for the log.
 */
export function enginePlayers(setup: MatchSetup): PerPlayer<string> {
  if (setup.mode === 'bot') return { white: 'you', black: 'bot' };
  return {
    white: setup.names.white || 'player-1',
    black: setup.names.black || 'player-2',
  };
}

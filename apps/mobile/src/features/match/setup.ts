/**
 * The choices of the new-game screen (wireframes 4 and 5) and how a local
 * match is set up from them. Pure.
 *
 * Vs bot: the human plays White (at the bottom), the bot plays Black.
 */
import { BOT_DIFFICULTIES, type Difficulty } from '@tavli/contracts';
import {
  DEFAULT_PRESET_BY_GAME,
  VARIANT_REGISTRY,
  getPreset,
  resolveRules,
  type PerPlayer,
  type PlayerId,
  type PresetId,
  type RuleSet,
  type StandardVariantId,
  type VariantRegistry,
} from '@tavli/engine';

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

/**
 * The games of the picker (#109). `tavli` is a full Tavli match: Portes →
 * Plakoto → Fevga in rotation (`docs/rules/tavli-match.md`). A game is
 * open when the engine has every game of its rotation and the board can
 * draw it (`isGameBuilt`). Asodio (#115, #124) is a one-game match of the
 * owner version (`asodio.kafeneio`); it is not in the Tavli rotation.
 */
export const GAME_CHOICES = ['portes', 'plakoto', 'fevga', 'tavli', 'asodio'] as const;

export type GameChoice = (typeof GAME_CHOICES)[number];

export function isGameChoice(value: unknown): value is GameChoice {
  return (GAME_CHOICES as readonly unknown[]).includes(value);
}

/** The engine preset of each game. */
const GAME_PRESETS: { readonly [G in GameChoice]: PresetId } = {
  portes: DEFAULT_PRESET_BY_GAME.portes,
  plakoto: DEFAULT_PRESET_BY_GAME.plakoto,
  fevga: DEFAULT_PRESET_BY_GAME.fevga,
  tavli: 'tavli',
  asodio: DEFAULT_PRESET_BY_GAME.asodio,
};

export function gamePreset(game: GameChoice): PresetId {
  return GAME_PRESETS[game];
}

/** The game itself for a one-game match; `null` for the Tavli rotation. */
function singleGame(game: GameChoice): StandardVariantId | null {
  return game === 'tavli' ? null : game;
}

/**
 * The rules of a new match of `game`: its preset (`resolveRules`). A
 * one-game match plays only that game: the Plakoto and Fevga presets keep
 * the shared rotation Portes → Plakoto → Fevga (`NEUTRAL` in the engine), so
 * we set `match.rotation` to the game ("single game" in `tavli-match.md`).
 * Tavli keeps its rotation.
 */
export function gameRuleSet(game: GameChoice): RuleSet {
  const only = singleGame(game);
  return resolveRules(gamePreset(game), only === null ? {} : { match: { rotation: [only] } });
}

/** The games one match of `game` plays, in order: one entry, or three for Tavli. */
export function gameRotation(game: GameChoice): readonly StandardVariantId[] {
  const only = singleGame(game);
  return only === null ? getPreset(gamePreset(game)).match.rotation : [only];
}

/**
 * The games the board can draw and play (#108, #124). Add a game here once
 * the board supports it.
 */
export const BOARD_GAMES: ReadonlySet<StandardVariantId> = new Set([
  'portes',
  'plakoto',
  'fevga',
  'asodio',
]);

/** True when the engine can play every game of the rotation and the board can draw it. */
export function isGameBuilt(
  game: GameChoice,
  registry: VariantRegistry = VARIANT_REGISTRY,
): boolean {
  return gameRotation(game).every((variant) => registry.has(variant) && BOARD_GAMES.has(variant));
}

/**
 * The bot levels this build can play, per game. A game with no level is
 * locked vs the bot. Tavli needs a level for each game of its rotation.
 * See `features/bot/levels.ts`.
 */
export type GameLevels = { readonly [G in GameChoice]: readonly Difficulty[] };

/**
 * `levels` for every built game, then `overrides` per game. A game that
 * is not built gets none. Handy for tests and fakes.
 */
export function gameLevels(
  levels: readonly Difficulty[],
  overrides: { readonly [G in GameChoice]?: readonly Difficulty[] } = {},
): GameLevels {
  const entries = GAME_CHOICES.map((game) => [
    game,
    overrides[game] ?? (isGameBuilt(game) ? levels : []),
  ]);
  return Object.fromEntries(entries) as GameLevels;
}

/** Every built game at every level (the default). */
export const ALL_GAME_LEVELS: GameLevels = gameLevels(BOT_DIFFICULTIES);

/**
 * Can the player start `game` in this mode? Pass-and-play needs only the
 * engine. Vs bot also needs a bot level for the game.
 */
export function isGameOpen(game: GameChoice, mode: MatchMode, levels: GameLevels): boolean {
  if (!isGameBuilt(game)) return false;
  return mode === 'local' || levels[game].length > 0;
}

/** Names longer than this are cut (wireframe 5). */
export const MAX_NAME_LENGTH = 16;

export const HUMAN_SIDE: PlayerId = 'white';
export const BOT_SIDE: PlayerId = 'black';

export interface MatchSetup {
  readonly mode: MatchMode;
  /** The game (#109). Default: Portes. */
  readonly game: GameChoice;
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

export interface SanitizeOptions {
  /**
   * Keep any built game, even one the bot cannot play now (a saved match:
   * its log already holds the game). Default: a locked game becomes Portes.
   */
  readonly keepBuiltGame?: boolean;
}

/**
 * Turns any saved value into a valid setup for `mode`. Bad fields fall
 * back to the defaults. A game that is locked in this mode becomes Portes.
 * A bot level this build cannot play for the game becomes the easiest one
 * it can (`levels`).
 */
export function sanitizeSetup(
  raw: unknown,
  mode: MatchMode,
  levels: GameLevels = ALL_GAME_LEVELS,
  options: SanitizeOptions = {},
): MatchSetup {
  const d = defaultSetup(mode);
  const input = isRecord(raw) ? raw : {};
  const names = isRecord(input['names']) ? input['names'] : {};
  const level = input['botLevel'];
  const wanted = input['game'];
  const game =
    isGameChoice(wanted) &&
    (options.keepBuiltGame ? isGameBuilt(wanted) : isGameOpen(wanted, mode, levels))
      ? wanted
      : d.game;
  const gameLevels = levels[game];
  return {
    mode,
    game,
    targetPoints: isMatchLength(input['targetPoints']) ? input['targetPoints'] : d.targetPoints,
    botLevel: gameLevels.includes(level as Difficulty)
      ? (level as Difficulty)
      : (gameLevels[0] ?? d.botLevel),
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

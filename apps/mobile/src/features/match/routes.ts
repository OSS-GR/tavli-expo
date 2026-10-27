/** Links and route params of the app shell (wireframes, "Route map"). Pure. */
import type { TutorialGame, TutorialSource } from '@tavli/contracts';

import { isMatchMode, type MatchMode } from './setup';

type Param = string | string[] | undefined;

function first(value: Param): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** `/new-game?mode=bot` or `?mode=local`. */
export function newGameHref(mode: MatchMode) {
  return { pathname: '/new-game', params: { mode } } as const;
}

/**
 * New game vs bot for the first game after the tutorial (#128): the game
 * of the lessons (Portes: `first=1`; the others by name, `first=plakoto`,
 * #149, #159) vs the Easy bot, whatever was chosen last time.
 */
export function firstGameHref(game: TutorialGame = 'portes') {
  return {
    pathname: '/new-game',
    params: { mode: 'bot', first: game === 'portes' ? '1' : game },
  } as const;
}

/**
 * The tutorial, opened from Home, a rules page or Settings (#128).
 * `game` picks the lesson set (#149, #159); Portes, the default, has no param.
 */
export function tutorialHref(from: TutorialSource, game: TutorialGame = 'portes') {
  return game === 'portes'
    ? ({ pathname: '/tutorial', params: { from } } as const)
    : ({ pathname: '/tutorial', params: { from, game } } as const);
}

/** The board of a local match. */
export function gameHref(id: string) {
  return { pathname: '/game/[id]', params: { id } } as const;
}

/** The match-end screen of a finished local match (wireframe 9). */
export function matchEndHref(id: string) {
  return { pathname: '/game/[id]/match-end', params: { id } } as const;
}

/** The rules page of a game (`/rules/portes`, …). */
export function rulesHref(variant: string) {
  return { pathname: '/rules/[variant]', params: { variant } } as const;
}

/** The `mode` param of the new-game screen. Anything else means vs bot. */
export function parseModeParam(value: Param): MatchMode {
  const mode = first(value);
  return isMatchMode(mode) ? mode : 'bot';
}

/** The `id` param of the game route, or `null` when it is missing. */
export function parseIdParam(value: Param): string | null {
  const id = first(value);
  return typeof id === 'string' && id.length > 0 ? id : null;
}

/** Every lesson set, in the order Settings lists them (#159). */
export const TUTORIAL_GAMES: readonly TutorialGame[] = ['portes', 'plakoto', 'fevga', 'asodio'];

/**
 * The `first` param of the new-game screen: the first game after the
 * tutorial, in the game of its lessons (`1` = Portes). `null`: not after
 * the tutorial.
 */
export function parseFirstGameParam(value: Param): TutorialGame | null {
  const game = first(value);
  if (game === '1') return 'portes';
  return TUTORIAL_GAMES.find((g) => g === game && g !== 'portes') ?? null;
}

/** The `game` param of the tutorial (#149, #159). Anything else is Portes. */
export function parseTutorialGame(value: Param): TutorialGame {
  const game = first(value);
  return TUTORIAL_GAMES.find((g) => g === game) ?? 'portes';
}

const TUTORIAL_SOURCES: readonly TutorialSource[] = ['home', 'rules', 'settings'];

/** The `from` param of the tutorial. Anything else counts as Home. */
export function parseTutorialSource(value: Param): TutorialSource {
  const from = first(value);
  return TUTORIAL_SOURCES.find((s) => s === from) ?? 'home';
}

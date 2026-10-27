/** Links and route params of the app shell (wireframes, "Route map"). Pure. */
import type { TutorialSource } from '@tavli/contracts';

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
 * New game vs bot for the first game after the tutorial (#128): Portes vs
 * the Easy bot, whatever was chosen last time.
 */
export function firstGameHref() {
  return { pathname: '/new-game', params: { mode: 'bot', first: '1' } } as const;
}

/** The tutorial, opened from Home, a rules page or Settings (#128). */
export function tutorialHref(from: TutorialSource) {
  return { pathname: '/tutorial', params: { from } } as const;
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

/** The `first` param of the new-game screen: the first game after the tutorial. */
export function parseFirstGameParam(value: Param): boolean {
  return first(value) === '1';
}

const TUTORIAL_SOURCES: readonly TutorialSource[] = ['home', 'rules', 'settings'];

/** The `from` param of the tutorial. Anything else counts as Home. */
export function parseTutorialSource(value: Param): TutorialSource {
  const from = first(value);
  return TUTORIAL_SOURCES.find((s) => s === from) ?? 'home';
}

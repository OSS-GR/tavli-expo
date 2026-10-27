/** Links and route params of the app shell (wireframes, "Route map"). Pure. */
import { isMatchMode, type MatchMode } from './setup';

type Param = string | string[] | undefined;

function first(value: Param): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** `/new-game?mode=bot` or `?mode=local`. */
export function newGameHref(mode: MatchMode) {
  return { pathname: '/new-game', params: { mode } } as const;
}

/** The board of a local match. */
export function gameHref(id: string) {
  return { pathname: '/game/[id]', params: { id } } as const;
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

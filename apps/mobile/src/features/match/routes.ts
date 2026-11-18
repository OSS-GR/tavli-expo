/** Links and route params of the app shell (wireframes, "Route map"). Pure. */
import type { RankedGame, SupportSource, TutorialGame, TutorialSource } from '@tavli/contracts';
import type { PresetId } from '@tavli/engine';

import {
  isMatchMode,
  isRulesVersion,
  isVersionedGame,
  otherVersion,
  type MatchMode,
} from './setup';

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
 * The tutorial, opened from Home, a rules page, Settings (#128) or the
 * empty History (#521).
 * `game` picks the lesson set (#149, #159); Portes, the default, has no param.
 * `start` (0-based, #571) opens a later lesson: Continue on How to play.
 */
export function tutorialHref(from: TutorialSource, game: TutorialGame = 'portes', start = 0) {
  const params = {
    from,
    ...(game === 'portes' ? {} : { game }),
    ...(start > 0 ? { start: String(start) } : {}),
  };
  return { pathname: '/tutorial', params } as const;
}

/** The first lesson to show: the `start` param, or 0 when it is missing or out of range. */
export function parseTutorialStart(value: Param, count: number): number {
  const n = Number(first(value));
  return Number.isInteger(n) && n > 0 && n < count ? n : 0;
}

/** How to play (#571): the hub with every game's lessons and rules. */
export const HOW_TO_PLAY_HREF = '/rules';

/** Where the app tour (#573) was opened from: Home (the first run), How to play or Settings. */
export type TourSource = 'home' | 'rules' | 'settings';

/** The app tour (#573). */
export function tourHref(from: TourSource) {
  return { pathname: '/tour', params: { from } } as const;
}

/** Reads the tour's `from`. Anything else is Home. */
export function parseTourSource(value: string | undefined): TourSource {
  return value === 'rules' || value === 'settings' ? value : 'home';
}

/** Support Tavlaki (#590), from the Settings row or the ask card. */
export function supportHref(from: SupportSource) {
  return { pathname: '/support', params: { from } } as const;
}

/** Reads the Support screen's `from`. Anything else is Settings. */
export function parseSupportSource(value: string | undefined): SupportSource {
  return value === 'ask' ? 'ask' : 'settings';
}

/** A local match id (`local-…`). Any other id names an online game (#255). */
export function isLocalGameId(id: string): boolean {
  return id.startsWith('local-');
}

/** The board of a local match, or of an online game (#255). */
export function gameHref(id: string) {
  return { pathname: '/game/[id]', params: { id } } as const;
}

/** The invite screen of an invite code (#256): what `tavlaki://invite/<code>` opens. */
export function inviteHref(code: string) {
  return { pathname: '/invite/[code]', params: { code } } as const;
}

/** Play a friend online (#281): pick the game, then make an invite. */
export const FRIEND_HREF = '/friend';

/** Play ranked (#532): a new player close to your rating, two minutes a turn. */
export const RANKED_HREF = '/ranked';

/** Play ranked with a game picked: New player at the end of a ranked match. */
export function rankedHref(game: RankedGame) {
  return { pathname: '/ranked', params: { game } } as const;
}

/** Join with a code (#333): type the code of a friend's invite. */
export const JOIN_HREF = '/join';

/** Every active online game of this phone's account (#297): "See all" on Home. */
export const ONLINE_GAMES_HREF = '/online-games';

/** The waiting screen of an invite this phone made (#281): code, link, Share and Cancel. */
export function inviteWaitHref(code: string) {
  return { pathname: '/friend/[code]', params: { code } } as const;
}

/** Leaderboards (#407): your rating and the boards, from Settings → Online and Friends. */
export const RATINGS_HREF = '/ratings';

/** What's new (#471): what each app update added, from Settings → Help and Home's button. */
export const WHATS_NEW_HREF = '/whats-new';

/** Friends (#406): the friends list, from Settings → Online. */
export const FRIENDS_HREF = '/friends';

/** Add a friend (#406): your link and QR code, username search, recent players. */
export const ADD_FRIEND_HREF = '/friends/add';

/** Invite a friend to a game (#406): the Play a friend setup, for one friend. */
export function friendInviteHref(playerId: string) {
  return { pathname: '/friends/invite/[id]', params: { id: playerId } } as const;
}

/** The screen of a friend link (#406): what `https://tavlaki.com/add/<token>` opens. */
export function friendLinkHref(token: string) {
  return { pathname: '/add/[token]', params: { token } } as const;
}

/** The match-end screen of a finished match, local or online (wireframe 9). */
export function matchEndHref(id: string) {
  return { pathname: '/game/[id]/match-end', params: { id } } as const;
}

/**
 * The game review (#215). A local match reviews the game that just ended.
 * An online game (#604) names the game of the match to review, from 1
 * (`game`): the server sends that game's moves.
 */
export function reviewHref(id: string, game?: number) {
  return {
    pathname: '/game/[id]/review',
    params: game === undefined ? { id } : { id, game: String(game) },
  } as const;
}

/** The `game` param of an online review (#604): a whole number from 1, else `null`. */
export function parseGameNumber(value: Param): number | null {
  const text = first(value);
  if (typeof text !== 'string' || !/^[1-9][0-9]{0,3}$/.test(text)) return null;
  return Number(text);
}

/**
 * The rules page of a game (`/rules/portes`, …). `preset` is the engine
 * preset in play or chosen: a rules version of `variant` that is not the
 * default (#241) adds `version` (`/rules/asodio?version=asodio.aceyDeuceyGreek`).
 * Another game's version adds nothing.
 */
export function rulesHref(variant: string, preset?: PresetId) {
  const other = preset === undefined ? null : otherVersion(preset);
  const version =
    other !== null && isVersionedGame(variant) && isRulesVersion(variant, other) ? other : null;
  return version === null
    ? ({ pathname: '/rules/[variant]', params: { variant } } as const)
    : ({ pathname: '/rules/[variant]', params: { variant, version } } as const);
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

const TUTORIAL_SOURCES: readonly TutorialSource[] = ['home', 'rules', 'settings', 'history'];

/** The `from` param of the tutorial. Anything else counts as Home. */
export function parseTutorialSource(value: Param): TutorialSource {
  const from = first(value);
  return TUTORIAL_SOURCES.find((s) => s === from) ?? 'home';
}

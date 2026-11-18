/**
 * The pure parts of the pushes: "your turn" (#280), "game over" (#316),
 * friend invites (#406), friend requests and match starts (#631). Who gets
 * a push after a save, the text in each language, the messages, which
 * tokens to drop or retry. No Convex types; `push.ts` holds the
 * functions. See "Push" in `docs/architecture/online-game-service.md`.
 */

import type {
  OnlineGameStatus,
  PlayerName,
  PushErrorCode,
  PushLocale,
  PushMessage,
  PushResult,
} from '@tavli/contracts';
import { PLAYERS } from '@tavli/engine';
import type { MatchFlow, PlayerId } from '@tavli/engine';
import { waitingFor } from '@tavli/online';

/** The most push tokens a player keeps (one per phone). A new one drops the oldest. */
export const MAX_PUSH_TOKENS_PER_PLAYER = 5;

/**
 * What a push says (#631): each kind of push, as the receiver reads it.
 * `matchStart` is the first push of a new match (`rankedStart` for Play
 * ranked: a match was found).
 */
export type PushTextKind =
  | 'turn'
  | 'matchStart'
  | 'rankedStart'
  | 'matchEnd'
  | 'friendInvite'
  | 'friendRequest'
  | 'friendAccepted';

/** The text of one kind of push: the body names the other player when the server has a name. */
interface PushTextForms {
  readonly title: string;
  readonly named: (name: string) => string;
  readonly unnamed: string;
}

/**
 * The text of every push, in each language (#631): the one place to
 * change it. Greek follows `docs/design/greek-copy.md`: a name goes first
 * with no article. A push holds no emails, no moves and not who won.
 */
export const PUSH_TEXTS: Readonly<
  Record<PushLocale, Readonly<Record<PushTextKind, PushTextForms>>>
> = {
  en: {
    turn: {
      title: 'Your turn',
      named: (name) => `${name} is waiting for your move.`,
      unnamed: 'An online game is waiting for your move.',
    },
    matchStart: {
      title: 'New game',
      named: (name) => `Your game with ${name} has started. Your roll.`,
      unnamed: 'Your online game has started. Your roll.',
    },
    rankedStart: {
      title: 'Match found',
      named: (name) => `Your ranked game with ${name} has started. Your roll.`,
      unnamed: 'Your ranked game has started. Your roll.',
    },
    matchEnd: {
      title: 'Game over',
      named: (name) => `Your game with ${name} is over. See the result.`,
      unnamed: 'Your game is over. See the result.',
    },
    friendInvite: {
      title: 'Game invite',
      named: (name) => `${name} invites you to a game.`,
      unnamed: 'A friend invites you to a game.',
    },
    friendRequest: {
      title: 'Friend request',
      named: (name) => `${name} wants to be your friend.`,
      unnamed: 'A player wants to be your friend.',
    },
    friendAccepted: {
      title: 'New friend',
      named: (name) => `${name} accepted your friend request.`,
      unnamed: 'A player accepted your friend request.',
    },
  },
  el: {
    turn: {
      title: 'Σειρά σου',
      named: (name) => `${name} περιμένει την κίνησή σου.`,
      unnamed: 'Ένα online παιχνίδι περιμένει την κίνησή σου.',
    },
    matchStart: {
      title: 'Νέο παιχνίδι',
      named: (name) => `Το παιχνίδι με ${name} ξεκίνησε. Ρίξε το ζάρι σου.`,
      unnamed: 'Το online παιχνίδι σου ξεκίνησε. Ρίξε το ζάρι σου.',
    },
    rankedStart: {
      title: 'Βρέθηκε αντίπαλος',
      named: (name) => `Το παιχνίδι κατάταξης με ${name} ξεκίνησε. Ρίξε το ζάρι σου.`,
      unnamed: 'Το παιχνίδι κατάταξης ξεκίνησε. Ρίξε το ζάρι σου.',
    },
    matchEnd: {
      title: 'Τέλος παιχνιδιού',
      named: (name) => `Το παιχνίδι με ${name} τελείωσε. Δες το αποτέλεσμα.`,
      unnamed: 'Το παιχνίδι σου τελείωσε. Δες το αποτέλεσμα.',
    },
    friendInvite: {
      title: 'Πρόσκληση σε παιχνίδι',
      named: (name) => `${name} σε προσκαλεί σε παιχνίδι.`,
      unnamed: 'Ένας φίλος σε προσκαλεί σε παιχνίδι.',
    },
    friendRequest: {
      title: 'Αίτημα φιλίας',
      named: (name) => `${name} θέλει να γίνετε φίλοι.`,
      unnamed: 'Ένας παίκτης θέλει να γίνετε φίλοι.',
    },
    friendAccepted: {
      title: 'Νέα φιλία',
      named: (name) => `${name} αποδέχτηκε το αίτημα φιλίας σου.`,
      unnamed: 'Ένας παίκτης αποδέχτηκε το αίτημα φιλίας σου.',
    },
  },
};

/** A name as a push writes it: the username, or "Guest 4821" ("Επισκέπτης 4821"), like the app. */
export function pushNameText(name: PlayerName, locale: PushLocale): string {
  if (name.kind === 'username') return name.name;
  return `${locale === 'el' ? 'Επισκέπτης' : 'Guest'} ${name.number}`;
}

/** The title and body of a push of `kind` in `locale`, naming `name` when there is one. */
export function pushText(
  kind: PushTextKind,
  locale: PushLocale,
  name: PlayerName | null,
): { readonly title: string; readonly body: string } {
  const forms = PUSH_TEXTS[locale][kind];
  return {
    title: forms.title,
    body: name === null ? forms.unnamed : forms.named(pushNameText(name, locale)),
  };
}

/** "Your turn" in English with no name: what an old token row (no language) and no name read. */
export const TURN_PUSH_TEXT = pushText('turn', 'en', null);

/** "Game over" (#316) in English with no name. */
export const MATCH_END_PUSH_TEXT = pushText('matchEnd', 'en', null);

/** One phone to push to: its token and the language of its pushes (#631). */
export interface PushTarget {
  readonly token: string;
  readonly locale: PushLocale;
}

/**
 * Which push a save schedules: "your turn" (`turn`; `matchStart` for the
 * first push of a new match, #631), or "game over" (the match is over).
 */
export type PushKind = 'turn' | 'matchStart' | 'matchEnd';

/** What the server waits for: a side, in one game of the match. */
export interface TurnWait {
  /** The side to move or to answer, or `null` (no game yet, or the match is over). */
  readonly side: PlayerId | null;
  /** Which game of the match: the number of games already finished. */
  readonly game: number;
  /** The match is over. */
  readonly over: boolean;
}

/** What the server waits for before a new match: nobody, and the match runs. */
export const NEW_MATCH_WAIT: TurnWait = { side: null, game: 0, over: false };

/**
 * True when `before` is the wait before a new match (`NEW_MATCH_WAIT`):
 * the save started the match, so its push is `matchStart` (#631).
 */
export function isNewMatch(before: TurnWait): boolean {
  return before.side === null && before.game === 0 && !before.over;
}

/** What the server waits for in `flow`. */
export function turnWait(flow: MatchFlow): TurnWait {
  return {
    side: waitingFor(flow),
    game: flow.match.games.length,
    over: flow.match.status === 'finished',
  };
}

/**
 * The side to tell "your turn" after a save, or `null` for no push.
 *
 * `before` is what the server waited for before the save (for a new game:
 * nobody), `after` what it waits for now (`waitingFor`: the side to move,
 * or the side that must answer a question). `caller` is the side of the
 * player who caused the save, or `null` for the server (a time out).
 *
 * A push goes out for every online game (there is no longer a live/async
 * split, #183), never to the caller (they are in the app), and only when the
 * wait moved to the other side, or a new game of the match started: a time
 * out ends a game, and the next one may wait for the same side again. When
 * the same side plays again in the same game (an Asodio extra roll), or the
 * match is over, there is no push.
 */
export function turnPushSide(
  before: TurnWait,
  after: TurnWait,
  caller: PlayerId | null,
): PlayerId | null {
  if (after.over || after.side === null || after.side === caller) return null;
  if (after.side === before.side && after.game === before.game) return null;
  return after.side;
}

/**
 * The sides to tell "game over" after a save (#316), or none.
 *
 * Only the save that ends the match pushes (`after.over`, and not
 * `before.over`), for every online game (#183). The caller never gets one:
 * they made the winning move or resigned, so they see the result. After a
 * time out (`caller` is `null`: the server) both players get one.
 *
 * It never overlaps `turnPushSide`: that one never pushes when the match
 * is over, and this one only then. A game that ends while the match goes
 * on starts the next game: that is a "your turn" push, not this one. So
 * one save sends one kind of push.
 */
export function matchEndPushSides(
  before: TurnWait,
  after: TurnWait,
  caller: PlayerId | null,
): PlayerId[] {
  if (before.over || !after.over) return [];
  return PLAYERS.filter((side) => side !== caller);
}

/**
 * The seconds the push service may keep a "your turn" push: the time left
 * until the turn deadline, rounded down. After the deadline the turn is
 * lost anyway, so a late "your turn" would be wrong. `null` when no full
 * second is left, or the game has no deadline: then send nothing.
 */
export function turnPushTtl(turnDeadline: number | null, now: number): number | null {
  if (turnDeadline === null) return null;
  const seconds = Math.floor((turnDeadline - now) / 1000);
  return seconds >= 1 ? seconds : null;
}

/**
 * What a game push names (#631): the other player as the receiver sees
 * them (`nameSeenBy`: `null` when the receiver blocks them, or there is
 * no name), and whether the game is ranked.
 */
export interface GamePushAbout {
  readonly name: PlayerName | null;
  readonly ranked: boolean;
}

/** A game push that names nobody, in a friend game. */
export const NOBODY: GamePushAbout = { name: null, ranked: false };

/**
 * One "your turn" message per phone, in its language, with `high`
 * priority (the phone shows it at once) and `ttlSeconds` from
 * `turnPushTtl`. `textKind` is `turn`, or `matchStart` / `rankedStart` for
 * the first push of a new match.
 */
export function turnMessages(
  targets: readonly PushTarget[],
  gameId: string,
  ttlSeconds: number,
  name: PlayerName | null = null,
  textKind: 'turn' | 'matchStart' | 'rankedStart' = 'turn',
): PushMessage[] {
  return targets.map(({ token, locale }) => ({
    to: token,
    ...pushText(textKind, locale, name),
    data: { gameId },
    priority: 'high',
    ttlSeconds,
  }));
}

/**
 * How long the push service keeps a "game over" push, in seconds: one
 * day. The result does not go stale like a turn, but a note from days
 * ago is no use: the player has opened the app by then.
 */
export const MATCH_END_PUSH_TTL_SECONDS = 24 * 60 * 60;

/**
 * One "game over" message per token, with `normal` priority (nothing
 * waits for the player, so the phone may hold it to save power) and a
 * time to live of `MATCH_END_PUSH_TTL_SECONDS`.
 */
export function matchEndMessages(
  targets: readonly PushTarget[],
  gameId: string,
  name: PlayerName | null = null,
): PushMessage[] {
  return targets.map(({ token, locale }) => ({
    to: token,
    ...pushText('matchEnd', locale, name),
    data: { gameId },
    priority: 'normal',
    ttlSeconds: MATCH_END_PUSH_TTL_SECONDS,
  }));
}

/**
 * The messages of a push of `kind` to `targets`, sent at `now`, naming
 * `about.name`. A turn push lives until `turnDeadline` (`turnPushTtl`):
 * with no time left it is no messages, so nothing is sent. A match start
 * says "Match found" in a ranked game.
 */
export function pushMessages(
  kind: PushKind,
  targets: readonly PushTarget[],
  gameId: string,
  turnDeadline: number | null,
  now: number,
  about: GamePushAbout = NOBODY,
): PushMessage[] {
  if (kind === 'matchEnd') return matchEndMessages(targets, gameId, about.name);
  const ttl = turnPushTtl(turnDeadline, now);
  if (ttl === null) return [];
  const textKind = kind === 'turn' ? 'turn' : about.ranked ? 'rankedStart' : 'matchStart';
  return turnMessages(targets, gameId, ttl, about.name, textKind);
}

/**
 * Whether a push of `kind`, scheduled by the save of `version`, should
 * still go out to `game` (the game as saved now, or `null` when it is
 * gone). The game must still be at `version`:
 *
 * - a turn push needs the match to run: once the player has played (a
 *   new version) or the match is over, "your turn" would be late;
 * - a "game over" push needs the match to be over. No save changes a
 *   finished match, so its version stays: the retry still goes out.
 */
export function pushStillDue(
  kind: PushKind,
  game: { readonly version: number; readonly status: OnlineGameStatus } | null,
  version: number,
): boolean {
  if (game === null || game.version !== version) return false;
  return game.status === (kind === 'matchEnd' ? 'finished' : 'active');
}

/** The tokens whose result failed with one of `codes`. */
function tokensFailedWith(
  messages: readonly PushMessage[],
  results: readonly PushResult[],
  codes: ReadonlySet<PushErrorCode>,
): string[] {
  return messages
    .filter((_, i) => {
      const result = results[i];
      return result !== undefined && !result.ok && codes.has(result.error);
    })
    .map((message) => message.to);
}

const DEAD_ERRORS: ReadonlySet<PushErrorCode> = new Set(['DeviceNotRegistered']);

/** The tokens the push service called dead (`DeviceNotRegistered`). */
export function deadTokens(
  messages: readonly PushMessage[],
  results: readonly PushResult[],
): string[] {
  return tokensFailedWith(messages, results, DEAD_ERRORS);
}

/** How long a failed push waits before its one retry. */
export const PUSH_RETRY_MS = 30_000;

/** How many times a failed push is sent again. */
export const MAX_PUSH_RETRIES = 1;

/** The errors worth one more try: the push service or the network was busy. */
const RETRY_ERRORS: ReadonlySet<PushErrorCode> = new Set(['Failed', 'MessageRateExceeded']);

/** The tokens to send again later (`Failed` or `MessageRateExceeded`). */
export function retryTokens(
  messages: readonly PushMessage[],
  results: readonly PushResult[],
): string[] {
  return tokensFailedWith(messages, results, RETRY_ERRORS);
}

/**
 * The rows to drop so that at most `MAX_PUSH_TOKENS_PER_PLAYER` remain:
 * the oldest ones. `rows` are a player's tokens, oldest first. The row of
 * `keep` (the token just registered) is never dropped, even when it is not
 * the newest: two rows can have the same `updatedAt`, and the server clock
 * of another call can be ahead.
 */
export function tokensOverCap<T extends { readonly token: string }>(
  rows: readonly T[],
  keep: string,
): T[] {
  const over = rows.length - MAX_PUSH_TOKENS_PER_PLAYER;
  if (over <= 0) return [];
  return rows.filter((row) => row.token !== keep).slice(0, over);
}

/** A friend invite push (#406) in English with no name. */
export const FRIEND_INVITE_PUSH_TEXT = pushText('friendInvite', 'en', null);

/**
 * One friend invite message per phone, in its language, naming the
 * inviter (#631), with `high` priority and a time to live up to the
 * invite's end (`turnPushTtl` on `expiresAt`). The data holds only the
 * invite code, so a tap opens the invite. No time left: no messages.
 */
export function friendInviteMessages(
  targets: readonly PushTarget[],
  inviteCode: string,
  expiresAt: number,
  now: number,
  name: PlayerName | null = null,
): PushMessage[] {
  const ttlSeconds = turnPushTtl(expiresAt, now);
  if (ttlSeconds === null) return [];
  return targets.map(({ token, locale }) => ({
    to: token,
    ...pushText('friendInvite', locale, name),
    data: { inviteCode },
    priority: 'high',
    ttlSeconds,
  }));
}

/** The friend pushes (#631): a friend request, and a request accepted. */
export type FriendPushKind = 'friendRequest' | 'friendAccepted';

/**
 * How long the push service keeps a friend push, in seconds: one day,
 * like "game over". Nothing waits on it.
 */
export const FRIEND_PUSH_TTL_SECONDS = 24 * 60 * 60;

/**
 * One friend push per phone, in its language, naming the other player,
 * with `normal` priority and a time to live of one day. A tap opens
 * Friends (`data.screen`).
 */
export function friendMessages(
  kind: FriendPushKind,
  targets: readonly PushTarget[],
  name: PlayerName | null,
): PushMessage[] {
  return targets.map(({ token, locale }) => ({
    to: token,
    ...pushText(kind, locale, name),
    data: { screen: 'friends' },
    priority: 'normal',
    ttlSeconds: FRIEND_PUSH_TTL_SECONDS,
  }));
}

/**
 * An online game server in memory (#251). It runs the same game logic and
 * the same call checks as the Convex functions (`apps/server/convex/
 * games.ts` and `invites.ts`), with no network and no account. It gives a
 * `GameTransport` and an `Invites` per player, so the app and its tests
 * can play online games before the Convex project exists.
 *
 * It acts like a network:
 * - `subscribe` calls `onView` on a later microtask, never inside the call.
 * - `listMyGames` (#296) lists the caller's games with `summarizeGame`,
 *   like the Convex `listMyGames`. `watchMyGames` (#297) sends that list
 *   again after each change to one of the caller's games, only when the
 *   list changed (like a Convex query watch). `watchMyInvites` (#314)
 *   does the same for the caller's open invites.
 * - `setDraft` (#374) keeps the mover's turn so far (`checkDraft`, like
 *   the Convex `setDraft`) and sends both players the view again at the
 *   same version. It never moves the version, starts a timer or sends a
 *   push. Every save drops the draft.
 * - Every view, request and event is a copy (a JSON round trip), so a
 *   client cannot change the server state, and the server cannot change a
 *   view a client holds.
 * - A rejected call rejects with plain `GameTransportErrorData` (an
 *   invite call with plain `InviteErrorData`).
 *
 * - `onlineDataFor(playerId).deleteMyData()` (#315) acts like the Convex
 *   `deleteMyAccount` (#302): it resigns the player's active matches,
 *   deletes the invites they sent, and marks the id deleted. A deleted
 *   id then gets `NOT_SIGNED_IN` where Convex checks that the account
 *   exists (`existingPlayer`): make, accept or decline an invite, and
 *   delete again.
 * - Guest names (#400): like the Convex server, a player gets a guest
 *   number when they first make an invite or start a game, and keeps it.
 *   Views, lists and invites carry the names; a deleted player has none.
 * - Usernames (#405): `usernamesFor(playerId, saved)` picks and changes
 *   them with `planUsername`, like the Convex `setMyUsername`; a username
 *   wins over the guest name. A view sent before a change keeps the old
 *   name until the next view.
 *   The numbers come from their own RNG (`nameRng`), so they never change
 *   the dice of a seeded `rng`.
 * - Block and report (#320): `safetyFor(playerId)` runs the same checks
 *   as the Convex `safety.ts` (`@tavli/online` `safety.ts`). A blocker's
 *   views, lists and invites show `null` for the blocked player's name,
 *   a blocked player sees the blocker's open invites as expired, and
 *   `acceptInvite` refuses between the two (`checkNotBlocked`). `reportsOf()`
 *   shows the reports, like the Convex dashboard.
 * - Friends (#406): `friendsFor(playerId)` runs the same checks as the
 *   Convex `friends.ts` (`@tavli/online` `friends.ts`). The server keeps
 *   no accounts, so `markSaved(playerId)` says which players saved theirs
 *   (only they may have friends). A friend invite is an invite with `to`:
 *   only that friend reads and answers it. A block ends the friendship.
 *   The tokens come from their own RNG (`tokenRng`).
 * - Play ranked (#531): `matchmakingFor(playerId)` runs the same rules as
 *   the Convex `matchmaking.ts` (`@tavli/online` `matchmaking.ts`). A
 *   seek matches at once when it can; `runMatching()` is the scheduled
 *   matching job (the ranges grow with `now`) and ends old seeks. A match
 *   starts a ranked game through `createGame`, like `insertGame`.
 *
 * Time comes from the `now` option. Nothing runs on a timer: call
 * `runDueTimeouts()` to apply the time outs whose deadline has passed (the
 * in-memory version of the Convex `checkTimeout`). Like on Convex, an
 * open invite counts as expired once `now()` reaches its `expiresAt`;
 * `runDueTimeouts()` also marks it `expired` and tells its watchers (the
 * in-memory version of the Convex `expireInvite`).
 */

import {
  MAX_BLOCKS,
  MAX_RECENT_PLAYERS,
  RANKED_GAMES,
  RANKED_TARGET_POINTS,
  RANKED_TURN_TIME_MINUTES,
  normalizeFriendToken,
  normalizeInviteCode,
} from '@tavli/contracts';
import type {
  FoundPlayer,
  Friends,
  FriendsErrorData,
  FriendStatus,
  GameSummary,
  GameTransport,
  GuestMoveCounts,
  GameTransportErrorData,
  InviteErrorData,
  InviteView,
  Invites,
  Matchmaking,
  MatchmakingErrorData,
  MySeek,
  OnlineData,
  OnlineGameChoice,
  OnlineGameStatus,
  OnlineGameView,
  MyRating,
  PlayerName,
  Ratings,
  RatingsErrorData,
  RankedGame,
  ReportReason,
  Safety,
  SafetyErrorData,
  UsernameErrorCode,
  UsernameErrorData,
  Usernames,
} from '@tavli/contracts';
import { createSeededRng } from '@tavli/engine';
import type { FlowEvent, MatchFlow, PerPlayer, PlayerId, Rng } from '@tavli/engine';

import {
  SERVER_ACTOR,
  TIMED_OUT_ERROR,
  callTimedOut,
  checkCall,
  checkNewGame,
  checkRankedGame,
  checkTurnTimeMinutes,
  checkViewer,
  eventActor,
  matchStatus,
  nextDeadline,
  nextDraft,
  rollCallVersion,
  rollDeadline,
  scheduledCheck,
} from './calls';
import type { SavedGame } from './calls';
import {
  FriendsError,
  checkFriendTarget,
  checkFriends,
  checkOpenRequest,
  checkSaved,
  checkSearchCap,
  friendStatusOf,
  pickFriendTokenNow,
  planRequest,
  recentOpponents,
  recordOf,
  searchWindowStart,
} from './friends';
import type { FriendRequestRecord, RequestRoute } from './friends';
import {
  NEW_RATING,
  RatingsError,
  afterRatedMatch,
  checkRatingsSaved,
  friendsBoardRows,
  globalBoardRows,
  isBoardable,
  pairOf,
  planRatedMatch,
  shownRating,
} from './ratings';
import type { BoardPlayer, PairCount, RatingRecord } from './ratings';
import {
  MatchmakingError,
  checkRankedChoice,
  checkSeekSaved,
  countLooking,
  isMatchedSeekDone,
  isSeekExpired,
  matchedPlayers,
  matchedSeek,
  mayPair,
  pickPairs,
  planSeek,
  waitingSeek,
} from './matchmaking';
import type { SeekRecord } from './matchmaking';
import {
  InviteError,
  checkAddressee,
  checkAnswer,
  checkCancel,
  checkInviteCap,
  checkNotBlocked,
  inviteSeenBy,
  inviteVisibleTo,
  countOpenInvites,
  isInviteExpired,
  newInvite,
  pickInviteCodeNow,
  toInviteView,
} from './invites';
import type { InviteRecord } from './invites';
import {
  OnlineGameError,
  answerPrompt,
  createOnlineMatch,
  loadFlow,
  loadStored,
  playTurn,
  resign,
  rollDice,
  storeFlow,
  storeStep,
  timeOut,
  sideOf,
  toView,
} from './online-game';
import type { LoadedFlow, SavedDraft, SteppedFlow } from './online-game';
import { nameFrom, namesOf, pickGuestNumber } from './names';
import type { NameRecord } from './names';
import { myUsernameOf, planUsername, usernameKey } from './usernames';
import type { UsernameRecord } from './usernames';
import {
  SafetyError,
  checkBlockCap,
  checkMet,
  checkReason,
  checkReportCap,
  checkTarget,
  namesSeenBy,
  reportWindowStart,
} from './safety';
import { latestGames, summarizeGame } from './summaries';
import {
  guestGameMove,
  renamePlayerInEvent,
  renamePlayerInFlow,
  renamePlayers,
} from './guest-move';

export interface MemoryGameServerOptions {
  /** The dice. Tests pass a seeded RNG; a dev game may pass any `Rng`. */
  readonly rng: Rng;
  /** The server clock, in epoch milliseconds. */
  readonly now: () => number;
  /**
   * The guest numbers (#400). Default: a seeded RNG of its own, so the
   * dice of `rng` stay the same with or without names.
   */
  readonly nameRng?: Rng;
  /** The friend link tokens (#406). Default: a seeded RNG of its own, like `nameRng`. */
  readonly tokenRng?: Rng;
}

/** One event of a game's log, like a row of the Convex `moves` table. */
export interface LoggedEvent {
  /** 0 for the `start` event, then +1 per event. */
  readonly seq: number;
  /** The game version the event led to. */
  readonly version: number;
  /** The player id who acted (a roll too, #355), or `SERVER_ACTOR` (opening dice, time outs, the next game). */
  readonly actor: string;
  readonly event: FlowEvent;
}

/** One report (#320), like a row of the Convex `reports` table. */
export interface MemoryReport {
  readonly reporterId: string;
  readonly reportedId: string;
  readonly reason: ReportReason;
  /** The reported player's username at that moment, if they had one. */
  readonly username: string | null;
  readonly createdAt: number;
}

export interface MemoryGameServer {
  /**
   * Creates a game between `players`, like the Convex `createGame`: it
   * waits for each player's opening die (#379), and the opening's clock
   * runs. `options.ranked` makes a Play ranked game (#529, default
   * false); it needs `RANKED_TURN_TIME_MINUTES`.
   * Returns the game id. Throws an `OnlineGameError` (`BAD_REQUEST`,
   * `ILLEGAL_ACTION`) for bad arguments.
   */
  createGame(
    callerId: string,
    players: PerPlayer<string>,
    choice: OnlineGameChoice,
    targetPoints: number,
    turnTimeMinutes: number | null,
    options?: { readonly ranked?: boolean },
  ): string;
  /**
   * The transport of `playerId`: every call it makes comes from that
   * player, as if they were signed in (the Convex adapter gets the id from
   * the sign-in token). Only the two players may subscribe to a game.
   */
  transportFor(playerId: string): GameTransport;
  /**
   * Makes an open invite from `callerId`, like the Convex `createInvite`:
   * it expires `INVITE_TIME_MS` after `now()`. The code comes from the
   * server's `rng`. Returns the code. Throws an `InviteError`:
   * `TOO_MANY_INVITES` when `callerId` already has `MAX_OPEN_INVITES`
   * open invites at `now()`, `BAD_REQUEST` for a bad match length.
   */
  createInvite(
    callerId: string,
    choice: OnlineGameChoice,
    targetPoints: number,
    turnTimeMinutes: number | null,
  ): string;
  /**
   * The inviter takes back an open invite, like the Convex `cancelInvite`.
   * Throws an `InviteError` (`INVITE_NOT_FOUND`, `INVITE_EXPIRED`,
   * `INVITE_CLOSED`, `NOT_YOUR_INVITE`, `BAD_REQUEST`).
   */
  cancelInvite(callerId: string, code: string): void;
  /**
   * The invites of `playerId`: every call comes from that player, as with
   * `transportFor`. `acceptInvite` starts the game as the Convex
   * `acceptInvite` does (the inviter plays white). `watchInvite` sends a
   * view on a later microtask after each change.
   */
  invitesFor(playerId: string): Invites;
  /**
   * Delete my online data (#315) for `playerId`, as if they were signed
   * in. See the top of this file.
   */
  onlineDataFor(playerId: string): OnlineData;
  /** The invite as a client sees it at `now()` (a copy), or `null` when no invite has the code. */
  getInvite(code: string): InviteView | null;
  /** The game as a client sees it (a copy), or `null` when there is no such game. */
  getGame(gameId: string): OnlineGameView | null;
  /**
   * Usernames (#405) for `playerId` (`null`: nobody signed in), as if
   * they were signed in. `saved` says whether the account has a sign-in
   * key: the in-memory server keeps no accounts, so the caller says.
   */
  usernamesFor(playerId: string | null, saved: boolean): Usernames;
  /**
   * Block and report (#320) as `playerId` (`null`: nobody signed in), as
   * if they were signed in.
   */
  safetyFor(playerId: string | null): Safety;
  /**
   * Friends (#406) as `playerId` (`null`: nobody signed in), as if they
   * were signed in. Only players marked with `markSaved` may have friends.
   */
  friendsFor(playerId: string | null): Friends;
  /**
   * Ratings (#407) as `playerId` (`null`: nobody signed in), as if they
   * were signed in. Only players marked with `markSaved` have a rating,
   * and a match counts only when both players are saved when it ends.
   */
  ratingsFor(playerId: string | null): Ratings;
  /**
   * Play ranked matching (#531) as `playerId` (`null`: nobody signed in),
   * as if they were signed in. Only players marked with `markSaved` may
   * seek.
   */
  matchmakingFor(playerId: string | null): Matchmaking;
  /**
   * The matching job at `now()`, like the scheduled Convex `matchTick`:
   * ends the seeks whose time is up, forgets matched seeks after
   * `MATCHED_SEEK_KEEP_MS`, and matches every ranked game with the
   * ranges of `now()`. Nothing runs on a timer: move `now` and call it.
   */
  runMatching(): Promise<void>;
  /** Tests only: sets the rating of `playerId`, like a Convex test that writes a `ratings` row. */
  setRatingForTest(playerId: string, rating: number): void;
  /**
   * `playerId` has a saved account (a sign-in key). The in-memory server
   * keeps no accounts, so the caller says. A player stays saved.
   */
  markSaved(playerId: string): void;
  /** Every report kept, oldest first (copies). The owner's view, for tests. */
  reportsOf(): MemoryReport[];
  /** The owner deletes a report after the review, like a row deleted in the dashboard. For tests. */
  deleteReport(reporterId: string, reportedId: string): void;
  /**
   * What a guest move (#403) would take from `playerId`: active games and
   * open invites at `now()`, like the Convex `guestMoveCounts`.
   */
  guestMoveCounts(playerId: string): GuestMoveCounts;
  /**
   * Moves guest `source` into account `target` (#403), like the Convex
   * guest move: games, invites, answers, blocks and reports become
   * `target`'s, a game in progress between the two ends with `source`
   * resigning, and `source` is deleted. The caller checked that `source`
   * is a guest and `target` a saved account.
   */
  moveGuest(source: string, target: string): void;
  /** The player's name (#400, #405): the username, else the guest name, else `null`. For tests. */
  nameOf(playerId: string): PlayerName | null;
  /** The event log of the game, oldest first (copies). `replay` rebuilds the game from it. */
  events(gameId: string): LoggedEvent[];
  /**
   * Applies every time out whose deadline has passed at `now()`. Like the
   * Convex scheduler, it runs each check at its deadline: a game that
   * waited two turn times loses two games. Returns how many time outs it
   * applied.
   *
   * It also marks each open invite whose time is up `expired`, and sends
   * the new view to its watchers (not counted in the result).
   */
  runDueTimeouts(): number;
  /**
   * Tests only: replaces the stored flow of a game, like a Convex test
   * that patches `games.flow`. The version, the deadline and the log stay
   * as they are, no `previousGame` is kept, and no view is sent. Call it
   * before anyone subscribes.
   */
  setFlowForTest(gameId: string, flow: MatchFlow): void;
}

interface MemoryGame extends SavedGame {
  readonly gameId: string;
  readonly choice: OnlineGameChoice;
  readonly turnTimeMinutes: number | null;
  /** A Play ranked game (#529). */
  readonly ranked: boolean;
  readonly targetPoints: number;
  /** `storeFlow` text. */
  readonly flow: string;
  /** `JSON.stringify(LoggedEvent)` per event. */
  readonly events: readonly string[];
  /** The last saved change, epoch ms (server clock). */
  readonly updatedAt: number;
}

interface Listener {
  readonly gameId: string;
  /** The player who watches: the view hides the names they block (#320). */
  readonly playerId: string;
  readonly onView: (view: OnlineGameView) => void;
  active: boolean;
}

interface ListListener {
  readonly playerId: string;
  readonly status: OnlineGameStatus;
  readonly onList: (games: readonly GameSummary[]) => void;
  /** The JSON of the last list sent, so an unchanged list is not sent again. */
  last: string | null;
  active: boolean;
}

interface InviteListener {
  /** The normalized code, or `null` for text that is not a code. */
  readonly code: string | null;
  /** The player who watches: the view hides the name they block (#320). */
  readonly playerId: string;
  readonly onView: (view: InviteView | null) => void;
  active: boolean;
}

interface InviteListListener {
  readonly playerId: string;
  readonly onList: (invites: readonly InviteView[]) => void;
  /** The JSON of the last list sent, so an unchanged list is not sent again. */
  last: string | null;
  active: boolean;
}

/** A seek (#531), like a row of the Convex `seeks` table. */
interface MemorySeek extends SeekRecord {
  readonly status: 'waiting' | 'matched';
  /** The game of a matched seek. */
  readonly gameId: string | null;
  /** When it matched, epoch ms. */
  readonly matchedAt: number | null;
}

/** A watch of a player's seek (#531). */
interface SeekListener {
  readonly playerId: string;
  readonly onUpdate: (seek: MySeek) => void;
  /** The JSON of the last seek sent, so an unchanged one is not sent again. */
  last: string | null;
  active: boolean;
}

function copy<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** Runs `task` on a later microtask, like a reply from the network. */
function later(task: () => void): void {
  void Promise.resolve().then(task);
}

/** Waits one microtask, so a call never changes the server inside the caller's own code. */
function nextTick(): Promise<void> {
  return Promise.resolve();
}

/** A rejected username call (#405): plain `UsernameErrorData`. */
function usernameError(code: UsernameErrorCode, message: string): UsernameErrorData {
  return { code, message };
}

/** Runs `step` on a later microtask; resolves with a copy of its result, or rejects with what it threw. */
async function settled<T>(step: () => T): Promise<T> {
  await nextTick();
  return copy(step());
}

/**
 * An `OnlineGameError` becomes plain `GameTransportErrorData`, an
 * `InviteError` plain `InviteErrorData`; anything else is a bug.
 */
function toErrorData(error: unknown): unknown {
  if (error instanceof OnlineGameError) {
    const data: GameTransportErrorData = { code: error.code, message: error.message };
    return data;
  }
  if (error instanceof InviteError) {
    const data: InviteErrorData = { code: error.code, message: error.message };
    return data;
  }
  if (error instanceof SafetyError) {
    const data: SafetyErrorData = { code: error.code, message: error.message };
    return data;
  }
  if (error instanceof FriendsError) {
    const data: FriendsErrorData = { code: error.code, message: error.message };
    return data;
  }
  if (error instanceof RatingsError) {
    const data: RatingsErrorData = { code: error.code, message: error.message };
    return data;
  }
  if (error instanceof MatchmakingError) {
    const data: MatchmakingErrorData = { code: error.code, message: error.message };
    return data;
  }
  return error;
}

export function createMemoryGameServer(options: MemoryGameServerOptions): MemoryGameServer {
  const { rng, now } = options;
  const nameRng = options.nameRng ?? createSeededRng(400);
  const games = new Map<string, MemoryGame>();
  const listeners = new Set<Listener>();
  const listListeners = new Set<ListListener>();
  /** By code (capital letters). Kept in the order they were made. */
  const invites = new Map<string, InviteRecord>();
  const inviteListeners = new Set<InviteListener>();
  const inviteListListeners = new Set<InviteListListener>();
  /** The draft of each game (#374), as `SavedDraft` JSON, like the Convex `drafts` table. */
  const drafts = new Map<string, string>();
  /** Player ids whose data was deleted (#315), like a Better Auth user that is gone. */
  const deletedPlayers = new Set<string>();
  /** The name of each player (#400, #405), like the Convex `playerNames` table. */
  const nameRecords = new Map<string, NameRecord & UsernameRecord>();
  /** Who answered each invite (#320), by code, like the Convex `answeredBy`. */
  const answeredBy = new Map<string, string>();
  /** Blocks (#320): blocker → (blocked → when), like the Convex `blocks` table. */
  const blocks = new Map<string, Map<string, number>>();
  /** Reports (#320), oldest first, like the Convex `reports` table. */
  let reports: MemoryReport[] = [];
  const tokenRng = options.tokenRng ?? createSeededRng(406);
  /** Players with a saved account (#406), like a Better Auth user that is not anonymous. */
  const savedPlayers = new Set<string>();
  /** Friends (#406), both ways: player → (friend → since), like the Convex `friends` table. */
  const friendEdges = new Map<string, Map<string, number>>();
  /** Friend requests (#406) by `requestKey(from, to)`, like the Convex `friendRequests` table. */
  const friendRequests = new Map<string, FriendRequestRecord>();
  /** Friend link tokens (#406): token → owner, and owner → token. */
  const friendTokens = new Map<string, string>();
  const tokenOf = new Map<string, string>();
  /** Username searches (#406): player → times, like the Convex `friendSearches` table. */
  const searches = new Map<string, number[]>();
  /** Ratings (#407), like the Convex `ratings` table. No row: `NEW_RATING`, shown. */
  const ratings = new Map<string, RatingRecord & { readonly shown: boolean }>();
  /** Rated matches per pair and UTC day (#407), by `pairOf` joined with a newline, like `ratedPairs`. */
  const ratedPairs = new Map<string, PairCount>();
  /** Seeks (#531), one per player, like the Convex `seeks` table. */
  const seeks = new Map<string, MemorySeek>();
  const seekListeners = new Set<SeekListener>();
  let nextId = 1;

  function ratingOf(playerId: string): RatingRecord & { readonly shown: boolean } {
    return ratings.get(playerId) ?? { ...NEW_RATING, shown: true };
  }

  /**
   * A match just ended with `winner` (#407): rate it when both players are
   * saved and the pair is under its daily count, like the Convex `rateMatch`.
   */
  function rateMatch(players: PerPlayer<string>, winner: PlayerId, length: number, at: number) {
    const winnerId = players[winner];
    const loserId = winner === 'white' ? players.black : players.white;
    const key = pairOf(winnerId, loserId).join('\n');
    const plan = planRatedMatch({
      saved: isSaved(winnerId) && isSaved(loserId),
      pair: ratedPairs.get(key) ?? null,
      now: at,
    });
    if (!plan.rated) return;
    ratedPairs.set(key, plan.pair);
    const won = ratingOf(winnerId);
    const lost = ratingOf(loserId);
    const next = afterRatedMatch(won, lost, length);
    ratings.set(winnerId, { ...next.winner, shown: won.shown });
    ratings.set(loserId, { ...next.loser, shown: lost.shown });
  }

  /** `viewerId` blocks `playerId`. */
  function blocksPlayer(viewerId: string | null, playerId: string): boolean {
    return viewerId !== null && (blocks.get(viewerId)?.has(playerId) ?? false);
  }

  function draftOf(gameId: string): SavedDraft | null {
    const text = drafts.get(gameId);
    return text === undefined ? null : (JSON.parse(text) as SavedDraft);
  }

  /** Gives `playerId` a guest number, once (#400), like the Convex `ensureGuestNumber`. */
  function ensureGuestNumber(playerId: string): void {
    const record = nameRecords.get(playerId);
    if (record?.guestNumber !== undefined) return;
    nameRecords.set(playerId, { ...record, guestNumber: pickGuestNumber(nameRng) });
  }

  function nameOf(playerId: string): PlayerName | null {
    return nameFrom(nameRecords.get(playerId) ?? null);
  }

  /** Usernames (#405), like the Convex `usernames.ts`: the same `planUsername`. */
  function usernamesFor(playerId: string | null, saved: boolean): Usernames {
    const caller = (): string => {
      if (playerId === null || deletedPlayers.has(playerId)) {
        throw usernameError('NOT_SIGNED_IN', 'sign in first');
      }
      return playerId;
    };
    return {
      mine: () =>
        settled(() => {
          const id = caller();
          return myUsernameOf(nameRecords.get(id) ?? null, saved, now());
        }),
      setMine: (request) =>
        settled(() => {
          const id = caller();
          const record = nameRecords.get(id) ?? null;
          const at = now();
          const plan = planUsername({ record, saved, request: copy(request), now: at });
          if (!plan.ok) throw usernameError(plan.code, plan.message);
          if (plan.key !== null) {
            for (const [other, held] of nameRecords) {
              if (other !== id && held.usernameKey === plan.key) {
                throw usernameError('TAKEN', 'another player has this name');
              }
            }
          }
          // Like `setMyUsername`: a player who sets a name before any game gets a number too.
          const next = { ...record, ...plan.patch };
          nameRecords.set(id, {
            ...next,
            guestNumber: next.guestNumber ?? pickGuestNumber(nameRng),
          });
          return myUsernameOf(nameRecords.get(id) ?? null, saved, at);
        }),
    };
  }

  /**
   * The view input of `game`, without its flow, as `viewerId` sees it
   * (`null`: no viewer, every name shows).
   */
  function gameInput(game: MemoryGame, viewerId: string | null) {
    const names = namesOf({
      white: nameRecords.get(game.players.white) ?? null,
      black: nameRecords.get(game.players.black) ?? null,
    });
    return {
      names: namesSeenBy(names, game.players, (id) => blocksPlayer(viewerId, id)),
      gameId: game.gameId,
      version: game.version,
      choice: game.choice,
      turnTimeMinutes: game.turnTimeMinutes,
      ranked: game.ranked,
      turnDeadline: game.turnDeadline,
      players: game.players,
    };
  }

  function viewOf(game: MemoryGame, viewerId: string | null): OnlineGameView {
    const { flow, previousGame, timeoutsInARow } = loadStored(game.flow);
    return toView({
      ...gameInput(game, viewerId),
      flow,
      previousGame,
      timeoutsInARow,
      draft: draftOf(game.gameId),
    });
  }

  /** The games of `playerId` with `status`, like the Convex `listMyGames`. */
  function myGames(playerId: string, status: OnlineGameStatus): GameSummary[] {
    const summaries: GameSummary[] = [];
    for (const game of games.values()) {
      if (game.status !== status || sideOf(game.players, playerId) === null) continue;
      summaries.push(
        summarizeGame(
          { ...gameInput(game, playerId), flow: loadFlow(game.flow), updatedAt: game.updatedAt },
          playerId,
        ),
      );
    }
    return latestGames(summaries);
  }

  /** Sends a view (JSON text) to `listener` on a later microtask, unless it stops first. */
  function send(listener: Listener, text: string): void {
    later(() => {
      if (listener.active) listener.onView(JSON.parse(text) as OnlineGameView);
    });
  }

  /** Sends the view of `game` as it is now to each listener of the game, not to the lists. */
  function notifyViews(game: MemoryGame): void {
    for (const listener of listeners) {
      if (listener.gameId === game.gameId) {
        send(listener, JSON.stringify(viewOf(game, listener.playerId)));
      }
    }
  }

  /** Sends the view of `game` as it is now to each listener of the game, and the new lists. */
  function notify(game: MemoryGame): void {
    notifyViews(game);
    notifyLists(game);
  }

  /**
   * Sends the list of `listener` as it is now on a later microtask, unless
   * it stops first or the list did not change since the last one sent.
   */
  function sendList(listener: ListListener): void {
    const text = JSON.stringify(myGames(listener.playerId, listener.status));
    later(() => {
      if (!listener.active || text === listener.last) return;
      listener.last = text;
      listener.onList(JSON.parse(text) as GameSummary[]);
    });
  }

  /** Sends the new list to each list watcher of a player of `game`. */
  function notifyLists(game: MemoryGame): void {
    for (const listener of listListeners) {
      if (sideOf(game.players, listener.playerId) !== null) sendList(listener);
    }
  }

  function logRows(firstSeq: number, version: number, callerId: string, flow: MatchFlow) {
    return flow.log.map((event, i) => {
      const row: LoggedEvent = {
        seq: firstSeq + i,
        version,
        actor: eventActor(event, callerId),
        event,
      };
      return JSON.stringify(row);
    });
  }

  /**
   * Saves the flow after a step: a version bump, its log rows and the turn
   * deadline (by default a new one). `before` is what the step loaded its
   * flow from. A step that ends the match rates it (#407), unless `rated`
   * is false (an account delete).
   */
  function save(
    game: MemoryGame,
    callerId: string,
    before: LoadedFlow,
    flow: SteppedFlow,
    at: number,
    turnDeadline: number | null = nextDeadline(game.turnTimeMinutes, flow, at),
    rated = true,
  ): void {
    const version = game.version + 1;
    const saved: MemoryGame = {
      ...game,
      flow: storeStep(before, flow),
      status: matchStatus(flow),
      version,
      turnDeadline,
      events: [...game.events, ...logRows(game.events.length, version, callerId, flow)],
      updatedAt: at,
    };
    games.set(game.gameId, saved);
    // A new step ends the draft (#374).
    drafts.delete(game.gameId);
    const winner = flow.match.winner;
    if (rated && game.status === 'active' && winner !== null) {
      rateMatch(game.players, winner, game.targetPoints, at);
    }
    notify(saved);
  }

  /**
   * The player the server waits for loses the current game. In a ranked
   * game, their second time out in a row loses the match (#529).
   */
  function applyTimeout(game: MemoryGame, at: number): void {
    const before = loadStored(game.flow);
    const { timeoutsInARow } = before;
    save(
      game,
      SERVER_ACTOR,
      before,
      timeOut(before.flow, rng, { ranked: game.ranked, timeoutsInARow }),
      at,
    );
  }

  /**
   * A player's call: the checks of `checkCall`, then (for a roll, a move
   * or an answer) the turn deadline, then `step`. Like the Convex `onTime`,
   * a late call saves the time out and gets `TIMED_OUT`. `deadline` gives
   * the turn deadline to save (default: a new one, `nextDeadline`).
   * `expectedVersion` may be a function of the saved flow (a roll,
   * `rollCallVersion`).
   */
  async function playerCall(
    callerId: string,
    gameId: string,
    expectedVersion: number | null | ((flow: MatchFlow) => number | null),
    timed: boolean,
    step: (flow: MatchFlow, side: PlayerId) => SteppedFlow,
    deadline?: (game: MemoryGame, side: PlayerId, flow: SteppedFlow, at: number) => number | null,
  ): Promise<void> {
    await nextTick();
    try {
      const saved = games.get(gameId) ?? null;
      const version =
        typeof expectedVersion === 'function'
          ? saved === null
            ? null
            : expectedVersion(loadFlow(saved.flow))
          : expectedVersion;
      const { game, side } = checkCall(saved, callerId, version);
      const at = now();
      if (timed && callTimedOut(game, at)) {
        applyTimeout(game, at);
        throw new OnlineGameError(TIMED_OUT_ERROR.code, TIMED_OUT_ERROR.message);
      }
      const before = loadStored(game.flow);
      const next = step(before.flow, side);
      const turnDeadline = deadline?.(game, side, next, at);
      save(game, callerId, before, next, at, turnDeadline);
    } catch (error) {
      throw toErrorData(error);
    }
  }

  function transportFor(playerId: string): GameTransport {
    return {
      subscribe(gameId, onView, onError) {
        const listener: Listener = { gameId, playerId, onView, active: true };
        const fail = (error: GameTransportErrorData) =>
          later(() => {
            if (listener.active) onError?.(error);
          });
        let game: MemoryGame | null;
        try {
          // Only the two players may watch (#131), like the Convex `getGame`.
          game = checkViewer(games.get(gameId) ?? null, playerId);
        } catch (error) {
          fail(toErrorData(error) as GameTransportErrorData);
          return () => {
            listener.active = false;
          };
        }
        if (game === null) {
          fail({ code: 'NOT_FOUND', message: 'no such game' });
        } else {
          listeners.add(listener);
          send(listener, JSON.stringify(viewOf(game, playerId)));
        }
        return () => {
          listener.active = false;
          listeners.delete(listener);
        };
      },
      rollDice(request) {
        const { gameId, expectedVersion } = copy(request);
        return playerCall(
          playerId,
          gameId,
          // Both may roll the opening at once (#379): no version check then.
          (flow) => rollCallVersion(flow, expectedVersion),
          true,
          (flow, side) => rollDice(flow, side, rng),
          // The roll is part of the turn: no new time, unless it passed.
          (game, side, flow, at) => rollDeadline(game, game.turnTimeMinutes, side, flow, at),
        );
      },
      sendTurn(request) {
        const { gameId, expectedVersion, moves } = copy(request);
        return playerCall(playerId, gameId, expectedVersion, true, (flow, side) =>
          playTurn(flow, side, moves, rng),
        );
      },
      async setDraft(request) {
        const { gameId, expectedVersion, moves } = copy(request);
        await nextTick();
        try {
          const { game, side } = checkCall(games.get(gameId) ?? null, playerId, expectedVersion);
          const flow = loadFlow(game.flow);
          const draft = nextDraft(game, flow, side, moves, draftOf(gameId), now());
          drafts.set(gameId, JSON.stringify(draft));
          // Only the game's watchers: a draft changes no list (#374).
          notifyViews(game);
        } catch (error) {
          throw toErrorData(error);
        }
      },
      sendAnswer(request) {
        const { gameId, expectedVersion, choice } = copy(request);
        return playerCall(playerId, gameId, expectedVersion, true, (flow, side) =>
          answerPrompt(flow, side, choice, rng),
        );
      },
      resign(gameId) {
        return playerCall(playerId, gameId, null, false, (flow, side) => resign(flow, side, rng));
      },
      async listMyGames(request) {
        const { status } = copy(request);
        await nextTick();
        return copy(myGames(playerId, status));
      },
      watchMyGames(request, onList) {
        const { status } = copy(request);
        const listener: ListListener = { playerId, status, onList, last: null, active: true };
        listListeners.add(listener);
        sendList(listener);
        return () => {
          listener.active = false;
          listListeners.delete(listener);
        };
      },
    };
  }

  function createGame(
    callerId: string,
    players: PerPlayer<string>,
    choice: OnlineGameChoice,
    targetPoints: number,
    turnTimeMinutes: number | null,
    options: { readonly ranked?: boolean } = {},
  ): string {
    const ranked = options.ranked === true;
    checkNewGame(callerId, players);
    checkTurnTimeMinutes(turnTimeMinutes);
    checkRankedGame(ranked, turnTimeMinutes);
    const flow = createOnlineMatch({ choice, targetPoints, players: copy(players) }, rng);
    ensureGuestNumber(players.white);
    ensureGuestNumber(players.black);
    const gameId = `game-${nextId}`;
    nextId += 1;
    const version = 1;
    const at = now();
    const game: MemoryGame = {
      gameId,
      players: copy(players),
      choice,
      turnTimeMinutes,
      ranked,
      targetPoints,
      flow: storeFlow(flow, null),
      status: matchStatus(flow),
      version,
      turnDeadline: nextDeadline(turnTimeMinutes, flow, at),
      events: logRows(0, version, callerId, flow),
      updatedAt: at,
    };
    games.set(gameId, game);
    notifyLists(game);
    return gameId;
  }

  /** The invite of `text` (any case). Rejects a malformed or unknown code, like the Convex `load`. */
  function loadInvite(text: string): InviteRecord {
    const code = normalizeInviteCode(text);
    if (code === null)
      throw new InviteError('BAD_REQUEST', 'an invite code has 8 letters and digits');
    const invite = invites.get(code);
    if (invite === undefined) throw new InviteError('INVITE_NOT_FOUND', 'no invite has this code');
    return invite;
  }

  /**
   * The view of the invite of `text` (any case) at `now()` as `viewerId`
   * sees it, or `null`, like the Convex `getInvite`.
   */
  function inviteView(text: string, viewerId: string | null): InviteView | null {
    const code = normalizeInviteCode(text);
    const invite = code === null ? undefined : invites.get(code);
    if (invite === undefined || !inviteVisibleTo(invite, viewerId)) return null;
    const fromName = blocksPlayer(viewerId, invite.from) ? null : nameOf(invite.from);
    const hidden = viewerId !== null && blocksPlayer(invite.from, viewerId);
    return inviteSeenBy(toInviteView(invite, now(), fromName), hidden);
  }

  /** Sends the view of `code` as it is now to `listener` on a later microtask, unless it stops first. */
  function sendInvite(listener: InviteListener): void {
    const text = JSON.stringify(
      listener.code === null ? null : inviteView(listener.code, listener.playerId),
    );
    later(() => {
      if (listener.active) listener.onView(JSON.parse(text) as InviteView | null);
    });
  }

  /**
   * Sends the open invites of `listener` as they are now on a later
   * microtask, unless it stops first or the list did not change since the
   * last one sent.
   */
  function sendInviteList(listener: InviteListListener): void {
    const text = JSON.stringify(openInvitesOf(listener.playerId));
    later(() => {
      if (!listener.active || text === listener.last) return;
      listener.last = text;
      listener.onList(JSON.parse(text) as InviteView[]);
    });
  }

  /**
   * Saves the invite and sends its new view to each watcher of its code,
   * and the inviter's new list to each watcher of that list.
   */
  function saveInvite(invite: InviteRecord): void {
    invites.set(invite.code, invite);
    for (const listener of inviteListeners) {
      if (listener.code === invite.code) sendInvite(listener);
    }
    for (const listener of inviteListListeners) {
      if (listener.playerId === invite.from) sendInviteList(listener);
    }
  }

  /** Like the Convex `existingPlayer`: a deleted player id is signed in to nothing. */
  function checkExists(playerId: string): void {
    if (deletedPlayers.has(playerId)) {
      throw new InviteError('NOT_SIGNED_IN', 'this account does not exist');
    }
  }

  function makeInvite(
    callerId: string,
    choice: OnlineGameChoice,
    targetPoints: number,
    turnTimeMinutes: number | null,
    to?: string,
  ): string {
    checkExists(callerId);
    // The cap first, like the Convex function (#275).
    checkInviteCap(countOpenInvites(invites.values(), callerId, now()));
    const options = {
      from: callerId,
      choice,
      targetPoints,
      turnTimeMinutes,
      ...(to === undefined ? {} : { to }),
    };
    // Check the arguments before a code is drawn, as the Convex function
    // throws before it saves anything.
    const invite = newInvite(options, '', now());
    const code = pickInviteCodeNow(rng, (taken) => invites.has(taken));
    ensureGuestNumber(callerId);
    saveInvite({ ...invite, code });
    return code;
  }

  function cancel(callerId: string, text: string): void {
    const invite = loadInvite(text);
    checkCancel(invite, callerId, now());
    saveInvite({ ...invite, status: 'cancelled' });
  }

  /** The open invites of `playerId` at `now()`, newest first, like the Convex `listMyInvites`. */
  function openInvitesOf(playerId: string): InviteView[] {
    const at = now();
    return [...invites.values()]
      .filter((invite) => invite.from === playerId && invite.status === 'open')
      .filter((invite) => !isInviteExpired(invite, at))
      .reverse()
      .map((invite) => toInviteView(invite, at, nameOf(invite.from)));
  }

  /** Runs `step` on a later microtask; errors reject as plain data. */
  async function inviteCall<T>(step: () => T): Promise<T> {
    await nextTick();
    try {
      return step();
    } catch (error) {
      throw toErrorData(error);
    }
  }

  function invitesFor(playerId: string): Invites {
    return {
      getInvite(text) {
        return inviteCall(() => inviteView(text, playerId));
      },
      acceptInvite(text) {
        return inviteCall(() => {
          checkExists(playerId);
          const invite = loadInvite(text);
          checkAddressee(invite, playerId);
          checkAnswer(invite, playerId, now());
          checkNotBlocked({
            byCaller: blocksPlayer(playerId, invite.from),
            byInviter: blocksPlayer(invite.from, playerId),
          });
          // If the game cannot start, the invite stays open (the Convex
          // transaction rolls back too).
          const gameId = createGame(
            playerId,
            { white: invite.from, black: playerId },
            invite.choice,
            invite.targetPoints,
            invite.turnTimeMinutes,
          );
          answeredBy.set(invite.code, playerId);
          saveInvite({ ...invite, status: 'accepted', gameId });
          return gameId;
        });
      },
      declineInvite(text) {
        return inviteCall(() => {
          checkExists(playerId);
          const invite = loadInvite(text);
          checkAddressee(invite, playerId);
          checkAnswer(invite, playerId, now());
          checkNotBlocked({ byCaller: false, byInviter: blocksPlayer(invite.from, playerId) });
          answeredBy.set(invite.code, playerId);
          saveInvite({ ...invite, status: 'declined' });
        });
      },
      createInvite(game) {
        const { choice, targetPoints, turnTimeMinutes } = copy(game);
        return inviteCall(() => makeInvite(playerId, choice, targetPoints, turnTimeMinutes));
      },
      cancelInvite(text) {
        return inviteCall(() => cancel(playerId, text));
      },
      listMyInvites() {
        return inviteCall(() => openInvitesOf(playerId));
      },
      watchMyInvites(onList) {
        const listener: InviteListListener = { playerId, onList, last: null, active: true };
        inviteListListeners.add(listener);
        sendInviteList(listener);
        return () => {
          listener.active = false;
          inviteListListeners.delete(listener);
        };
      },
      watchInvite(text, onView) {
        // Like the Convex `getInvite`, text that is not a code sends `null`.
        const listener: InviteListener = {
          code: normalizeInviteCode(text),
          playerId,
          onView,
          active: true,
        };
        inviteListeners.add(listener);
        sendInvite(listener);
        return () => {
          listener.active = false;
          inviteListeners.delete(listener);
        };
      },
    };
  }

  /**
   * Deletes the data of `playerId`, like the Convex `deleteMyAccount`
   * (#302) in one go: it resigns each active match (the other player
   * wins), keeps the finished ones, and deletes every invite the player
   * sent. Watchers of those invites get `null`.
   */
  async function deleteData(playerId: string): Promise<void> {
    await nextTick();
    if (deletedPlayers.has(playerId)) {
      const data: GameTransportErrorData = {
        code: 'NOT_SIGNED_IN',
        message: 'this account does not exist',
      };
      throw data;
    }
    const at = now();
    for (const game of [...games.values()]) {
      if (game.status !== 'active') continue;
      const side = sideOf(game.players, playerId);
      if (side === null) continue;
      const before = loadStored(game.flow);
      // A match that ends by an account delete never counts (#407).
      save(game, playerId, before, resign(before.flow, side, rng), at, undefined, false);
    }
    for (const invite of [...invites.values()]) {
      if (invite.from !== playerId && invite.to !== playerId) continue;
      invites.delete(invite.code);
      answeredBy.delete(invite.code);
      for (const listener of inviteListeners) {
        if (listener.code === invite.code) sendInvite(listener);
      }
    }
    for (const listener of inviteListListeners) {
      if (listener.playerId === playerId) sendInviteList(listener);
    }
    deletedPlayers.add(playerId);
    nameRecords.delete(playerId);
    // Blocks both ways and reports by and about the player (#320).
    blocks.delete(playerId);
    for (const blocked of blocks.values()) blocked.delete(playerId);
    reports = reports.filter(
      (report) => report.reporterId !== playerId && report.reportedId !== playerId,
    );
    // Friends, requests, the link and the searches (#406).
    endFriendship(playerId);
    const token = tokenOf.get(playerId);
    if (token !== undefined) friendTokens.delete(token);
    tokenOf.delete(playerId);
    searches.delete(playerId);
    // The rating and the pair counts (#407).
    ratings.delete(playerId);
    for (const key of [...ratedPairs.keys()]) {
      if (key.split('\n').includes(playerId)) ratedPairs.delete(key);
    }
    // The seek (#531), so no match can start with the player.
    if (seeks.delete(playerId)) notifySeeks();
  }

  /** The two players met (#320, `checkMet`): a game, or an invite one answered from the other. */
  function met(callerId: string, playerId: string): boolean {
    if (deletedPlayers.has(playerId)) return false;
    // A friend, or a request either way (#406).
    if (isFriend(callerId, playerId)) return true;
    if (friendRequests.has(requestKey(callerId, playerId))) return true;
    if (friendRequests.has(requestKey(playerId, callerId))) return true;
    for (const game of games.values()) {
      if (sideOf(game.players, callerId) !== null && sideOf(game.players, playerId) !== null) {
        return true;
      }
    }
    for (const invite of invites.values()) {
      const answerer = answeredBy.get(invite.code);
      if (
        (invite.from === callerId && answerer === playerId) ||
        (invite.from === playerId && answerer === callerId)
      ) {
        return true;
      }
    }
    return false;
  }

  /** Sends `playerId` their views, lists and invites again: a block changes the names they see. */
  function notifyViewer(playerId: string): void {
    for (const listener of listeners) {
      const game = games.get(listener.gameId);
      if (listener.playerId === playerId && game !== undefined) {
        send(listener, JSON.stringify(viewOf(game, playerId)));
      }
    }
    for (const listener of listListeners) {
      if (listener.playerId === playerId) sendList(listener);
    }
    for (const listener of inviteListeners) {
      if (listener.playerId === playerId) sendInvite(listener);
    }
  }

  /**
   * A block between the two changed: the blocker sees other names, and the
   * blocked player sees the blocker's open invites as expired (or open again).
   */
  function notifyBlock(blockerId: string, blockedId: string): void {
    notifyViewer(blockerId);
    for (const listener of inviteListeners) {
      if (listener.playerId === blockedId) sendInvite(listener);
    }
  }

  /** `callerId` blocks `playerId`, after the checks, like the Convex `blockPlayer`. */
  function block(callerId: string, playerId: string): void {
    const mine = blocks.get(callerId) ?? new Map<string, number>();
    if (mine.has(playerId)) return;
    checkBlockCap(mine.size);
    mine.set(playerId, now());
    blocks.set(callerId, mine);
    // A block ends the friendship and the requests between the two (#406).
    endFriendship(callerId, playerId);
    notifyBlock(callerId, playerId);
  }

  /** Block and report (#320), like the Convex `safety.ts`. */
  function safetyFor(playerId: string | null): Safety {
    const caller = (): string => {
      if (playerId === null) throw new SafetyError('NOT_SIGNED_IN', 'sign in first');
      return playerId;
    };
    /** Like the Convex `existingPlayer`: a deleted id may not block or report. */
    const existing = (): string => {
      const id = caller();
      if (deletedPlayers.has(id)) {
        throw new SafetyError('NOT_SIGNED_IN', 'this account does not exist');
      }
      return id;
    };
    const call = async <T>(step: () => T): Promise<T> => {
      await nextTick();
      try {
        const result = step();
        return result === undefined ? result : copy(result);
      } catch (error) {
        throw toErrorData(error);
      }
    };
    return {
      block: (other) =>
        call(() => {
          const id = existing();
          checkTarget(id, other);
          checkMet(met(id, other));
          block(id, other);
        }),
      unblock: (other) =>
        call(() => {
          const id = caller();
          if (blocks.get(id)?.delete(other) === true) notifyBlock(id, other);
        }),
      listBlocked: () =>
        call(() =>
          [...(blocks.get(caller()) ?? new Map<string, number>())]
            .map(([blocked, at]) => ({ playerId: blocked, name: nameOf(blocked), blockedAt: at }))
            .sort((a, b) => b.blockedAt - a.blockedAt),
        ),
      report: (request) =>
        call(() => {
          const id = existing();
          const { playerId: other } = request;
          const reason = checkReason(request.reason);
          checkTarget(id, other);
          checkMet(met(id, other));
          const kept = reports.some(
            (report) => report.reporterId === id && report.reportedId === other,
          );
          if (!kept) {
            const at = now();
            const since = reportWindowStart(at);
            checkReportCap(
              reports.filter((report) => report.reporterId === id && report.createdAt > since)
                .length,
            );
            reports.push({
              reporterId: id,
              reportedId: other,
              reason,
              username: nameRecords.get(other)?.username ?? null,
              createdAt: at,
            });
          }
          // A report also blocks; a full block list does not stop the report.
          if (!blocksPlayer(id, other) && (blocks.get(id)?.size ?? 0) < MAX_BLOCKS) {
            block(id, other);
          }
        }),
    };
  }

  /** The key of the request from `from` to `to` in `friendRequests`. */
  function requestKey(from: string, to: string): string {
    return `${from}\n${to}`;
  }

  function isFriend(a: string, b: string): boolean {
    return friendEdges.get(a)?.has(b) ?? false;
  }

  function friendCount(playerId: string): number {
    return friendEdges.get(playerId)?.size ?? 0;
  }

  /**
   * Ends the friendship of `a` and `b`, and deletes the requests between
   * them (#406). With no `b`: every friendship and request of `a`.
   */
  function endFriendship(a: string, b?: string): void {
    const others = b === undefined ? [...(friendEdges.get(a)?.keys() ?? [])] : [b];
    for (const other of others) {
      friendEdges.get(other)?.delete(a);
      friendEdges.get(a)?.delete(other);
    }
    for (const key of [...friendRequests.keys()]) {
      const [from = '', to = ''] = key.split('\n');
      if (
        b === undefined
          ? from === a || to === a
          : key === requestKey(a, b) || key === requestKey(b, a)
      ) {
        friendRequests.delete(key);
      }
    }
  }

  /** `playerId` has a saved account that exists. */
  function isSaved(playerId: string): boolean {
    return savedPlayers.has(playerId) && !deletedPlayers.has(playerId);
  }

  function statusBetween(callerId: string, playerId: string): FriendStatus {
    return friendStatusOf({
      self: callerId === playerId,
      friends: isFriend(callerId, playerId),
      mine: friendRequests.get(requestKey(callerId, playerId)) ?? null,
      theirs: friendRequests.get(requestKey(playerId, callerId)) ?? null,
    });
  }

  /** A block either way between the two. */
  function blockedEither(a: string, b: string): boolean {
    return blocksPlayer(a, b) || blocksPlayer(b, a);
  }

  /** The player with this username key, if saved, like the Convex `by_username_key` lookup. */
  function holderOfUsername(text: string): string | null {
    const key = usernameKey(text.trim());
    if (key === '') return null;
    for (const [playerId, record] of nameRecords) {
      if (record.usernameKey === key && isSaved(playerId)) return playerId;
    }
    return null;
  }

  /** The owner of the link with `text` (any case), if they exist. */
  function ownerOfToken(text: string): string | null {
    const token = normalizeFriendToken(text);
    const owner = token === null ? undefined : friendTokens.get(token);
    return owner === undefined || deletedPlayers.has(owner) ? null : owner;
  }

  /** What the caller may see of a player found by link or username: `null` with a block. */
  function found(callerId: string, playerId: string | null): FoundPlayer | null {
    if (playerId === null || blockedEither(callerId, playerId)) return null;
    return { name: nameOf(playerId), status: statusBetween(callerId, playerId) };
  }

  /** Counts one username search of `playerId` at `now()`, after the cap check. */
  function countSearch(playerId: string): void {
    const at = now();
    const since = searchWindowStart(at);
    const recent = (searches.get(playerId) ?? []).filter((time) => time > since);
    checkSearchCap(recent.length);
    searches.set(playerId, [...recent, at]);
  }

  /** The record of `me` against `other`, from the finished games. */
  function recordBetween(me: string, other: string) {
    return recordOf(
      [...games.values()].map((game) => ({
        players: game.players,
        status: game.status,
        winner: game.status === 'finished' ? loadFlow(game.flow).match.winner : null,
      })),
      me,
      other,
    );
  }

  function openRequestCount(playerId: string, side: 'from' | 'to'): number {
    let count = 0;
    for (const [key, request] of friendRequests) {
      const [from, to] = key.split('\n');
      if (request.status === 'open' && (side === 'from' ? from : to) === playerId) count += 1;
    }
    return count;
  }

  function makeFriends(a: string, b: string): void {
    const at = now();
    for (const [one, other] of [
      [a, b],
      [b, a],
    ] as const) {
      const mine = friendEdges.get(one) ?? new Map<string, number>();
      mine.set(other, at);
      friendEdges.set(one, mine);
    }
    friendRequests.delete(requestKey(a, b));
    friendRequests.delete(requestKey(b, a));
  }

  /** A request from `callerId` to `playerId` (`null`: not found), like the Convex `askFriend`. */
  function request(callerId: string, playerId: string | null, route: RequestRoute): FriendStatus {
    if (playerId === null) throw new FriendsError('NOT_FOUND', 'no such player');
    const mine = friendRequests.get(requestKey(callerId, playerId)) ?? null;
    const plan = planRequest({
      route,
      self: callerId === playerId,
      savedTarget: isSaved(playerId),
      met: route !== 'met' || met(callerId, playerId),
      callerBlocks: blocksPlayer(callerId, playerId),
      targetBlocks: blocksPlayer(playerId, callerId),
      friends: isFriend(callerId, playerId),
      mine,
      theirs: friendRequests.get(requestKey(playerId, callerId)) ?? null,
      openSent: openRequestCount(callerId, 'from'),
      openReceived: openRequestCount(playerId, 'to'),
      callerFriends: friendCount(callerId),
      targetFriends: friendCount(playerId),
      now: now(),
    });
    if (plan.kind === 'status') return plan.status;
    if (plan.kind === 'accept') {
      makeFriends(callerId, playerId);
      return 'friends';
    }
    friendRequests.set(requestKey(callerId, playerId), {
      status: 'open',
      createdAt: now(),
      declinedAt: null,
    });
    return 'sent';
  }

  /** Ratings (#407), like the Convex `ratings.ts`. */
  function ratingsFor(playerId: string | null): Ratings {
    const saved = (): string => {
      if (playerId === null || deletedPlayers.has(playerId)) {
        throw new RatingsError('NOT_SIGNED_IN', 'sign in first');
      }
      checkRatingsSaved(savedPlayers.has(playerId));
      return playerId;
    };
    const call = async <T>(step: () => T): Promise<T> => {
      await nextTick();
      try {
        const result = step();
        return result === undefined ? result : copy(result);
      } catch (error) {
        throw toErrorData(error);
      }
    };
    const usernameOf = (id: string): PlayerName | null =>
      nameRecords.get(id)?.username === undefined ? null : nameOf(id);
    const boardPlayer = (id: string, name: PlayerName | null): BoardPlayer => {
      const { rating, matches } = ratingOf(id);
      return { playerId: id, name, rating, matches };
    };
    return {
      mine: () =>
        call((): MyRating => {
          const id = saved();
          const row = ratingOf(id);
          return {
            rating: shownRating(row.rating),
            matches: row.matches,
            experience: row.experience,
            shown: row.shown,
            listed: isBoardable(row) && usernameOf(id) !== null,
          };
        }),
      friendsBoard: () =>
        call(() => {
          const id = saved();
          // Like Convex: each friend with a rated match (only saved
          // accounts are friends or get rated).
          const friends = [...(friendEdges.get(id)?.keys() ?? [])].filter(
            (friend) => (ratings.get(friend)?.matches ?? 0) > 0,
          );
          return friendsBoardRows(
            [id, ...friends].map((player) => boardPlayer(player, nameOf(player))),
            id,
          );
        }),
      globalBoard: () =>
        call(() => {
          const id = saved();
          const top = [...ratings]
            .filter(([player, row]) => isSaved(player) && isBoardable(row))
            .map(([player]) => boardPlayer(player, usernameOf(player)))
            .filter((player) => player.name !== null)
            .sort((a, b) => b.rating - a.rating || (a.playerId < b.playerId ? -1 : 1));
          return globalBoardRows(top, id, (player) => blocksPlayer(id, player));
        }),
      setShown: (shown) =>
        call(() => {
          const id = saved();
          ratings.set(id, { ...ratingOf(id), shown });
        }),
    };
  }

  /** The caller's seek as `mySeek` gives it (#531), like the Convex `mySeek`. */
  function seekViewOf(playerId: string): MySeek {
    const seek = seeks.get(playerId);
    const at = now();
    if (seek === undefined) return { kind: 'none' };
    if (seek.status === 'waiting') {
      return isSeekExpired(seek, at) ? { kind: 'none' } : waitingSeek(seek, shownRating);
    }
    const game = seek.gameId === null ? undefined : games.get(seek.gameId);
    if (game === undefined) return { kind: 'none' };
    const opponentId = game.players.white === playerId ? game.players.black : game.players.white;
    // A player the caller blocks shows no name (`nameSeenBy` on Convex).
    const player = (id: string) => ({
      name: blocksPlayer(playerId, id) ? null : nameOf(id),
      rating: shownRating(ratingOf(id).rating),
    });
    return matchedSeek(seek.game, game.gameId, player(playerId), player(opponentId));
  }

  /** Sends the seek of `listener` as it is now on a later microtask, when it changed. */
  function sendSeek(listener: SeekListener): void {
    const text = JSON.stringify(seekViewOf(listener.playerId));
    later(() => {
      if (!listener.active || text === listener.last) return;
      listener.last = text;
      listener.onUpdate(JSON.parse(text) as MySeek);
    });
  }

  function notifySeeks(): void {
    for (const listener of seekListeners) sendSeek(listener);
  }

  /** Ends old seeks at `now()`: waiting ones past `SEEK_TTL_MS`, matched ones past their keep time. */
  function endOldSeeks(): void {
    const at = now();
    for (const [playerId, seek] of [...seeks]) {
      const done =
        seek.status === 'waiting'
          ? isSeekExpired(seek, at)
          : seek.matchedAt !== null && isMatchedSeekDone(seek.matchedAt, at);
      if (done) seeks.delete(playerId);
    }
  }

  /**
   * Matches the waiting seeks of `game` at `now()`, like the Convex
   * `matchGame`: `pickPairs` with `mayPair` on the blocks and the pair
   * counts. Each pair starts a ranked game.
   */
  async function matchGame(game: RankedGame): Promise<void> {
    const at = now();
    const waiting = [...seeks.values()].filter(
      (seek) => seek.status === 'waiting' && seek.game === game && !isSeekExpired(seek, at),
    );
    const pairs = await pickPairs(waiting, at, (a, b) =>
      mayPair({
        blocked: blockedEither(a.playerId, b.playerId),
        pair: ratedPairs.get(pairOf(a.playerId, b.playerId).join('\n')) ?? null,
        now: at,
      }),
    );
    for (const [older, newer] of pairs) {
      // Another run may have taken one of them since the read.
      if (seeks.get(older.playerId) !== older || seeks.get(newer.playerId) !== newer) continue;
      const players = matchedPlayers(older, newer);
      const gameId = createGame(
        players.white,
        players,
        game,
        RANKED_TARGET_POINTS,
        RANKED_TURN_TIME_MINUTES,
        { ranked: true },
      );
      for (const seek of [older, newer]) {
        seeks.set(seek.playerId, { ...seek, status: 'matched', gameId, matchedAt: at });
      }
    }
  }

  /** Play ranked matching (#531), like the Convex `matchmaking.ts`. */
  function matchmakingFor(playerId: string | null): Matchmaking {
    const saved = (): string => {
      if (playerId === null || deletedPlayers.has(playerId)) {
        throw new MatchmakingError('NOT_SIGNED_IN', 'sign in first');
      }
      checkSeekSaved(savedPlayers.has(playerId));
      return playerId;
    };
    const call = async <T>(step: () => T | Promise<T>): Promise<T> => {
      await nextTick();
      try {
        const result = await step();
        return result === undefined ? result : copy(result);
      } catch (error) {
        throw toErrorData(error);
      }
    };
    return {
      seek: (request) =>
        call(async () => {
          const id = saved();
          const game = checkRankedChoice((request as { game?: unknown } | null)?.game);
          const at = now();
          const existing = seeks.get(id) ?? null;
          if (planSeek(existing, game, at) !== 'keep') {
            seeks.set(id, {
              playerId: id,
              game,
              rating: ratingOf(id).rating,
              createdAt: at,
              status: 'waiting',
              gameId: null,
              matchedAt: null,
            });
            await matchGame(game);
          }
          notifySeeks();
        }),
      cancel: () =>
        call(() => {
          const id = saved();
          // A matched seek stays, like the Convex `cancelSeek`.
          if (seeks.get(id)?.status === 'waiting' && seeks.delete(id)) notifySeeks();
        }),
      mySeek: () => call(() => seekViewOf(saved())),
      watchMySeek(onUpdate, onError) {
        let id: string;
        try {
          id = saved();
        } catch (error) {
          let active = true;
          later(() => {
            if (active) onError?.(toErrorData(error));
          });
          return () => {
            active = false;
          };
        }
        const listener: SeekListener = { playerId: id, onUpdate, last: null, active: true };
        seekListeners.add(listener);
        sendSeek(listener);
        return () => {
          listener.active = false;
          seekListeners.delete(listener);
        };
      },
      lookingCounts: () =>
        call(() => {
          const id = saved();
          const waiting = [...seeks.values()].filter((seek) => seek.status === 'waiting');
          return countLooking(waiting, id, now());
        }),
    };
  }

  async function runMatching(): Promise<void> {
    endOldSeeks();
    for (const game of RANKED_GAMES) await matchGame(game);
    notifySeeks();
  }

  /** Friends (#406), like the Convex `friends.ts`. */
  function friendsFor(playerId: string | null): Friends {
    const caller = (): string => {
      if (playerId === null || deletedPlayers.has(playerId)) {
        throw new FriendsError('NOT_SIGNED_IN', 'sign in first');
      }
      return playerId;
    };
    const saved = (): string => {
      const id = caller();
      checkSaved(savedPlayers.has(id));
      return id;
    };
    const call = async <T>(step: () => T): Promise<T> => {
      await nextTick();
      try {
        const result = step();
        return result === undefined ? result : copy(result);
      } catch (error) {
        throw toErrorData(error);
      }
    };
    const requestsOf = (id: string, side: 'from' | 'to') =>
      [...friendRequests]
        .map(([key, record]) => {
          const [from = '', to = ''] = key.split('\n');
          return { from, to, record };
        })
        .filter(
          ({ from, to, record }) =>
            record.status === 'open' && (side === 'from' ? from : to) === id,
        )
        .map(({ from, to, record }) => {
          const other = side === 'from' ? to : from;
          return { playerId: other, name: nameOf(other), sentAt: record.createdAt };
        })
        .sort((a, b) => b.sentAt - a.sentAt);
    return {
      listFriends: () =>
        call(() => {
          const id = saved();
          return [...(friendEdges.get(id) ?? new Map<string, number>())]
            .map(([friend, since]) => ({
              playerId: friend,
              name: nameOf(friend),
              since,
              record: recordBetween(id, friend),
            }))
            .sort((a, b) => b.since - a.since);
        }),
      listRequests: () =>
        call(() => {
          const id = saved();
          return { incoming: requestsOf(id, 'to'), outgoing: requestsOf(id, 'from') };
        }),
      recentPlayers: () =>
        call(() => {
          const id = saved();
          return recentOpponents(
            [...games.values()].map((game) => ({
              players: game.players,
              updatedAt: game.updatedAt,
            })),
            id,
          )
            .filter(({ playerId: other }) => isSaved(other) && !blockedEither(id, other))
            .slice(0, MAX_RECENT_PLAYERS)
            .map(({ playerId: other, playedAt }) => ({
              playerId: other,
              name: nameOf(other),
              status: statusBetween(id, other),
              playedAt,
            }));
        }),
      findPlayer: (username) =>
        call(() => {
          const id = saved();
          countSearch(id);
          return found(id, holderOfUsername(username));
        }),
      myFriendLink: () =>
        call(() => {
          const id = saved();
          const kept = tokenOf.get(id);
          if (kept !== undefined) return kept;
          const token = pickFriendTokenNow(tokenRng, (taken) => friendTokens.has(taken));
          friendTokens.set(token, id);
          tokenOf.set(id, token);
          return token;
        }),
      resetFriendLink: () =>
        call(() => {
          const id = saved();
          const old = tokenOf.get(id);
          if (old !== undefined) friendTokens.delete(old);
          const token = pickFriendTokenNow(tokenRng, (taken) => friendTokens.has(taken));
          friendTokens.set(token, id);
          tokenOf.set(id, token);
          return token;
        }),
      openFriendLink: (token) => call(() => found(caller(), ownerOfToken(token))),
      requestByLink: (token) =>
        call(() => {
          const id = saved();
          const owner = ownerOfToken(token);
          if (owner !== null && owner !== id && blockedEither(id, owner)) {
            throw new FriendsError('NOT_FOUND', 'no such player');
          }
          return request(id, owner, 'link');
        }),
      requestByUsername: (username) =>
        call(() => {
          const id = saved();
          countSearch(id);
          return request(id, holderOfUsername(username), 'username');
        }),
      sendRequest: (other) =>
        call(() => {
          const id = saved();
          checkFriendTarget(id, other);
          return request(id, other, 'met');
        }),
      acceptRequest: (other) =>
        call(() => {
          const id = saved();
          const theirs = friendRequests.get(requestKey(other, id)) ?? null;
          checkOpenRequest(theirs);
          const plan = planRequest({
            route: 'met',
            self: false,
            savedTarget: isSaved(other),
            met: true,
            callerBlocks: blocksPlayer(id, other),
            targetBlocks: blocksPlayer(other, id),
            friends: isFriend(id, other),
            mine: null,
            theirs,
            openSent: 0,
            openReceived: 0,
            callerFriends: friendCount(id),
            targetFriends: friendCount(other),
            now: now(),
          });
          if (plan.kind === 'accept') makeFriends(id, other);
        }),
      declineRequest: (other) =>
        call(() => {
          const id = saved();
          const key = requestKey(other, id);
          const theirs = friendRequests.get(key);
          if (theirs?.status !== 'open') return;
          friendRequests.set(key, { ...theirs, status: 'declined', declinedAt: now() });
        }),
      cancelRequest: (other) =>
        call(() => {
          const id = saved();
          const key = requestKey(id, other);
          if (friendRequests.get(key)?.status === 'open') friendRequests.delete(key);
        }),
      removeFriend: (other) =>
        call(() => {
          const id = saved();
          if (!isFriend(id, other)) return;
          friendEdges.get(id)?.delete(other);
          friendEdges.get(other)?.delete(id);
        }),
      inviteFriend: (other, game) => {
        const { choice, targetPoints, turnTimeMinutes } = copy(game);
        return call(() => {
          const id = saved();
          checkFriends(isFriend(id, other));
          try {
            return makeInvite(id, choice, targetPoints, turnTimeMinutes, other);
          } catch (error) {
            if (error instanceof InviteError && error.code === 'TOO_MANY_INVITES') {
              throw new FriendsError('TOO_MANY_INVITES', error.message);
            }
            if (error instanceof InviteError && error.code === 'BAD_REQUEST') {
              throw new FriendsError('BAD_REQUEST', error.message);
            }
            throw error;
          }
        });
      },
      listFriendInvites: () =>
        call(() => {
          const id = saved();
          const at = now();
          return [...invites.values()]
            .filter((invite) => invite.to === id && invite.status === 'open')
            .filter((invite) => !isInviteExpired(invite, at) && !blockedEither(id, invite.from))
            .reverse()
            .map((invite) => toInviteView(invite, at, nameOf(invite.from)));
        }),
    };
  }

  function guestMoveCounts(playerId: string): GuestMoveCounts {
    let activeGames = 0;
    for (const game of games.values()) {
      if (game.status === 'active' && sideOf(game.players, playerId) !== null) activeGames += 1;
    }
    return { activeGames, openInvites: countOpenInvites(invites.values(), playerId, now()) };
  }

  /** See `moveGuest` in `MemoryGameServer`. */
  function moveGuest(source: string, target: string): void {
    const at = now();
    for (const game of [...games.values()]) {
      const side = sideOf(game.players, source);
      if (side === null) continue;
      const move = guestGameMove(game.players, game.status === 'active', source, target);
      if (move === 'resign') {
        const before = loadStored(game.flow);
        save(game, source, before, resign(before.flow, side, rng), at);
      }
      if (move !== 'rename') continue;
      // Like a Convex patch: the version stays, so a call on its way still fits.
      const moved: MemoryGame = {
        ...game,
        players: renamePlayers(game.players, source, target),
        flow: renamePlayerInFlow(game.flow, source, target),
        events: game.events.map((text) => {
          const row = JSON.parse(text) as LoggedEvent;
          const event = renamePlayerInEvent(JSON.stringify(row.event), source, target);
          const next: LoggedEvent = {
            ...row,
            actor: row.actor === source ? target : row.actor,
            event: JSON.parse(event) as FlowEvent,
          };
          return JSON.stringify(next);
        }),
      };
      games.set(game.gameId, moved);
      for (const listener of listeners) {
        if (listener.gameId === game.gameId && sideOf(moved.players, listener.playerId) !== null) {
          send(listener, JSON.stringify(viewOf(moved, listener.playerId)));
        }
      }
      notifyLists(moved);
    }
    for (const invite of [...invites.values()]) {
      if (answeredBy.get(invite.code) === source) answeredBy.set(invite.code, target);
      if (invite.from === source) saveInvite({ ...invite, from: target });
    }
    // Blocks both ways: never one of `target` by itself, never one twice.
    const mine = blocks.get(source) ?? new Map<string, number>();
    blocks.delete(source);
    const targets = blocks.get(target) ?? new Map<string, number>();
    for (const [blocked, when] of mine) {
      if (blocked !== target && !targets.has(blocked)) targets.set(blocked, when);
    }
    if (targets.size > 0) blocks.set(target, targets);
    for (const [blocker, blocked] of blocks) {
      const when = blocked.get(source);
      if (when === undefined) continue;
      blocked.delete(source);
      if (blocker !== target && !blocked.has(target)) blocked.set(target, when);
    }
    // Reports both ways: never one by `target` about itself, one per pair.
    const kept: MemoryReport[] = [];
    for (const report of reports) {
      const moved: MemoryReport = {
        ...report,
        reporterId: report.reporterId === source ? target : report.reporterId,
        reportedId: report.reportedId === source ? target : report.reportedId,
      };
      if (moved.reporterId === moved.reportedId) continue;
      if (
        kept.some((r) => r.reporterId === moved.reporterId && r.reportedId === moved.reportedId)
      ) {
        continue;
      }
      kept.push(moved);
    }
    reports = kept;
    // A guest cannot seek (#531): nothing to move. Drop a seek, if any.
    seeks.delete(source);
    deletedPlayers.add(source);
    nameRecords.delete(source);
    notifyViewer(target);
  }

  return {
    guestMoveCounts,

    moveGuest,

    createGame,

    createInvite: makeInvite,

    onlineDataFor: (playerId) => ({ deleteMyData: () => deleteData(playerId) }),

    cancelInvite: cancel,

    invitesFor,

    getInvite: (text) => copy(inviteView(text, null)),

    transportFor,

    usernamesFor,

    safetyFor,

    friendsFor,

    ratingsFor,

    matchmakingFor,

    runMatching,

    setRatingForTest(playerId, rating) {
      ratings.set(playerId, { ...ratingOf(playerId), rating });
    },

    markSaved(playerId) {
      savedPlayers.add(playerId);
    },

    reportsOf: () => copy(reports),

    deleteReport(reporterId, reportedId) {
      reports = reports.filter(
        (report) => report.reporterId !== reporterId || report.reportedId !== reportedId,
      );
    },

    nameOf,

    getGame(gameId) {
      const game = games.get(gameId);
      return game === undefined ? null : copy(viewOf(game, null));
    },

    events(gameId) {
      return (games.get(gameId)?.events ?? []).map((row) => JSON.parse(row) as LoggedEvent);
    },

    runDueTimeouts() {
      const at = now();
      let applied = 0;
      for (const gameId of games.keys()) {
        let game = games.get(gameId);
        while (game !== undefined && scheduledCheck(game, game.version, at) === 'due') {
          // The Convex scheduler runs the check at the deadline, so the
          // next turn's clock starts there.
          applyTimeout(game, game.turnDeadline ?? at);
          applied += 1;
          game = games.get(gameId);
        }
      }
      for (const invite of invites.values()) {
        if (isInviteExpired(invite, at)) saveInvite({ ...invite, status: 'expired' });
      }
      return applied;
    },

    setFlowForTest(gameId, flow) {
      const game = games.get(gameId);
      if (game === undefined) throw new Error(`no game ${gameId}`);
      games.set(gameId, { ...game, flow: storeFlow(flow, null), status: matchStatus(flow) });
    },
  };
}

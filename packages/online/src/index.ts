/**
 * Online games, in pure TypeScript (#251): the game model the server runs
 * (`online-game.ts`), the checks around each call (`calls.ts`), the invite
 * checks and codes (`invites.ts`), the block and report checks
 * (`safety.ts`), the friends checks (`friends.ts`), the rating math (`ratings.ts`), Play ranked
 * matching (`matchmaking.ts`), the "my games" summaries
 * (`summaries.ts`), moving a guest into an account (`guest-move.ts`),
 * and an in-memory server that gives a
 * `GameTransport` and an `Invites` per player (`memory-server.ts`).
 *
 * It depends only on `@tavli/engine` and `@tavli/contracts`. The Convex
 * functions in `apps/server` and the app both use it. See
 * `docs/architecture/online-game-service.md`.
 */

export {
  NEW_RATING,
  RatingsError,
  afterRatedMatch,
  checkRatingsSaved,
  experienceFactor,
  friendsBoardRows,
  globalBoardRows,
  isBoardable,
  matchStakes,
  pairOf,
  planRatedMatch,
  shownRating,
  utcDay,
  winChance,
  type BoardPlayer,
  type MatchStakes,
  type PairCount,
  type RatingRecord,
} from './ratings';
export {
  MatchmakingError,
  candidatePairs,
  checkRankedChoice,
  checkSeekSaved,
  countLooking,
  inRange,
  isMatchedSeekDone,
  isSeekExpired,
  liveSince,
  matchedPlayers,
  matchedSeek,
  mayPair,
  PAIR_CHECKS_PER_RUN,
  pickPairs,
  planSeek,
  waitingSeek,
  type SeekRecord,
  type SeekState,
} from './matchmaking';
export { NO_NAMES, nameFrom, namesOf, pickGuestNumber, type NameRecord } from './names';
export {
  checkUsername,
  isAllowedUsername,
  myUsernameOf,
  nextUsernameChange,
  planUsername,
  usernameKey,
  type PlanUsernameInput,
  type UsernameCheck,
  type UsernamePatch,
  type UsernamePlan,
  type UsernameProblem,
  type UsernameRecord,
} from './usernames';
export {
  NO_TIMEOUTS,
  OnlineGameError,
  advance,
  answerPrompt,
  checkDraft,
  createOnlineMatch,
  deadlineAfter,
  isTimedOut,
  loadFlow,
  loadStored,
  losesRankedMatch,
  matchEndReason,
  mayRollOpening,
  onlineGameRules,
  playTurn,
  resign,
  rollDice,
  sideOf,
  storeFlow,
  storeStep,
  timeOut,
  timeoutsAfter,
  toView,
  waitingFor,
} from './online-game';
export type {
  CreateOnlineMatchOptions,
  LoadedFlow,
  SavedDraft,
  SteppedFlow,
  StoredFlow,
  TimeOutOptions,
  ViewInput,
} from './online-game';
export {
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
export type { SavedGame } from './calls';
export {
  InviteError,
  MAX_CODE_TRIES,
  MAX_OPEN_INVITES,
  checkAddressee,
  checkAnswer,
  checkCancel,
  checkInviteCap,
  checkNotBlocked,
  inviteSeenBy,
  countOpenInvites,
  inviteExpiresAt,
  inviteStatus,
  inviteVisibleTo,
  isInviteExpired,
  newInvite,
  newInviteCode,
  pickInviteCode,
  pickInviteCodeNow,
  randomCode,
  toInviteView,
} from './invites';
export type { InviteRecord, NewInviteOptions } from './invites';
export {
  FriendsError,
  NO_RECORD,
  checkFriendCaps,
  checkFriendTarget,
  checkFriends,
  checkOpenRequest,
  checkSaved,
  checkSearchCap,
  friendStatusOf,
  newFriendToken,
  pickFriendToken,
  pickFriendTokenNow,
  planRequest,
  recentOpponents,
  recordAfter,
  recordOf,
  searchWindowStart,
} from './friends';
export type {
  FriendRequestRecord,
  PlanRequestInput,
  RecentGame,
  RecordGame,
  RequestPlan,
  RequestRoute,
} from './friends';
export {
  SafetyError,
  checkBlockCap,
  checkMet,
  checkReason,
  checkReportCap,
  checkTarget,
  namesSeenBy,
  reportWindowStart,
} from './safety';
export {
  guestGameMove,
  renamePlayerInEvent,
  renamePlayerInFlow,
  renamePlayers,
  type GuestGameMove,
} from './guest-move';
export { latestGames, newestFirst, summarizeGame } from './summaries';
export type { SummaryInput } from './summaries';
export { createMemoryGameServer } from './memory-server';
export type {
  LoggedEvent,
  MemoryGameServer,
  MemoryGameServerOptions,
  MemoryReport,
} from './memory-server';

/**
 * Online games, in pure TypeScript (#251): the game model the server runs
 * (`online-game.ts`), the checks around each call (`calls.ts`), the invite
 * checks and codes (`invites.ts`), the block and report checks
 * (`safety.ts`), the "my games" summaries
 * (`summaries.ts`), moving a guest into an account (`guest-move.ts`),
 * and an in-memory server that gives a
 * `GameTransport` and an `Invites` per player (`memory-server.ts`).
 *
 * It depends only on `@tavli/engine` and `@tavli/contracts`. The Convex
 * functions in `apps/server` and the app both use it. See
 * `docs/architecture/online-game-service.md`.
 */

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
  OnlineGameError,
  advance,
  answerPrompt,
  checkDraft,
  createOnlineMatch,
  deadlineAfter,
  isTimedOut,
  loadFlow,
  loadStored,
  mayRollOpening,
  onlineGameRules,
  playTurn,
  resign,
  rollDice,
  sideOf,
  storeFlow,
  storeStep,
  timeOut,
  toView,
  waitingFor,
} from './online-game';
export type {
  CreateOnlineMatchOptions,
  LoadedFlow,
  SavedDraft,
  SteppedFlow,
  StoredFlow,
  ViewInput,
} from './online-game';
export {
  SERVER_ACTOR,
  TIMED_OUT_ERROR,
  callTimedOut,
  checkCall,
  checkNewGame,
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
  checkAnswer,
  checkCancel,
  checkInviteCap,
  checkNotBlocked,
  inviteSeenBy,
  countOpenInvites,
  inviteExpiresAt,
  inviteStatus,
  isInviteExpired,
  newInvite,
  newInviteCode,
  pickInviteCode,
  pickInviteCodeNow,
  toInviteView,
} from './invites';
export type { InviteRecord, NewInviteOptions } from './invites';
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

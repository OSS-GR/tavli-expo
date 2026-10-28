/**
 * Online games, in pure TypeScript (#251): the game model the server runs
 * (`online-game.ts`), the checks around each call (`calls.ts`), the invite
 * checks and codes (`invites.ts`), the "my games" summaries
 * (`summaries.ts`), and an in-memory server that gives a
 * `GameTransport` and an `Invites` per player (`memory-server.ts`).
 *
 * It depends only on `@tavli/engine` and `@tavli/contracts`. The Convex
 * functions in `apps/server` and the app both use it. See
 * `docs/architecture/online-game-service.md`.
 */

export {
  OnlineGameError,
  advance,
  answerPrompt,
  createOnlineMatch,
  deadlineAfter,
  isTimedOut,
  loadFlow,
  loadStored,
  onlineGameRules,
  playTurn,
  resign,
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
  checkViewer,
  eventActor,
  matchStatus,
  nextDeadline,
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
export { latestGames, newestFirst, summarizeGame } from './summaries';
export type { SummaryInput } from './summaries';
export { createMemoryGameServer } from './memory-server';
export type { LoggedEvent, MemoryGameServer, MemoryGameServerOptions } from './memory-server';

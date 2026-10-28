/**
 * Online games, in pure TypeScript (#251): the game model the server runs
 * (`online-game.ts`), the checks around each call (`calls.ts`), and an
 * in-memory server that gives a `GameTransport` per player
 * (`memory-server.ts`).
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
  onlineGameRules,
  playTurn,
  resign,
  sideOf,
  storeFlow,
  timeOut,
  toView,
  waitingFor,
} from './online-game';
export type { CreateOnlineMatchOptions, StoredFlow, ViewInput } from './online-game';
export {
  SERVER_ACTOR,
  TIMED_OUT_ERROR,
  callTimedOut,
  checkCall,
  checkNewGame,
  eventActor,
  matchStatus,
  nextDeadline,
  scheduledCheck,
} from './calls';
export type { SavedGame } from './calls';
export { createMemoryGameServer } from './memory-server';
export type { LoggedEvent, MemoryGameServer, MemoryGameServerOptions } from './memory-server';

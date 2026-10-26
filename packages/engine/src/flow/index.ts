/** The turn flow (#25): pure reducers for one game and for a match, with an event log. */

export {
  applyGameAction,
  canConfirm,
  canUndo,
  createGameFlow,
  currentBoard,
  currentPrompt,
  legalNextMoves,
  remainingDice,
} from './game-flow';
export type {
  CreateGameFlowOptions,
  FlowContext,
  GameAction,
  GameFlow,
  GamePhase,
  MoveInput,
  OpeningRoll,
  SourceMoves,
} from './game-flow';

export {
  MATCH_FLOW_SCHEMA_VERSION,
  applyMatchAction,
  createMatchFlow,
  createRematchFlow,
  matchPhase,
  replay,
} from './match-flow';
export type {
  FlowEvent,
  MatchAction,
  MatchFlow,
  MatchPhase,
  ReplayOptions,
  StartEvent,
} from './match-flow';

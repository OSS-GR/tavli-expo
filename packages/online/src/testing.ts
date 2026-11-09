/**
 * Test helpers for online games. Import them from `@tavli/online/testing`,
 * in test files only. They are plain functions, so Vitest and Jest can
 * both use them.
 */

import type { OnlineGameView } from '@tavli/contracts';
import { VARIANT_REGISTRY, createBoard, getVariant, plakoto } from '@tavli/engine';
import type { GameFlow, GameState, MatchFlow, MoveInput, PlayerId, Rng } from '@tavli/engine';

import type { MemoryGameServer } from './memory-server';
import { rollDice } from './online-game';

/** More opening rounds than this means a broken RNG: a tie comes 1 time in 6. */
const MAX_OPENING_ROLLS = 60;

/** The side still to roll its opening die in `game`, or `null` when the opening is over. */
function openingRoller(game: GameFlow): PlayerId | null {
  if (game.phase !== 'opening-roll' || game.opening === null) return null;
  return game.opening.white === null ? 'white' : 'black';
}

/**
 * Rolls both opening dice of `flow` (#379), White first, again after each
 * tie, until the opening is over. A flow past its opening comes back as it
 * is.
 */
export function openFlow(flow: MatchFlow, rng: Rng): MatchFlow {
  let next = flow;
  for (let i = 0; i < MAX_OPENING_ROLLS; i++) {
    const side = openingRoller(next.game);
    if (side === null) return next;
    // A plain `MatchFlow`: no `endedGame` (no game ends in an opening).
    const { schemaVersion, match, game, log } = rollDice(next, side, rng);
    next = { schemaVersion, match, game, log };
  }
  throw new Error(`the opening was not decided after ${MAX_OPENING_ROLLS} rolls`);
}

/** How `rollOpenings` rolls a die and reads the game. */
export interface OpeningRolls {
  /** Rolls the opening die of `side` (`GameTransport.rollDice`). */
  readonly roll: (side: PlayerId, expectedVersion: number) => Promise<unknown>;
  /** The game as the server holds it now. */
  readonly view: () => Promise<OnlineGameView | null> | OnlineGameView | null;
}

/**
 * Rolls both opening dice of an online game (#379), White first, again
 * after each tie, until the opening is over. Server tests roll real dice,
 * so a tie comes at random: this repeats until one side starts. Resolves
 * to the view after the opening (a game past its opening as it is).
 */
export async function rollOpenings(rolls: OpeningRolls): Promise<OnlineGameView> {
  for (let i = 0; i < MAX_OPENING_ROLLS; i++) {
    const view = await rolls.view();
    if (view === null) throw new Error('no such game');
    const side = openingRoller(view.game);
    if (side === null || view.status !== 'active') return view;
    await rolls.roll(side, view.version);
  }
  throw new Error(`the opening was not decided after ${MAX_OPENING_ROLLS} rolls`);
}

/**
 * `rollOpenings` on the in-memory server: each player rolls through their
 * own transport. Resolves to the view after the opening.
 */
export function openMemoryGame(server: MemoryGameServer, gameId: string): Promise<OnlineGameView> {
  return rollOpenings({
    roll: (side, expectedVersion) => {
      const players = server.getGame(gameId)?.players;
      if (players === undefined) throw new Error('no such game');
      return server.transportFor(players[side]).rollDice({ gameId, expectedVersion });
    },
    view: () => server.getGame(gameId),
  });
}

/** A legal full turn for the player to move, picked with `rng`. */
export function pickTurn(game: GameFlow, rng: Rng): MoveInput[] {
  const { state } = game;
  if (game.phase !== 'moving' || state.dice === null) {
    throw new Error(`no turn to play in phase ${game.phase}`);
  }
  const turns = getVariant(VARIANT_REGISTRY, state.variant).legalTurns(state, state.dice);
  const turn = turns[rng.nextUint32() % turns.length];
  if (turn === undefined) throw new Error('no legal turn');
  return [...turn.moves];
}

/** One of `choices`, picked with `rng`. */
export function pickChoice(choices: readonly string[], rng: Rng): string {
  const choice = choices[rng.nextUint32() % choices.length];
  if (choice === undefined) throw new Error('no choices');
  return choice;
}

/** A Plakoto flow just before Black pins White's mother, and the turn that pins it. */
export interface MotherPin {
  readonly flow: MatchFlow;
  /** Black's full turn. After it, the server asks White the mother question. */
  readonly pin: readonly MoveInput[];
}

/**
 * Puts the current game of the Plakoto match `flow` in a position where
 * Black, to move with 5-2, can pin White's mother (White's lone checker
 * on its start point): `w: 24 7x14 ; b: 10x14 3`.
 *
 * White's 14 other checkers sit on point 7, so every roll after a `playOn`
 * has a legal move. When White rolls (`rollDice`, #355), White still has
 * to move, whatever the dice (#308). On point 6 (as in the engine test
 * `plakoto-mother.test.ts`), 6-6 has no move. Then White passes, and a
 * test that expects White to move fails once in 36 runs.
 *
 * A test saves the returned flow on the server (on Convex: patch
 * `games.flow` with `storeFlow`), then sends `pin` as Black's turn.
 */
export function motherPin(flow: MatchFlow): MotherPin {
  const board = createBoard(
    { white: { points: { 24: 1, 7: 14 } }, black: { points: { 10: 14, 3: 1 } } },
    'contrary',
  );
  const state: GameState = {
    ...flow.game.state,
    board,
    toMove: 'black',
    dice: [5, 2],
    turnNumber: 9,
    variantData: null,
  };
  const game: GameFlow = {
    ...flow.game,
    phase: 'moving',
    state,
    starter: 'black',
    played: [],
    lastTurn: null,
    result: null,
  };
  const pin = plakoto
    .legalTurns(state, [5, 2])
    .find((turn) => turn.moves.some((m) => m.capture === 'pin'));
  if (pin === undefined) throw new Error('no pinning turn');
  return { flow: { ...flow, game }, pin: [...pin.moves] };
}

/**
 * Puts the current game of the Portes match `flow` in a position where
 * `player` (White by default), to move with 6-5, bears off its last two
 * checkers: every legal turn wins the game. The other player has borne
 * off one checker, so the win is a single game (1 point) and a longer
 * match goes on.
 *
 * A test saves the returned flow on the server (on Convex: patch
 * `games.flow` with `storeFlow`), then sends any legal turn of `player`.
 */
export function lastBearOff(flow: MatchFlow, player: PlayerId = 'white'): MatchFlow {
  const winner = { points: { 1: 2 }, off: 13 };
  const loser = { points: { 6: 5, 5: 5, 4: 4 }, off: 1 };
  const board = createBoard(
    player === 'white' ? { white: winner, black: loser } : { white: loser, black: winner },
    'contrary',
  );
  const state: GameState = {
    ...flow.game.state,
    board,
    toMove: player,
    dice: [6, 5],
    turnNumber: 30,
  };
  const game: GameFlow = {
    ...flow.game,
    phase: 'moving',
    state,
    starter: flow.game.starter ?? player,
    played: [],
    lastTurn: null,
    result: null,
  };
  return { ...flow, game };
}

/**
 * Puts the current game of the Portes match `flow` in a position where
 * `player` (White by default) waits to roll with one checker on the bar
 * and the other player's home board closed: every roll passes (#355).
 * The other player has three checkers on its point 13, so every roll of
 * theirs has a legal move.
 *
 * A test saves the returned flow on the server (on Convex: patch
 * `games.flow` with `storeFlow`), then rolls as `player`.
 */
export function closedOut(flow: MatchFlow, player: PlayerId = 'white'): MatchFlow {
  const stuck = { points: { 6: 14 }, bar: 1 };
  const closer = { points: { 1: 2, 2: 2, 3: 2, 4: 2, 5: 2, 6: 2, 13: 3 } };
  const board = createBoard(
    player === 'white' ? { white: stuck, black: closer } : { white: closer, black: stuck },
    'contrary',
  );
  const state: GameState = {
    ...flow.game.state,
    board,
    toMove: player,
    dice: null,
    turnNumber: 12,
  };
  const game: GameFlow = {
    ...flow.game,
    phase: 'awaiting-roll',
    state,
    starter: flow.game.starter ?? player,
    played: [],
    lastTurn: null,
    result: null,
  };
  return { ...flow, game };
}

/**
 * The 4 digits of `playerId`'s guest name on `server` (#400). Throws while
 * the player has none (before their first invite or game), or while a
 * username shows instead (#405).
 */
export function guestNumberOf(server: MemoryGameServer, playerId: string): string {
  const name = server.nameOf(playerId);
  if (name?.kind !== 'guest') throw new Error(`${playerId} has no guest name`);
  return name.number;
}

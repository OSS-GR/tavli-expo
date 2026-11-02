// The roll a player asked for (#355), over the in-memory server.
import type { OnlineGameView } from '@tavli/contracts';
import { createSeededRng } from '@tavli/engine';
import { createMemoryGameServer } from '@tavli/online';
import { closedOut, openMemoryGame, pickTurn } from '@tavli/online/testing';

import { viewFlow } from './onlineStore';
import { openingRollResult, rollResult } from './rollResult';

const PLAYERS = { white: 'ann', black: 'bob' };

/** A Portes game after the opening; `view()` reads it, `roll()` rolls for the side the server waits for. */
async function game() {
  const server = createMemoryGameServer({ rng: createSeededRng(4), now: () => 0 });
  const gameId = server.createGame('ann', PLAYERS, 'portes', 3, 1);
  // Both players roll their opening dice (#379).
  await openMemoryGame(server, gameId);
  const view = (): OnlineGameView => server.getGame(gameId)!;
  const transport = () => server.transportFor(PLAYERS[view().waitingFor!]);
  const roll = () => transport().rollDice({ gameId, expectedVersion: view().version });
  const playTurn = () =>
    transport().sendTurn({
      gameId,
      expectedVersion: view().version,
      moves: pickTurn(view().game, createSeededRng(1)),
    });
  return { server, gameId, view, roll, playTurn };
}

describe('rollResult', () => {
  it('gives the dice of your roll with a legal move', async () => {
    const { view, roll, playTurn } = await game();
    await playTurn();
    const before = view();
    const side = before.waitingFor!;
    expect(before.game.phase).toBe('awaiting-roll');
    await roll();
    const after = view();
    expect(after.game.phase).toBe('moving');
    expect(rollResult(before, after, side)).toEqual(after.game.state.dice);
    // It is not the other side's roll.
    expect(rollResult(before, after, side === 'white' ? 'black' : 'white')).toBeNull();
  });

  it('gives the dice of your roll with no legal move, from the pass', async () => {
    const { server, gameId, view, roll } = await game();
    server.setFlowForTest(gameId, closedOut(viewFlow(view()), 'white'));
    const before = view();
    await roll();
    const after = view();
    expect(after.waitingFor).toBe('black');
    expect(after.game.phase).toBe('awaiting-roll');
    const last = after.game.lastTurn!;
    expect(last).toMatchObject({ player: 'white', moves: [] });
    expect(rollResult(before, after, 'white')).toEqual(last.dice);
    expect(rollResult(before, after, 'black')).toBeNull();
  });

  it('gives nothing for a view that is not the next one after the roll', async () => {
    const { view, roll, playTurn } = await game();
    const start = view();
    // The first turn plays the opening dice.
    expect(start.game.phase).toBe('moving');
    await playTurn();
    const waiting = view();
    // The turn before the roll is no roll.
    expect(rollResult(start, waiting, start.waitingFor!)).toBeNull();
    await roll();
    const rolled = view();
    await playTurn();
    const later = view();
    // Two versions on: a view was missed.
    expect(rollResult(waiting, later, waiting.waitingFor!)).toBeNull();
    // The same view twice.
    expect(rollResult(rolled, rolled, rolled.waitingFor!)).toBeNull();
  });
});

describe('openingRollResult (#379)', () => {
  /** A new match: each player rolls their own opening die. */
  function opening(seed: number) {
    const server = createMemoryGameServer({ rng: createSeededRng(seed), now: () => 0 });
    const gameId = server.createGame('ann', PLAYERS, 'portes', 3, 1);
    const view = (): OnlineGameView => server.getGame(gameId)!;
    const roll = (side: 'white' | 'black') =>
      server.transportFor(PLAYERS[side]).rollDice({ gameId, expectedVersion: view().version });
    return { view, roll };
  }

  it('gives your die, in any order, and the die that decided the opening', async () => {
    const { view, roll } = opening(4);
    const start = view();
    await roll('black');
    const one = view();
    const black = one.game.opening!.black!;
    expect(openingRollResult(start, one, 'black')).toBe(black);
    // The other side did not roll.
    expect(openingRollResult(start, one, 'white')).toBeNull();
    await roll('white');
    const two = view();
    const white = openingRollResult(one, two, 'white');
    expect(white).not.toBeNull();
    expect(openingRollResult(one, two, 'black')).toBeNull();
    if (two.game.phase === 'opening-roll') {
      // A tie: the engine cleared both dice; the tied value is the newest tie.
      expect(two.game.opening!.ties.at(-1)).toBe(white);
      expect(white).toBe(black);
    } else {
      expect(two.game.opening!.white).toBe(white);
    }
    // A missed view, or the same view twice.
    expect(openingRollResult(start, two, 'white')).toBeNull();
    expect(openingRollResult(one, one, 'black')).toBeNull();
  });

  it('gives the tied value after a tie', async () => {
    // Look for a seed whose opening ties, so the test does not depend on one.
    for (let seed = 1; seed < 200; seed++) {
      const { view, roll } = opening(seed);
      await roll('white');
      const one = view();
      await roll('black');
      const two = view();
      if (two.game.phase !== 'opening-roll') continue;
      expect(openingRollResult(one, two, 'black')).toBe(one.game.opening!.white);
      return;
    }
    throw new Error('no seed gave a tie');
  });
});

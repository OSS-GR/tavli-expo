// The roll a player asked for (#355), over the in-memory server.
import type { OnlineGameView } from '@tavli/contracts';
import { createSeededRng } from '@tavli/engine';
import { createMemoryGameServer } from '@tavli/online';
import { closedOut, pickTurn } from '@tavli/online/testing';

import { viewFlow } from './onlineStore';
import { rollResult } from './rollResult';

const PLAYERS = { white: 'ann', black: 'bob' };

/** A Portes game; `view()` reads it, `roll()` rolls for the side the server waits for. */
function game() {
  const server = createMemoryGameServer({ rng: createSeededRng(4), now: () => 0 });
  const gameId = server.createGame('ann', PLAYERS, 'portes', 3, 1);
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
    const { view, roll, playTurn } = game();
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
    const { server, gameId, view, roll } = game();
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
    const { view, roll, playTurn } = game();
    const start = view();
    // The opening roll came from the server: no one asked for it.
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

// The other player's roll (#373), over the in-memory server.
import type { OnlineGameView } from '@tavli/contracts';
import { createSeededRng, type MatchFlow } from '@tavli/engine';
import { createMemoryGameServer } from '@tavli/online';
import { closedOut, pickTurn } from '@tavli/online/testing';

import { viewFlow } from './onlineStore';
import { remoteRoll } from './remoteRoll';

const PLAYERS = { white: 'ann', black: 'bob' };

/** A Portes game; `flow()` reads it, `roll()` rolls for the side the server waits for. */
function game() {
  const server = createMemoryGameServer({ rng: createSeededRng(4), now: () => 0 });
  const gameId = server.createGame('ann', PLAYERS, 'portes', 3, 1);
  const view = (): OnlineGameView => server.getGame(gameId)!;
  const flow = (): MatchFlow => viewFlow(view());
  const transport = () => server.transportFor(PLAYERS[view().waitingFor!]);
  const roll = () => transport().rollDice({ gameId, expectedVersion: view().version });
  const playTurn = () =>
    transport().sendTurn({
      gameId,
      expectedVersion: view().version,
      moves: pickTurn(view().game, createSeededRng(1)),
    });
  return { server, gameId, view, flow, roll, playTurn };
}

const other = (side: 'white' | 'black') => (side === 'white' ? 'black' : 'white');

describe('remoteRoll', () => {
  it('gives the other player’s roll with a legal move', async () => {
    const { view, flow, roll, playTurn } = game();
    await playTurn();
    const before = flow();
    const roller = view().waitingFor!;
    await roll();
    const after = flow();
    expect(after.game.phase).toBe('moving');
    expect(remoteRoll(before, after, other(roller))).toEqual({
      player: roller,
      dice: after.game.state.dice,
      pass: false,
    });
    // Your own roll is not theirs: it is thrown from your touch.
    expect(remoteRoll(before, after, roller)).toBeNull();
  });

  it('gives the other player’s roll with no legal move, from the pass', async () => {
    const { server, gameId, flow, roll } = game();
    server.setFlowForTest(gameId, closedOut(flow(), 'black'));
    const before = flow();
    await roll();
    const after = flow();
    expect(after.game.phase).toBe('awaiting-roll');
    const last = after.game.lastTurn!;
    expect(last).toMatchObject({ player: 'black', moves: [] });
    expect(remoteRoll(before, after, 'white')).toEqual({
      player: 'black',
      dice: last.dice,
      pass: true,
    });
    expect(remoteRoll(before, after, 'black')).toBeNull();
  });

  it('gives nothing when the view does not follow the wait for the roll', async () => {
    const { view, flow, roll, playTurn } = game();
    const start = flow();
    const starter = view().waitingFor!;
    // The opening roll came from the server: nobody threw it.
    expect(start.game.phase).toBe('moving');
    await playTurn();
    const waiting = flow();
    // A turn is no roll.
    expect(remoteRoll(start, waiting, starter)).toBeNull();
    await roll();
    await playTurn();
    const later = flow();
    // The roll's view was missed: the board shows the new position only.
    expect(remoteRoll(waiting, later, starter)).toBeNull();
    // The same flow twice.
    expect(remoteRoll(waiting, waiting, starter)).toBeNull();
  });
});

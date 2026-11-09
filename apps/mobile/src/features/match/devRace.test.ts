/**
 * `playToRace` (the dev route `/dev/race`): the bot plays both sides until
 * the game is a race with White to roll, with normal store actions only.
 */
import { InlineBotRunner, createBot } from '@tavli/bot';
import { createSeededRng, isRace, matchPhase, replay } from '@tavli/engine';

import { createGameStore } from '@/features/game/gameStore';

import { playToRace } from './devRace';

const runner = new InlineBotRunner(createBot());

describe('playToRace', () => {
  it.each([1, 2, 3])('seed %i: stops in a race with White to roll', async (seed) => {
    const store = createGameStore({
      players: { white: 'You', black: 'Bot' },
      targetPoints: 3,
      rng: createSeededRng(seed),
    });
    expect(await playToRace(store, { runner, rng: createSeededRng(seed + 100) })).toBe(true);
    const flow = store.getState().flow;
    expect(matchPhase(flow)).toBe('playing');
    expect(flow.game.phase).toBe('awaiting-roll');
    expect(flow.game.state.toMove).toBe('white');
    expect(isRace(flow.game.state)).toBe(true);
    // A real match log: it replays to the same match.
    expect(replay(flow.log)).toEqual(flow);
  });

  it('gives up when the actions run out', async () => {
    const store = createGameStore({
      players: { white: 'You', black: 'Bot' },
      rng: createSeededRng(1),
    });
    expect(await playToRace(store, { runner, rng: createSeededRng(2), maxActions: 3 })).toBe(false);
  });
});

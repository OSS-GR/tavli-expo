import { describe, expect, it } from 'vitest';

import { BotCancelledError, isBotCancelled } from '@tavli/contracts';
import type { BotMoveRequest } from '@tavli/contracts';
import { asodio, createSeededRng, portes, sameTurn } from '@tavli/engine';

import { InlineBotRunner, createBot } from './index';
import type { Bot } from './index';

const state = portes.initialState({ startingPlayer: 'black' });
const request: BotMoveRequest = {
  variant: 'portes',
  state,
  dice: [5, 3],
  difficulty: 'easy',
  seed: 11,
};

describe('InlineBotRunner', () => {
  it('resolves with the same turn as the bot with that seed', async () => {
    const runner = new InlineBotRunner();
    const turn = await runner.chooseMove(request);
    const direct = createBot().chooseTurn(state, request.dice, 'easy', {
      rng: createSeededRng(request.seed),
    });
    expect(sameTurn(turn, direct)).toBe(true);
    expect(turn.player).toBe('black');
    // The request is plain JSON, so it survives a round trip.
    const copy = JSON.parse(JSON.stringify(request)) as BotMoveRequest;
    expect(sameTurn(await runner.chooseMove(copy), turn)).toBe(true);
  });

  it('cancel rejects pending requests and the runner keeps working', async () => {
    const runner = new InlineBotRunner();
    const first = runner.chooseMove(request);
    const second = runner.chooseMove({ ...request, seed: 12 });
    runner.cancel();
    await expect(first).rejects.toBeInstanceOf(BotCancelledError);
    await expect(second).rejects.toSatisfy(isBotCancelled);
    await expect(runner.chooseMove(request)).resolves.toMatchObject({ player: 'black' });
    // Cancel with nothing pending is fine.
    runner.cancel();
  });

  it('does not run the bot for a cancelled request', async () => {
    let calls = 0;
    const counting: Bot = {
      chooseTurn(...args) {
        calls += 1;
        return createBot().chooseTurn(...args);
      },
    };
    const runner = new InlineBotRunner(counting);
    const pending = runner.chooseMove(request);
    runner.cancel();
    await expect(pending).rejects.toBeInstanceOf(BotCancelledError);
    expect(calls).toBe(0);
  });

  it('rejects with the bot error', async () => {
    const runner = new InlineBotRunner();
    await expect(runner.chooseMove({ ...request, variant: 'plakoto' })).rejects.toMatchObject({
      code: 'INVALID_REQUEST',
    });
    // Asodio has no hard bot yet.
    const asodioStart = asodio.initialState({ startingPlayer: 'black' });
    await expect(
      runner.chooseMove({
        ...request,
        variant: 'asodio',
        state: asodioStart,
        difficulty: 'hard',
      }),
    ).rejects.toMatchObject({ code: 'NOT_IMPLEMENTED' });
    await expect(runner.chooseMove({ ...request, seed: 0.5 })).rejects.toMatchObject({
      code: 'OUT_OF_RANGE',
    });
  });

  it('passes timeBudgetMs on to the bot', async () => {
    let seen: number | undefined;
    const spy: Bot = {
      chooseTurn(s, dice, level, opts) {
        seen = opts.timeBudgetMs;
        return createBot().chooseTurn(s, dice, level, opts);
      },
    };
    await new InlineBotRunner(spy).chooseMove({ ...request, timeBudgetMs: 250 });
    expect(seen).toBe(250);
  });
});

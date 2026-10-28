// The test helpers keep the promises other tests rely on (#308).

import { describe, expect, it } from 'vitest';

import { createSeededRng } from '@tavli/engine';
import type { Rng } from '@tavli/engine';

import { answerPrompt, createOnlineMatch, playTurn, waitingFor } from './online-game';
import { motherPin } from './testing';

/** An `Rng` whose first two dice are `a` and `b`. */
function diceRng(a: number, b: number): Rng {
  const values = [a - 1, b - 1];
  return { nextUint32: () => values.shift() ?? 0 };
}

describe('motherPin', () => {
  it('after playOn, White moves next with every roll', () => {
    const match = createOnlineMatch(
      { choice: 'plakoto', targetPoints: 1, players: { white: 'alice', black: 'bob' } },
      createSeededRng(1),
    );
    const { flow, pin } = motherPin(match);
    const asked = playTurn(flow, 'black', pin, createSeededRng(2));
    expect(waitingFor(asked)).toBe('white');
    for (let a = 1; a <= 6; a++) {
      for (let b = 1; b <= 6; b++) {
        const next = answerPrompt(asked, 'white', 'playOn', diceRng(a, b));
        expect(next.game.state.dice, `roll ${a}-${b}`).toEqual([a, b]);
        expect(waitingFor(next), `roll ${a}-${b}`).toBe('white');
      }
    }
  });
});

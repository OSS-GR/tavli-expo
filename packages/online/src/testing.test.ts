// The test helpers keep the promises other tests rely on (#308).

import { describe, expect, it } from 'vitest';

import { createSeededRng } from '@tavli/engine';
import type { Rng } from '@tavli/engine';

import { answerPrompt, createOnlineMatch, playTurn, rollDice, waitingFor } from './online-game';
import { closedOut, motherPin } from './testing';

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
    const playOn = answerPrompt(asked, 'white', 'playOn', createSeededRng(3));
    expect(playOn.game.phase).toBe('awaiting-roll');
    expect(waitingFor(playOn)).toBe('white');
    for (let a = 1; a <= 6; a++) {
      for (let b = 1; b <= 6; b++) {
        const next = rollDice(playOn, 'white', diceRng(a, b));
        expect(next.game.state.dice, `roll ${a}-${b}`).toEqual([a, b]);
        expect(waitingFor(next), `roll ${a}-${b}`).toBe('white');
      }
    }
  });
});

describe('closedOut', () => {
  it.each(['white', 'black'] as const)(
    'every roll of %s passes, and every roll of the other side moves (#355)',
    (player) => {
      const match = createOnlineMatch(
        { choice: 'portes', targetPoints: 1, players: { white: 'alice', black: 'bob' } },
        createSeededRng(1),
      );
      const flow = closedOut(match, player);
      const other = player === 'white' ? 'black' : 'white';
      expect(flow.game.phase).toBe('awaiting-roll');
      expect(waitingFor(flow)).toBe(player);
      for (let a = 1; a <= 6; a++) {
        for (let b = 1; b <= 6; b++) {
          const passed = rollDice(flow, player, diceRng(a, b));
          expect(passed.game.phase, `roll ${a}-${b}`).toBe('awaiting-roll');
          expect(waitingFor(passed), `roll ${a}-${b}`).toBe(other);
          expect(passed.game.lastTurn, `roll ${a}-${b}`).toEqual({
            player,
            dice: [a, b],
            moves: [],
          });
          const next = rollDice(passed, other, diceRng(a, b));
          expect(next.game.phase, `their roll ${a}-${b}`).toBe('moving');
          expect(waitingFor(next), `their roll ${a}-${b}`).toBe(other);
        }
      }
    },
  );
});

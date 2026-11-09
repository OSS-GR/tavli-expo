/**
 * The engine's race check (`isRace`, used by the app's fast forward) and
 * the bot's own contact checks (each evaluator scores a race with the
 * race code) must agree on every position.
 */
import { isRace, type GameState } from '@tavli/engine';
import { describe, expect, it } from 'vitest';

import { asodioContact, asodioSideOf } from './evaluators/asodio-board';
import { fevgaHasContact, fevgaSideOf } from './evaluators/fevga-board';
import { plakotoContact, plakotoSideOf } from './evaluators/plakoto-board';
import { hasContact, sideOf } from './evaluators/portes-board';
import { randomAsodioPositions } from './testing/random-asodio-positions';
import { randomFevgaPositions } from './testing/random-fevga-positions';
import { randomPlakotoPositions } from './testing/random-plakoto-positions';
import { randomPositions } from './testing/random-positions';

/** Checks every state and returns how many were races (the test needs some of each). */
function check(states: readonly GameState[], contact: (s: GameState) => boolean): number {
  let races = 0;
  for (const state of states) {
    const race = isRace(state);
    expect({ board: state.board, race }).toEqual({ board: state.board, race: !contact(state) });
    if (race) races += 1;
  }
  return races;
}

describe('isRace agrees with the bot contact checks', () => {
  it('Portes', () => {
    const races = check(randomPositions(11, 3000, 3), (s) =>
      hasContact(sideOf(s, 'white'), sideOf(s, 'black')),
    );
    expect(races).toBeGreaterThan(50);
  });

  it('Plakoto', () => {
    const races = check(randomPlakotoPositions(12, 3000, 3), (s) =>
      plakotoContact(plakotoSideOf(s, 'white'), plakotoSideOf(s, 'black')),
    );
    expect(races).toBeGreaterThan(50);
  });

  it('Fevga', () => {
    const races = check(randomFevgaPositions(13, 3000, 3), (s) =>
      fevgaHasContact(fevgaSideOf(s, 'white'), fevgaSideOf(s, 'black')),
    );
    expect(races).toBeGreaterThan(50);
  });

  it('Asodio', () => {
    const races = check(randomAsodioPositions(14, 3000, 3), (s) =>
      asodioContact(asodioSideOf(s, 'white'), asodioSideOf(s, 'black')),
    );
    expect(races).toBeGreaterThan(20);
  });
});

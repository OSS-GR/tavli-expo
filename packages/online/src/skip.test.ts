// A player who cannot move with any roll does not roll (#728,
// docs/rules/tavli-match.md "A player who cannot move with any roll",
// edge case 45): the server skips their turn in the same step.

import { describe, expect, it } from 'vitest';

import { VARIANT_REGISTRY, createSeededRng, getVariant } from '@tavli/engine';
import type { FlowEvent, MatchFlow, MoveInput, PlayerId } from '@tavli/engine';

import { advance, createOnlineMatch, playTurn, rollDice, waitingFor } from './online-game';
import type { SteppedFlow } from './online-game';
import { closedOut, openFlow } from './testing';

const PLAYERS = { white: 'alice', black: 'bob' };

/** Portes: White on the bar against Black's six doors. `toMove` rolls next. */
function sixDoors(toMove: PlayerId): MatchFlow {
  const rng = createSeededRng(7);
  const opened = openFlow(
    createOnlineMatch({ choice: 'portes', targetPoints: 3, players: PLAYERS }, rng),
    rng,
  );
  const closed = closedOut(opened, 'white');
  // The log starts empty, so a test sees only its own events.
  return {
    ...closed,
    log: [],
    game: { ...closed.game, state: { ...closed.game.state, toMove } },
  };
}

/** Black's legal turns for the roll in `flow`, split by whether a home point (a door) loses a checker. */
function blackTurns(flow: MatchFlow): { keep: MoveInput[][]; open: MoveInput[][] } {
  const { state } = flow.game;
  if (state.dice === null) throw new Error('no roll');
  const turns = getVariant(VARIANT_REGISTRY, state.variant).legalTurns(state, state.dice);
  const fromHome = (moves: readonly MoveInput[]) =>
    moves.some((move) => typeof move.from === 'number' && move.from <= 6);
  return {
    keep: turns.filter((turn) => !fromHome(turn.moves)).map((turn) => [...turn.moves]),
    open: turns.filter((turn) => fromHome(turn.moves)).map((turn) => [...turn.moves]),
  };
}

describe('the server skips a player who cannot move with any roll (#728)', () => {
  it('tavli-match.md #45: skips in the same step, again after each turn, until a door opens', () => {
    const rng = createSeededRng(11);
    const events: FlowEvent[] = [];
    const keep = (step: SteppedFlow): MatchFlow => {
      events.push(...step.log);
      return { ...step, log: [] };
    };
    // White is to roll and cannot move: the first server step skips them.
    let flow = keep(advance(sixDoors('white'), rng));
    expect(waitingFor(flow)).toBe('black');
    expect(flow.game.skipped).toBe('white');
    expect(flow.game.lastTurn).toBeNull();
    expect(events.map((event) => event.type)).toEqual(['skipTurn']);

    let skips = 1;
    let opened = false;
    for (let turn = 0; turn < 60 && !opened; turn += 1) {
      flow = keep(rollDice(flow, 'black', rng));
      // Black's roll ends the note of the skip.
      expect(flow.game.skipped ?? null).toBeNull();
      const { keep: closedTurns, open } = blackTurns(flow);
      const first = open[0];
      if (first !== undefined) {
        // A door loses a checker: White can enter, so White rolls.
        flow = keep(playTurn(flow, 'black', first, rng));
        expect(waitingFor(flow)).toBe('white');
        expect(flow.game.skipped ?? null).toBeNull();
        opened = true;
      } else {
        const moves = closedTurns[0];
        if (moves === undefined) throw new Error('Black has a move with every roll');
        // The doors stay: White is skipped again, and Black rolls again.
        flow = keep(playTurn(flow, 'black', moves, rng));
        expect(waitingFor(flow)).toBe('black');
        expect(flow.game.skipped).toBe('white');
        expect(flow.game.lastTurn?.player).toBe('black');
        skips += 1;
      }
    }
    expect(opened).toBe(true);
    expect(events.filter((event) => event.type === 'skipTurn')).toHaveLength(skips);
  });

  it('a roll by the skipped player is refused once the server skipped them', () => {
    const rng = createSeededRng(3);
    const flow = advance(sixDoors('white'), rng);
    expect(() => rollDice(flow, 'white', rng)).toThrow();
  });

  it('skips nobody in a normal position', () => {
    const rng = createSeededRng(5);
    const opened = openFlow(
      createOnlineMatch({ choice: 'portes', targetPoints: 3, players: PLAYERS }, rng),
      rng,
    );
    const stepped = advance({ ...opened, log: [] }, rng);
    expect(stepped.game.skipped ?? null).toBeNull();
    expect(stepped.log).toEqual([]);
  });
});

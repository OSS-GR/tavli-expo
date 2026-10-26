import { describe, expect, it } from 'vitest';

import { nextVariantId } from '../match';
import type { PlayerId } from '../player';
import { resolveRules } from '../presets';
import { createSeededRng } from '../rng';
import type { Rng } from '../rng';
import type { RuleOverrides, RuleSet } from '../rules';
import type { StandardVariantId } from '../state';
import { raceVariant } from '../testing/race-variant';
import { randomAction } from '../testing/random-flow';
import type { RandomPlayOptions } from '../testing/random-flow';
import { createVariantRegistry } from '../variant';
import type { GameResult, Variant } from '../variant';
import { portes } from '../variants';
import type { FlowContext } from './game-flow';
import {
  applyMatchAction,
  createMatchFlow,
  createRematchFlow,
  matchPhase,
  replay,
} from './match-flow';
import type { FlowEvent, MatchAction, MatchFlow } from './match-flow';

const illegalAction = expect.objectContaining({ code: 'ILLEGAL_ACTION' });

function portesOnly(overrides: RuleOverrides = {}): RuleSet {
  return resolveRules('portes', {
    ...overrides,
    match: { rotation: ['portes'], ...overrides.match },
  });
}

function act(flow: MatchFlow, actions: readonly MatchAction[], ctx: FlowContext = {}): MatchFlow {
  return actions.reduce((f, action) => applyMatchAction(f, action, ctx), flow);
}

/** Plays random actions until the phase is no longer `playing` (or `until` says stop). */
function playOn(
  flow: MatchFlow,
  dice: Rng,
  choices: Rng,
  options: RandomPlayOptions = {},
  ctx: FlowContext = {},
): MatchFlow {
  let current = flow;
  while (matchPhase(current) === 'playing') {
    const action = randomAction(current, choices, options, ctx);
    if (action === null) break;
    current = applyMatchAction(current, action, { ...ctx, rng: dice });
  }
  return current;
}

/** Plays a whole match at random. */
function playMatch(flow: MatchFlow, seed: number, options: RandomPlayOptions = {}): MatchFlow {
  const dice = createSeededRng(seed);
  const choices = createSeededRng(seed + 100_000);
  let current = flow;
  for (;;) {
    current = playOn(current, dice, choices, options);
    if (matchPhase(current) === 'match-over') return current;
    current = applyMatchAction(current, { type: 'nextGame' });
  }
}

/** A fake game for the rotation: the race variant under another id. */
function fake(id: StandardVariantId, result?: (turnNumber: number) => GameResult | null): Variant {
  const resultOf: Variant['result'] = (state) =>
    result === undefined ? raceVariant.result(state) : result(state.turnNumber);
  return {
    ...raceVariant,
    id,
    initialState: ({ startingPlayer, rules }) => ({
      ...raceVariant.initialState({ startingPlayer }),
      variant: id,
      ...(rules === undefined ? {} : { rules }),
    }),
    result: resultOf,
    isGameOver: (state) => resultOf(state) !== null,
  };
}

/** Plakoto that ends in a draw after one turn (both mothers pinned). */
const drawingPlakoto = fake('plakoto', (turn) =>
  turn > 1 ? { winner: null, points: 0, reason: 'bothMothersPinned' } : null,
);
const fakes: FlowContext = {
  registry: createVariantRegistry([fake('portes'), drawingPlakoto, fake('fevga')]),
};

function openingRoll(flow: MatchFlow, white: 1 | 2 | 3 | 4 | 5 | 6, black: typeof white) {
  return act(
    flow,
    [
      { type: 'rollOpening', player: 'white', die: white },
      { type: 'rollOpening', player: 'black', die: black },
    ],
    fakes,
  );
}

describe('match flow', () => {
  it('starts game 1 with an opening roll and logs the setup', () => {
    const flow = createMatchFlow();
    expect(matchPhase(flow)).toBe('playing');
    expect(flow.game.phase).toBe('opening-roll');
    expect(flow.match.targetPoints).toBe(3);
    expect(flow.log).toEqual([
      {
        type: 'start',
        rules: flow.match.rules,
        targetPoints: 3,
        players: { white: 'white', black: 'black' },
        starter: null,
      },
    ]);
  });

  it('tavli-match.md #4: game 2 starter = winner of game 1, fresh dice, no opening contest', () => {
    const over = playOn(
      createMatchFlow({ rules: portesOnly() }),
      createSeededRng(1),
      createSeededRng(2),
    );
    expect(matchPhase(over)).toBe('game-over');
    const winner = over.game.result?.winner as PlayerId;
    expect(over.match.games).toHaveLength(1);
    expect(over.match.score[winner]).toBe(over.game.result?.points);
    expect(() => applyMatchAction(over, { type: 'roll', player: winner })).toThrow(illegalAction);
    const game2 = applyMatchAction(over, { type: 'nextGame' });
    expect(game2.game).toMatchObject({ phase: 'awaiting-roll', starter: winner, opening: null });
    expect(game2.game.state).toMatchObject({ toMove: winner, dice: null, turnNumber: 1 });
  });

  it('tavli-match.md #5: Plakoto draw → 0 points; next game Fevga with a new opening roll', () => {
    const rules = portesOnly({ match: { rotation: ['plakoto', 'fevga'] } });
    let flow = openingRoll(createMatchFlow({ rules }, fakes), 5, 2);
    expect(flow.game.state.variant).toBe('plakoto');
    flow = act(
      flow,
      [
        { type: 'move', player: 'white', move: { from: 6, to: 1, die: 5 } },
        { type: 'move', player: 'white', move: { from: 6, to: 4, die: 2 } },
        { type: 'confirm', player: 'white' },
      ],
      fakes,
    );
    expect(matchPhase(flow)).toBe('game-over');
    expect(flow.match.score).toEqual({ white: 0, black: 0 });
    expect(flow.match.games[0]).toMatchObject({ variant: 'plakoto', winner: null, points: 0 });
    flow = applyMatchAction(flow, { type: 'nextGame' }, fakes);
    expect(flow.game.state.variant).toBe('fevga');
    expect(flow.game.phase).toBe('opening-roll');
    expect(flow.game.state.rules.movement.direction).toBe('parallel');
  });

  it('tavli-match.md #6: after Fevga the rotation goes back to Portes', () => {
    let flow = createMatchFlow({ targetPoints: 99, starter: 'white' }, fakes);
    const seen: string[] = [];
    for (let game = 0; game < 4; game += 1) {
      seen.push(flow.game.state.variant);
      // The race games end quickly; the drawing Plakoto ends after one turn.
      flow = playOn(flow, createSeededRng(game), createSeededRng(game + 50), {}, fakes);
      flow = applyMatchAction(flow, { type: 'nextGame' }, fakes);
    }
    expect(seen).toEqual(['portes', 'plakoto', 'fevga', 'portes']);
    expect(flow.match.games.map((g) => g.variant)).toEqual([
      'portes',
      'plakoto',
      'fevga',
      'portes',
    ]);
  });

  it('the match ends at the target score; nothing more can be played', () => {
    const over = playMatch(createMatchFlow({ rules: portesOnly() }), 7);
    expect(matchPhase(over)).toBe('match-over');
    const winner = over.match.winner as PlayerId;
    expect(over.match.score[winner]).toBeGreaterThanOrEqual(3);
    expect(() => applyMatchAction(over, { type: 'nextGame' })).toThrow(illegalAction);
  });

  it('a game that is not built yet fails with a clear error and leaves the flow as it was', () => {
    let flow = createMatchFlow({ starter: 'white' });
    flow = act(flow, [
      { type: 'roll', player: 'white', dice: [3, 1] },
      { type: 'resign', player: 'black' },
    ]);
    expect(matchPhase(flow)).toBe('game-over');
    expect(nextVariantId(flow.match)).toBe('plakoto');
    const copy = JSON.parse(JSON.stringify(flow)) as MatchFlow;
    expect(() => applyMatchAction(flow, { type: 'nextGame' })).toThrow(
      expect.objectContaining({ code: 'UNKNOWN_VARIANT' }),
    );
    expect(flow).toEqual(copy);
  });

  it('resign during a turn: the game ends, the match counts it', () => {
    const flow = act(createMatchFlow({ rules: portesOnly(), starter: 'white' }), [
      { type: 'roll', player: 'white', dice: [3, 1] },
      { type: 'move', player: 'white', move: { from: 8, to: 5, die: 3 } },
      { type: 'resign', player: 'white' },
    ]);
    expect(flow.game.result).toEqual({ winner: 'black', points: 2, reason: 'resigned' });
    expect(flow.match.score).toEqual({ white: 0, black: 2 });
    expect(flow.match.nextStarter).toBe('black');
  });

  it('resign match: the opponent wins the match at once', () => {
    const flow = act(createMatchFlow({ rules: portesOnly(), starter: 'white' }), [
      { type: 'roll', player: 'white', dice: [3, 1] },
      { type: 'resignMatch', player: 'black' },
    ]);
    expect(matchPhase(flow)).toBe('match-over');
    expect(flow.match).toMatchObject({ winner: 'white', resignedBy: 'black' });
    expect(() =>
      applyMatchAction(flow, { type: 'move', player: 'white', move: { from: 8, to: 5, die: 3 } }),
    ).toThrow(illegalAction);
  });

  it('rematch: the winner of the last game starts, with no opening roll', () => {
    const over = act(createMatchFlow({ rules: portesOnly(), targetPoints: 1, starter: 'white' }), [
      { type: 'roll', player: 'white', dice: [3, 1] },
      { type: 'resign', player: 'white' },
    ]);
    expect(over.match.winner).toBe('black');
    const rematch = createRematchFlow(over);
    expect(rematch.game).toMatchObject({ phase: 'awaiting-roll', starter: 'black' });
    expect(rematch.match.score).toEqual({ white: 0, black: 0 });
    expect(rematch.log).toHaveLength(1);
    expect(rematch.log[0]).toMatchObject({ type: 'start', starter: 'black' });
    const opening = createRematchFlow(
      act(
        createMatchFlow({
          rules: portesOnly({ match: { rematchStarter: 'openingRoll' } }),
          targetPoints: 1,
          starter: 'white',
        }),
        [{ type: 'resignMatch', player: 'white' }],
      ),
    );
    expect(opening.game.phase).toBe('opening-roll');
  });
});

describe('event log and replay', () => {
  const MATCHES = 12;

  it(
    `random full matches replay to identical final JSON (${MATCHES} matches)`,
    { timeout: 60_000 },
    () => {
      const options: RandomPlayOptions = { undo: 0.15, resignGame: 0.0005, resignMatch: 0.0002 };
      const seen = new Map<string, number>();
      for (let seed = 1; seed <= MATCHES; seed += 1) {
        const flow = playMatch(createMatchFlow({ rules: portesOnly() }), seed, options);
        expect(matchPhase(flow)).toBe('match-over');
        for (const event of flow.log) seen.set(event.type, (seen.get(event.type) ?? 0) + 1);
        // From the log as it is (every die in it): no RNG needed.
        const again = replay(flow.log);
        expect(JSON.stringify(again)).toBe(JSON.stringify(flow));
        // Through JSON text, as from the database.
        const fromJson = replay(JSON.parse(JSON.stringify(flow.log)) as FlowEvent[]);
        expect(fromJson).toEqual(flow);
        // Without the dice: the same seed rolls the same dice.
        const noDice = flow.log.map((event): FlowEvent => {
          if (event.type === 'roll') return { type: 'roll', player: event.player };
          if (event.type === 'rollOpening') return { type: 'rollOpening', player: event.player };
          return event;
        });
        expect(JSON.stringify(replay(noDice, { seed }))).toBe(JSON.stringify(flow));
      }
      // The random play used every kind of action.
      for (const type of ['rollOpening', 'roll', 'move', 'undo', 'confirm', 'nextGame', 'resign']) {
        expect(seen.get(type) ?? 0, type).toBeGreaterThan(0);
      }
    },
  );

  it('the log has every action: undo, confirm, nextGame', () => {
    const flow = act(createMatchFlow({ rules: portesOnly(), starter: 'white' }), [
      { type: 'roll', player: 'white', dice: [3, 1] },
      { type: 'move', player: 'white', move: { from: 8, to: 5, die: 3 } },
      { type: 'undo', player: 'white' },
      { type: 'move', player: 'white', move: { from: 8, to: 5, die: 3 } },
      { type: 'move', player: 'white', move: { from: 6, to: 5, die: 1 } },
      { type: 'confirm', player: 'white' },
    ]);
    expect(flow.log.map((e) => e.type)).toEqual([
      'start',
      'roll',
      'move',
      'undo',
      'move',
      'move',
      'confirm',
    ]);
    // The logged move has the full move, with the capture filled in.
    expect(flow.log[2]).toEqual({
      type: 'move',
      player: 'white',
      move: { from: 8, to: 5, die: 3, capture: 'none' },
    });
    expect(replay(flow.log)).toEqual(flow);
  });

  it('a failed action is not logged', () => {
    const flow = createMatchFlow({ rules: portesOnly(), starter: 'white' });
    expect(() => applyMatchAction(flow, { type: 'roll', player: 'black', dice: [3, 1] })).toThrow();
    expect(flow.log).toHaveLength(1);
  });

  it('replay needs a start event first, and only once', () => {
    const flow = createMatchFlow({ rules: portesOnly(), starter: 'white' });
    const start = flow.log[0] as FlowEvent;
    expect(() => replay([])).toThrow(illegalAction);
    expect(() => replay([{ type: 'roll', player: 'white' }])).toThrow(illegalAction);
    expect(() => replay([start, start])).toThrow(illegalAction);
    // A roll without dice and without a seed cannot be replayed.
    expect(() => replay([start, { type: 'roll', player: 'white' }])).toThrow(illegalAction);
  });

  it('works with the real Portes variant registry by default', () => {
    expect(portes.id).toBe('portes');
    const flow = replay(createMatchFlow({ rules: portesOnly() }).log);
    expect(flow.game.state.variant).toBe('portes');
  });
});

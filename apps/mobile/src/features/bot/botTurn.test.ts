import {
  BotCancelledError,
  type BotAnswerRequest,
  type BotMoveRequest,
  type BotRunner,
} from '@tavli/contracts';
import {
  VARIANT_REGISTRY,
  createBoard,
  createGameFlow,
  createSeededRng,
  getVariant,
  plakoto,
  portes,
  resolveRules,
  type DieValue,
  type GameState,
  type Turn,
} from '@tavli/engine';

import {
  DICE_LAND_MS,
  DOUBLE_BEAT_MS,
  DOUBLE_SHOWN_MS,
  DOUBLE_SPLIT_MS,
} from '@/features/board/diceMotion';
import { FLIGHT_MS, HIT_DELAY_MS } from '@/features/board/flights';
import { createGameStore, type GameStore } from '@/features/game/gameStore';

import { BOT_SPEEDS, BOT_SPEED_TIMING, BOT_TIMING, DOUBLE_MS, type BotTiming } from './botSpeed';
import { botAnswer, botStep, startBotTurn, type BotTurnActions } from './botTurn';

import { runOnFakeTimers } from '../../../test/clock';

/** The least pause the player gets after a checker lands, before the next move. */
const MIN_PAUSE_MS = 200;
/** The least beat after the last checker lands, before the confirm. */
const MIN_BEAT_MS = 150;

/** A fake runner: the first legal turn, or whatever `pick` returns. Records requests. */
function fakeRunner(pick?: (req: BotMoveRequest) => Turn | Promise<Turn>) {
  const requests: BotMoveRequest[] = [];
  let cancels = 0;
  const runner: BotRunner & { requests: BotMoveRequest[]; cancels: () => number } = {
    requests,
    cancels: () => cancels,
    chooseMove: async (req) => {
      requests.push(req);
      if (pick) return pick(req);
      const turns = getVariant(VARIANT_REGISTRY, req.state.variant).legalTurns(req.state, req.dice);
      return turns[0] as Turn;
    },
    cancel: () => {
      cancels++;
    },
  };
  return runner;
}

/** A store where Black (the bot) is to roll, on the Portes start. */
function botToRoll(seed = 3): GameStore {
  const store = createGameStore({
    players: { white: 'you', black: 'bot' },
    targetPoints: 3,
    rng: createSeededRng(seed),
  });
  const state: GameState = portes.initialState({ startingPlayer: 'black' });
  store.setState({
    flow: { ...store.getState().flow, game: createGameFlow({ state, starter: 'black' }) },
  });
  return store;
}

function actionsFor(store: GameStore, log: string[]): BotTurnActions {
  const d = store.getState().dispatch;
  return {
    roll: () => {
      log.push('roll');
      return d({ type: 'roll', player: 'black' });
    },
    move: (move) => {
      log.push(`move ${String(move.from)}/${String(move.to)}`);
      return d({ type: 'move', player: 'black', move });
    },
    undo: () => {
      log.push('undo');
      return d({ type: 'undo', player: 'black' });
    },
    confirm: () => {
      log.push('confirm');
      return d({ type: 'confirm', player: 'black' });
    },
    answer: (choice) => {
      log.push(`answer ${choice}`);
      return d({ type: 'answer', player: 'black', choice });
    },
  };
}

/**
 * A Plakoto store where White is about to pin Black's mother: Black's last
 * checker on own 24 (= White 1), a White checker on White 2, Black still on
 * the board elsewhere. White rolls 1-6 and plays 2/1 and a 6.
 */
function blackMotherPinned(): GameStore {
  const rules = resolveRules('plakoto', { match: { rotation: ['plakoto'] } });
  const store = createGameStore({
    players: { white: 'you', black: 'bot' },
    targetPoints: 3,
    rules,
    rng: createSeededRng(4),
  });
  const board = createBoard(
    {
      white: { points: { 24: 10, 14: 2, 8: 2, 2: 1 } },
      black: { points: { 24: 1, 20: 4, 16: 5, 12: 5 } },
    },
    'contrary',
  );
  const state: GameState = { ...plakoto.initialState({ startingPlayer: 'white', rules }), board };
  store.setState({
    flow: { ...store.getState().flow, game: createGameFlow({ state, starter: 'white' }) },
  });
  const d = store.getState().dispatch;
  d({ type: 'roll', player: 'white', dice: [1, 6] });
  d({ type: 'move', player: 'white', move: { from: 2, to: 1, die: 1 } });
  d({ type: 'move', player: 'white', move: { from: 24, to: 18, die: 6 } });
  d({ type: 'confirm', player: 'white' });
  return store;
}

const fast = {
  beforeRollMs: 0,
  afterRollMs: 0,
  doubleMs: 0,
  moveMs: 0,
  hitMs: 0,
  landMs: 0,
  thinkMs: () => 0,
};

describe('botStep', () => {
  it('rolls, plays and confirms only on the bot turn', () => {
    const store = botToRoll();
    expect(botStep(store.getState().flow, 'black')).toBe('roll');
    expect(botStep(store.getState().flow, 'white')).toBeNull();

    store.getState().dispatch({ type: 'roll', player: 'black', dice: [6, 5] });
    expect(botStep(store.getState().flow, 'black')).toBe('play');
  });

  it('answers the Plakoto mother question when the bot is asked', () => {
    const store = blackMotherPinned();
    const { flow } = store.getState();
    expect(flow.game.phase).toBe('awaiting-answer');
    expect(botStep(flow, 'black')).toBe('answer');
    expect(botStep(flow, 'white')).toBeNull();
    // A runner without `chooseAnswer` plays on.
    expect(
      botAnswer({ player: 'black', kind: 'motherPinned', choices: ['resign', 'playOn'] }),
    ).toBe('playOn');
  });

  it('leaves the opening roll to the human tap', () => {
    const store = createGameStore({
      players: { white: 'you', black: 'bot' },
      rng: createSeededRng(1),
    });
    expect(store.getState().flow.game.phase).toBe('opening-roll');
    expect(botStep(store.getState().flow, 'black')).toBeNull();
  });
});

describe('startBotTurn', () => {
  it('rolls with the flow dice, plays the runner turn move by move, then confirms', async () => {
    const store = botToRoll();
    const runner = fakeRunner();
    const log: string[] = [];
    const handle = startBotTurn({
      player: 'black',
      difficulty: 'easy',
      runner,
      rng: createSeededRng(9),
      getFlow: () => store.getState().flow,
      actions: actionsFor(store, log),
      timing: fast,
    });
    await handle.done;

    const { flow } = store.getState();
    const turn = flow.game.lastTurn;
    expect(turn?.player).toBe('black');
    expect(log[0]).toBe('roll');
    expect(log.at(-1)).toBe('confirm');
    expect(log.filter((l) => l.startsWith('move'))).toHaveLength(turn?.moves.length ?? -1);
    expect(flow.game.state.toMove).toBe('white');
    expect(flow.game.phase).toBe('awaiting-roll');

    // One request with the turn-start state and the rolled dice, and a seed.
    expect(runner.requests).toHaveLength(1);
    const req = runner.requests[0]!;
    expect(req.difficulty).toBe('easy');
    expect(req.variant).toBe('portes');
    expect(req.dice).toEqual(turn?.dice);
    expect(Number.isSafeInteger(req.seed)).toBe(true);
  });

  it('marks a forced turn (a single legal play) for the short think time', async () => {
    const store = botToRoll();
    const thinkMs = jest.fn(() => 0);
    // 6-6 from the start: Black has exactly one way to play? Use the variant to check.
    store.getState().dispatch({ type: 'roll', player: 'black', dice: [6, 6] });
    const state = store.getState().flow.game.state;
    const count = getVariant(VARIANT_REGISTRY, 'portes').legalTurns(state, [6, 6]).length;
    await startBotTurn({
      player: 'black',
      difficulty: 'easy',
      runner: fakeRunner(),
      rng: createSeededRng(9),
      getFlow: () => store.getState().flow,
      actions: actionsFor(store, []),
      timing: { ...fast, thinkMs },
    }).done;
    expect(thinkMs).toHaveBeenCalledWith('easy', expect.anything(), count === 1);
  });

  it('goes on from moves already played when they start its plan', async () => {
    const store = botToRoll();
    store.getState().dispatch({ type: 'roll', player: 'black', dice: [6, 5] });
    const runner = fakeRunner();
    const plan = getVariant(VARIANT_REGISTRY, 'portes').legalTurns(
      store.getState().flow.game.state,
      [6, 5],
    )[0]!;
    store.getState().dispatch({ type: 'move', player: 'black', move: plan.moves[0]! });
    const log: string[] = [];
    await startBotTurn({
      player: 'black',
      difficulty: 'easy',
      runner,
      rng: createSeededRng(9),
      getFlow: () => store.getState().flow,
      actions: actionsFor(store, log),
      timing: fast,
    }).done;
    expect(log.filter((l) => l === 'undo')).toHaveLength(0);
    expect(log.filter((l) => l.startsWith('move'))).toHaveLength(plan.moves.length - 1);
    expect(store.getState().flow.game.lastTurn?.moves).toEqual(plan.moves);
  });

  it('takes back moves that do not fit its plan', async () => {
    const store = botToRoll();
    store.getState().dispatch({ type: 'roll', player: 'black', dice: [6, 5] });
    const turns = getVariant(VARIANT_REGISTRY, 'portes').legalTurns(
      store.getState().flow.game.state,
      [6, 5],
    );
    const played = turns[0]!.moves[0]!;
    const other = turns.find((t) => t.moves[0]!.from !== played.from)!;
    store.getState().dispatch({ type: 'move', player: 'black', move: played });
    const log: string[] = [];
    await startBotTurn({
      player: 'black',
      difficulty: 'easy',
      runner: fakeRunner(() => other),
      rng: createSeededRng(9),
      getFlow: () => store.getState().flow,
      actions: actionsFor(store, log),
      timing: fast,
    }).done;
    expect(log[0]).toBe('undo');
    expect(store.getState().flow.game.lastTurn?.moves).toEqual(other.moves);
  });

  it('reports a bot error and stops; a cancel is not an error', async () => {
    const failing = botToRoll();
    const onError = jest.fn();
    await startBotTurn({
      player: 'black',
      difficulty: 'medium',
      runner: fakeRunner(() => Promise.reject(new Error('NOT_IMPLEMENTED'))),
      rng: createSeededRng(9),
      getFlow: () => failing.getState().flow,
      actions: actionsFor(failing, []),
      timing: fast,
      onError,
    }).done;
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'NOT_IMPLEMENTED' }));

    const cancelled = botToRoll();
    const quiet = jest.fn();
    await startBotTurn({
      player: 'black',
      difficulty: 'easy',
      runner: fakeRunner(() => Promise.reject(new BotCancelledError())),
      rng: createSeededRng(9),
      getFlow: () => cancelled.getState().flow,
      actions: actionsFor(cancelled, []),
      timing: fast,
      onError: quiet,
    }).done;
    expect(quiet).not.toHaveBeenCalled();
  });

  it('asks the runner for its answer when it has chooseAnswer', async () => {
    const store = blackMotherPinned();
    const log: string[] = [];
    const requests: BotAnswerRequest[] = [];
    const runner = {
      ...fakeRunner(),
      chooseAnswer: async (req: BotAnswerRequest) => {
        requests.push(req);
        return 'resign';
      },
    };
    await startBotTurn({
      player: 'black',
      difficulty: 'medium',
      runner,
      rng: createSeededRng(9),
      getFlow: () => store.getState().flow,
      actions: actionsFor(store, log),
      timing: fast,
    }).done;
    expect(log).toEqual(['answer resign']);
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({ variant: 'plakoto', difficulty: 'medium' });
    // The request holds the state with the question in it.
    expect(requests[0]!.state.variantData).toMatchObject({ offer: 'black' });
    expect(store.getState().flow.game.result).toMatchObject({ winner: 'white', points: 2 });
  });

  it('falls back to "play on" when the runner answers a choice that is not offered', async () => {
    const store = blackMotherPinned();
    const log: string[] = [];
    const onError = jest.fn();
    await startBotTurn({
      player: 'black',
      difficulty: 'medium',
      runner: { ...fakeRunner(), chooseAnswer: async () => 'maybe' },
      rng: createSeededRng(9),
      getFlow: () => store.getState().flow,
      actions: actionsFor(store, log),
      timing: fast,
      onError,
    }).done;
    expect(log.slice(0, 2)).toEqual(['answer playOn', 'roll']);
    expect(onError).not.toHaveBeenCalled();
    expect(store.getState().flow.game.state.toMove).toBe('white');
  });

  it('reports an error instead of stalling when no answer is taken', async () => {
    const store = blackMotherPinned();
    const onError = jest.fn();
    const refused: BotTurnActions = { ...actionsFor(store, []), answer: () => false };
    await startBotTurn({
      player: 'black',
      difficulty: 'easy',
      runner: fakeRunner(),
      rng: createSeededRng(9),
      getFlow: () => store.getState().flow,
      actions: refused,
      timing: fast,
      onError,
    }).done;
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('could not answer') }),
    );
  });

  it('plays on when its mother is pinned (a runner without chooseAnswer), then plays', async () => {
    const store = blackMotherPinned();
    const log: string[] = [];
    await startBotTurn({
      player: 'black',
      difficulty: 'easy',
      runner: fakeRunner(),
      rng: createSeededRng(9),
      getFlow: () => store.getState().flow,
      actions: actionsFor(store, log),
      timing: fast,
    }).done;
    expect(log.slice(0, 2)).toEqual(['answer playOn', 'roll']);
    expect(log.at(-1)).toBe('confirm');
    const { game } = store.getState().flow;
    expect(game.lastTurn?.player).toBe('black');
    expect(game.state.toMove).toBe('white');
  });

  it('does nothing when it is not the bot turn', async () => {
    const store = botToRoll();
    const log: string[] = [];
    await startBotTurn({
      player: 'white',
      difficulty: 'easy',
      runner: fakeRunner(),
      rng: createSeededRng(9),
      getFlow: () => store.getState().flow,
      actions: actionsFor(store, log),
      timing: fast,
    }).done;
    expect(log).toEqual([]);
  });
});

describe('startBotTurn timing (#172)', () => {
  // The bot waits on timers: move the fake clock by the timing constants.
  runOnFakeTimers();

  /**
   * The actions, with the fake-clock time of each roll, move and confirm.
   * With `dice`, the bot rolls those dice (a double waits longer, #177).
   */
  function timed(store: GameStore, dice?: readonly [DieValue, DieValue]) {
    const log: string[] = [];
    const at: { what: string; ms: number }[] = [];
    const plain = actionsFor(store, log);
    const actions: BotTurnActions = dice
      ? {
          ...plain,
          roll: () => {
            log.push('roll');
            return store.getState().dispatch({ type: 'roll', player: 'black', dice: [...dice] });
          },
        }
      : plain;
    const stamp =
      <A extends unknown[]>(what: string, action: (...args: A) => boolean) =>
      (...args: A) => {
        at.push({ what, ms: Date.now() });
        return action(...args);
      };
    const withTimes: BotTurnActions = {
      ...actions,
      roll: stamp('roll', actions.roll),
      move: stamp('move', actions.move),
      confirm: stamp('confirm', actions.confirm),
    };
    return { log, at, actions: withTimes };
  }

  /** The time from each stamp to the next one. */
  const gaps = (at: readonly { ms: number }[]) => at.slice(1).map((s, i) => s.ms - at[i]!.ms);

  /** Starts the bot (Black) on `store` with the default timing and `timing` on top. */
  function start(store: GameStore, actions: BotTurnActions, timing: Partial<BotTiming>) {
    return startBotTurn({
      player: 'black',
      difficulty: 'easy',
      runner: fakeRunner(),
      rng: createSeededRng(9),
      getFlow: () => store.getState().flow,
      actions,
      timing,
    });
  }

  /** A Portes store where Black can hit White's blot: own 8 to 6 with the 2 of a 2-1. */
  function blackCanHit(): { store: GameStore; turns: readonly Turn[] } {
    const store = botToRoll();
    const board = createBoard(
      { white: { points: { 24: 14, 19: 1 } }, black: { points: { 8: 15 } } },
      'contrary',
    );
    const { flow } = store.getState();
    store.setState({
      flow: {
        ...flow,
        game: createGameFlow({ state: { ...flow.game.state, board }, starter: 'black' }),
      },
    });
    store.getState().dispatch({ type: 'roll', player: 'black', dice: [2, 1] });
    const turns = getVariant(VARIANT_REGISTRY, 'portes').legalTurns(
      store.getState().flow.game.state,
      [2, 1],
    );
    return { store, turns };
  }

  it.each(BOT_SPEEDS)(
    '%s: rolls after beforeRollMs, keeps the dice on screen, moves moveMs apart, confirms landMs after the last move',
    async (speed) => {
      const store = botToRoll();
      // Not a double: those wait longer (below).
      const { log, at, actions } = timed(store, [6, 5]);
      const { beforeRollMs, afterRollMs, moveMs, landMs } = BOT_SPEED_TIMING[speed];
      const t0 = Date.now();
      const handle = start(store, actions, { ...BOT_SPEED_TIMING[speed], thinkMs: () => 0 });

      await jest.advanceTimersByTimeAsync(beforeRollMs - 1);
      expect(log).toEqual([]);
      await jest.advanceTimersByTimeAsync(1);
      expect(log).toEqual(['roll']);
      // The bot is done thinking at once, but the dice stay on screen.
      await jest.advanceTimersByTimeAsync(afterRollMs - 1);
      expect(log).toEqual(['roll']);
      await jest.advanceTimersByTimeAsync(1);
      expect(log).toHaveLength(2);
      await jest.advanceTimersByTimeAsync(5 * moveMs);
      await handle.done;

      expect(at[0]).toEqual({ what: 'roll', ms: t0 + beforeRollMs });
      expect(at[1]).toEqual({ what: 'move', ms: t0 + beforeRollMs + afterRollMs });
      expect(at.at(-1)?.what).toBe('confirm');
      // The start position has no blot, so no hit: moveMs between moves,
      // then only landMs from the last move to the confirm.
      const moves = at.filter((s) => s.what === 'move');
      expect(gaps(moves)).toEqual(moves.slice(1).map(() => moveMs));
      expect(gaps(at.slice(-2))).toEqual([landMs]);
    },
  );

  it.each(BOT_SPEEDS)(
    '%s: a double waits doubleMs more, so the four dice show before the first move (#177)',
    async (speed) => {
      const store = botToRoll();
      const { log, at, actions } = timed(store, [4, 4]);
      const { beforeRollMs, afterRollMs, doubleMs, moveMs } = BOT_SPEED_TIMING[speed];
      const t0 = Date.now();
      const handle = start(store, actions, { ...BOT_SPEED_TIMING[speed], thinkMs: () => 0 });

      await jest.advanceTimersByTimeAsync(beforeRollMs + afterRollMs + doubleMs - 1);
      expect(log).toEqual(['roll']);
      await jest.advanceTimersByTimeAsync(1);
      expect(log).toHaveLength(2);
      await jest.advanceTimersByTimeAsync(5 * moveMs);
      await handle.done;
      expect(at[1]).toEqual({ what: 'move', ms: t0 + beforeRollMs + afterRollMs + doubleMs });
      expect(at.filter((s) => s.what === 'move')).toHaveLength(4);
    },
  );

  it('waits the think time when it is longer than afterRollMs', async () => {
    const store = botToRoll();
    const { at, actions } = timed(store, [6, 5]);
    const { beforeRollMs, afterRollMs, moveMs } = BOT_TIMING;
    const think = afterRollMs + 300;
    const thinkMs = jest.fn(() => think);
    const t0 = Date.now();
    const handle = start(store, actions, { thinkMs });
    await jest.advanceTimersByTimeAsync(beforeRollMs + think + 5 * moveMs);
    await handle.done;

    expect(thinkMs).toHaveBeenCalledWith('easy', expect.anything(), expect.any(Boolean));
    expect(at[1]).toEqual({ what: 'move', ms: t0 + beforeRollMs + think });
  });

  it('plays the opening dice after the think time only (it did not roll them)', async () => {
    const store = createGameStore({
      players: { white: 'you', black: 'bot' },
      targetPoints: 3,
      rng: createSeededRng(1),
    });
    const d = store.getState().dispatch;
    d({ type: 'rollOpening', player: 'white', die: 1 });
    d({ type: 'rollOpening', player: 'black', die: 6 });
    expect(botStep(store.getState().flow, 'black')).toBe('play');

    const { at, actions } = timed(store);
    const think = 50;
    const t0 = Date.now();
    const handle = start(store, actions, { thinkMs: () => think });
    await jest.advanceTimersByTimeAsync(think + 5 * BOT_TIMING.moveMs);
    await handle.done;

    expect(at.map((s) => s.what)).toEqual(['move', 'move', 'confirm']);
    // Not afterRollMs: the dice have been on screen since the opening card.
    expect(at[0]).toEqual({ what: 'move', ms: t0 + think });
    expect(think).toBeLessThan(BOT_TIMING.afterRollMs);
  });

  it('goes on after the menu with the think time only (the dice were already rolled)', async () => {
    const store = botToRoll();
    const { log, at, actions } = timed(store);
    const { beforeRollMs, afterRollMs, moveMs } = BOT_TIMING;
    const think = 50;
    const first = start(store, actions, { thinkMs: () => think });
    await jest.advanceTimersByTimeAsync(beforeRollMs);
    expect(log).toEqual(['roll']);
    // The menu opens before the first move, and closes later.
    first.cancel();
    await first.done;
    await jest.advanceTimersByTimeAsync(5000);

    const resumed = Date.now();
    const second = start(store, actions, { thinkMs: () => think });
    await jest.advanceTimersByTimeAsync(think + 5 * moveMs);
    await second.done;

    expect(log.filter((l) => l === 'roll')).toHaveLength(1);
    expect(at[1]).toEqual({ what: 'move', ms: resumed + think });
    expect(think).toBeLessThan(afterRollMs);
    expect(at.at(-1)?.what).toBe('confirm');
  });

  it('pauses hitMs longer after a hit between moves', async () => {
    const { store, turns } = blackCanHit();
    const hitFirst = turns.find(
      (t) =>
        t.moves.length === 2 && t.moves[0]!.capture === 'hit' && t.moves[1]!.capture === 'none',
    );
    expect(hitFirst).toBeDefined();

    const { at, actions } = timed(store);
    const { moveMs, hitMs, landMs } = BOT_TIMING;
    const handle = startBotTurn({
      player: 'black',
      difficulty: 'easy',
      runner: fakeRunner(() => hitFirst!),
      rng: createSeededRng(9),
      getFlow: () => store.getState().flow,
      actions,
      timing: { thinkMs: () => 0 },
    });
    await jest.advanceTimersByTimeAsync(3 * (moveMs + hitMs));
    await handle.done;

    expect(at.map((s) => s.what)).toEqual(['move', 'move', 'confirm']);
    expect(gaps(at)).toEqual([moveMs + hitMs, landMs]);
    expect(store.getState().flow.game.lastTurn?.moves).toEqual(hitFirst!.moves);
  });

  it('confirms when the hit checker has landed after a last move that hits', async () => {
    const { store, turns } = blackCanHit();
    // 8/6* 8/7: the engine lists one order of a turn; the bot plays 8/7 first.
    const both = turns.find(
      (t) =>
        t.moves.length === 2 &&
        t.moves[0]!.capture === 'hit' &&
        t.moves[1]!.capture === 'none' &&
        t.moves[0]!.from === t.moves[1]!.from,
    );
    expect(both).toBeDefined();
    const hitLast: Turn = { ...both!, moves: [both!.moves[1]!, both!.moves[0]!] };

    const { at, actions } = timed(store);
    const { moveMs, hitMs, landMs } = BOT_TIMING;
    const handle = startBotTurn({
      player: 'black',
      difficulty: 'easy',
      runner: fakeRunner(() => hitLast),
      rng: createSeededRng(9),
      getFlow: () => store.getState().flow,
      actions,
      timing: { thinkMs: () => 0 },
    });
    await jest.advanceTimersByTimeAsync(3 * (moveMs + hitMs));
    await handle.done;

    expect(at.map((s) => s.what)).toEqual(['move', 'move', 'confirm']);
    // The hit checker leaves HIT_DELAY_MS after the hitter; no full hitMs pause.
    expect(gaps(at)).toEqual([moveMs, landMs + HIT_DELAY_MS]);
  });

  it.each(BOT_SPEEDS)('%s: each move lands before the next step starts', (speed) => {
    const { afterRollMs, doubleMs, moveMs, hitMs, landMs } = BOT_SPEED_TIMING[speed];
    // A hit checker flies last: it leaves HIT_DELAY_MS after the mover.
    expect(moveMs).toBeGreaterThanOrEqual(HIT_DELAY_MS + FLIGHT_MS + MIN_PAUSE_MS);
    // The dice land, then the player gets a pause to read them.
    expect(afterRollMs).toBeGreaterThanOrEqual(DICE_LAND_MS + MIN_PAUSE_MS);
    // A double: the two dice land, stay a beat and split into four (#177).
    // The four dice then get the same pause.
    expect(doubleMs).toBe(DOUBLE_MS);
    expect(DOUBLE_MS).toBe(DOUBLE_BEAT_MS + DOUBLE_SPLIT_MS);
    expect(afterRollMs + doubleMs).toBeGreaterThanOrEqual(DOUBLE_SHOWN_MS + MIN_PAUSE_MS);
    expect(hitMs).toBeGreaterThan(0);
    // After the last move: the flight and a short beat, less than a full gap.
    expect(landMs).toBeGreaterThanOrEqual(FLIGHT_MS + MIN_BEAT_MS);
    expect(landMs).toBeLessThan(moveMs);
  });

  it('plays at Normal speed by default; Slow is slower and Fast is faster', () => {
    expect(BOT_TIMING).toBe(BOT_SPEED_TIMING.normal);
    // The owner's play test (#172): about 0.9 s before the roll and per move.
    expect(BOT_TIMING.beforeRollMs).toBeGreaterThanOrEqual(900);
    expect(BOT_TIMING.moveMs).toBeGreaterThanOrEqual(900);
    const { slow, normal, fast: quick } = BOT_SPEED_TIMING;
    for (const key of ['beforeRollMs', 'afterRollMs', 'moveMs', 'hitMs', 'landMs'] as const) {
      expect(slow[key]).toBeGreaterThan(normal[key]);
      expect(normal[key]).toBeGreaterThan(quick[key]);
    }
  });

  it('stops at once on cancel and cancels the runner', async () => {
    const store = botToRoll();
    const log: string[] = [];
    const runner = fakeRunner();
    const { beforeRollMs, afterRollMs, moveMs } = BOT_TIMING;
    const handle = startBotTurn({
      player: 'black',
      difficulty: 'easy',
      runner,
      rng: createSeededRng(9),
      getFlow: () => store.getState().flow,
      actions: actionsFor(store, log),
      timing: { thinkMs: () => 0 },
    });
    // Rolled, and the dice are still on screen.
    await jest.advanceTimersByTimeAsync(beforeRollMs + afterRollMs - 1);
    expect(log).toEqual(['roll']);
    handle.cancel();
    await jest.advanceTimersByTimeAsync(afterRollMs + 5 * moveMs);
    await handle.done;
    expect(log).toEqual(['roll']);
    expect(runner.cancels()).toBe(1);
    expect(jest.getTimerCount()).toBe(0);
    expect(store.getState().flow.game.phase).toBe('moving');
  });
});

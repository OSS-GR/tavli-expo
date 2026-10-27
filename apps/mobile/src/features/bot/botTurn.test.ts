import { BotCancelledError, type BotMoveRequest, type BotRunner } from '@tavli/contracts';
import {
  VARIANT_REGISTRY,
  createGameFlow,
  createSeededRng,
  getVariant,
  portes,
  type GameState,
  type Turn,
} from '@tavli/engine';

import { createGameStore, type GameStore } from '@/features/game/gameStore';

import { botStep, startBotTurn, type BotTurnActions } from './botTurn';

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
  };
}

const fast = { beforeRollMs: 0, moveMs: 0, thinkMs: () => 0 };

describe('botStep', () => {
  it('rolls, plays and confirms only on the bot turn', () => {
    const store = botToRoll();
    expect(botStep(store.getState().flow, 'black')).toBe('roll');
    expect(botStep(store.getState().flow, 'white')).toBeNull();

    store.getState().dispatch({ type: 'roll', player: 'black', dice: [6, 5] });
    expect(botStep(store.getState().flow, 'black')).toBe('play');
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

  it('waits the think time, then about 0.4 s per move', async () => {
    jest.useFakeTimers();
    try {
      const store = botToRoll();
      const log: string[] = [];
      const stamps: number[] = [];
      const actions = actionsFor(store, log);
      const timed: BotTurnActions = {
        ...actions,
        move: (m) => {
          stamps.push(Date.now());
          return actions.move(m);
        },
      };
      const start = Date.now();
      const thinkMs = jest.fn(() => 700);
      const handle = startBotTurn({
        player: 'black',
        difficulty: 'easy',
        runner: fakeRunner(),
        rng: createSeededRng(9),
        getFlow: () => store.getState().flow,
        actions: timed,
        timing: { beforeRollMs: 500, moveMs: 400, thinkMs },
      });
      await jest.advanceTimersByTimeAsync(499);
      expect(log).toEqual([]);
      await jest.advanceTimersByTimeAsync(1);
      expect(log).toEqual(['roll']);
      await jest.advanceTimersByTimeAsync(5000);
      await handle.done;

      expect(thinkMs).toHaveBeenCalledWith('easy', expect.anything(), expect.any(Boolean));
      expect(stamps[0]! - start).toBe(1200);
      for (let i = 1; i < stamps.length; i++) expect(stamps[i]! - stamps[i - 1]!).toBe(400);
      expect(log.at(-1)).toBe('confirm');
    } finally {
      jest.useRealTimers();
    }
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

  it('stops at once on cancel and cancels the runner', async () => {
    jest.useFakeTimers();
    try {
      const store = botToRoll();
      const log: string[] = [];
      const runner = fakeRunner();
      const handle = startBotTurn({
        player: 'black',
        difficulty: 'easy',
        runner,
        rng: createSeededRng(9),
        getFlow: () => store.getState().flow,
        actions: actionsFor(store, log),
        timing: { beforeRollMs: 500, moveMs: 400, thinkMs: () => 600 },
      });
      await jest.advanceTimersByTimeAsync(800);
      expect(log).toEqual(['roll']);
      handle.cancel();
      await jest.advanceTimersByTimeAsync(5000);
      await handle.done;
      expect(log).toEqual(['roll']);
      expect(runner.cancels()).toBe(1);
      expect(jest.getTimerCount()).toBe(0);
      expect(store.getState().flow.game.phase).toBe('moving');
    } finally {
      jest.useRealTimers();
    }
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

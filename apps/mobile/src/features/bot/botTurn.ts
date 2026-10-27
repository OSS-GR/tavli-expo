/**
 * Plays the bot's turn in a local game (wireframe 6e).
 *
 * The bot never touches the store itself. It sends the same actions a
 * human sends (roll, move, confirm) through `BotTurnActions`, so the board
 * animates each move like a human move. The dice come from the flow's `Rng`.
 *
 * Order of one bot turn:
 * 1. wait `beforeRollMs`, then roll (a roll with no legal move passes by itself);
 * 2. ask the `BotRunner` for a turn and wait `thinkingDelayMs` at the same time;
 * 3. play the moves one by one, `moveMs` apart;
 * 4. confirm.
 *
 * `startBotTurn` returns a handle; `cancel()` stops the turn at the next
 * step (the user opened the menu or left the game).
 */
import { thinkingDelayMs } from '@tavli/bot';
import { isBotCancelled, type BotRunner, type Difficulty } from '@tavli/contracts';
import {
  VARIANT_REGISTRY,
  getVariant,
  matchPhase,
  sameMove,
  type MatchFlow,
  type Move,
  type PlayerId,
  type Rng,
} from '@tavli/engine';

/** What the bot may do. Each returns `false` when the engine refuses it. */
export interface BotTurnActions {
  roll: () => boolean;
  move: (move: Move) => boolean;
  undo: () => boolean;
  confirm: () => boolean;
}

export interface BotTiming {
  /** Pause before the bot rolls, so the turn change is easy to see. */
  readonly beforeRollMs: number;
  /** Time between two moves (wireframe: about 0.4 s each). */
  readonly moveMs: number;
  /** Think time before the first move. Default: `thinkingDelayMs` from the bot package. */
  readonly thinkMs?: (difficulty: Difficulty, rng: Rng, forced: boolean) => number;
}

export const BOT_TIMING: BotTiming = { beforeRollMs: 500, moveMs: 400 };

export interface BotTurnOptions {
  /** The bot's side. */
  readonly player: PlayerId;
  readonly difficulty: Difficulty;
  readonly runner: BotRunner;
  /** A UI RNG for think time and bot seeds. Never the dice RNG. */
  readonly rng: Rng;
  readonly getFlow: () => MatchFlow;
  readonly actions: BotTurnActions;
  readonly timing?: Partial<BotTiming>;
  /** A bot error that is not a cancel. The turn stops. */
  readonly onError?: (error: unknown) => void;
}

export type BotStep = 'roll' | 'play' | 'confirm';

/** What the bot should do now, or `null` when it is not the bot's move. Pure. */
export function botStep(flow: MatchFlow, player: PlayerId): BotStep | null {
  if (matchPhase(flow) !== 'playing') return null;
  const game = flow.game;
  if (game.state.toMove !== player) return null;
  switch (game.phase) {
    case 'awaiting-roll':
      return 'roll';
    case 'moving':
      return 'play';
    case 'awaiting-confirm':
      return 'confirm';
    default:
      // The opening roll is one tap for both dice (the human's tap).
      return null;
  }
}

export interface BotTurnHandle {
  /** Stops the turn. Timers are cleared and the runner request is cancelled. */
  cancel: () => void;
  /** Resolves when the turn is over, cancelled or failed. */
  readonly done: Promise<void>;
}

/** Starts the bot's part of the current turn. Does nothing when it is not the bot's move. */
export function startBotTurn(options: BotTurnOptions): BotTurnHandle {
  const { player, difficulty, runner, rng, getFlow, actions } = options;
  const timing = { ...BOT_TIMING, ...options.timing };
  const thinkMs = timing.thinkMs ?? ((d, r, forced) => thinkingDelayMs(d, r, { forced }));

  let cancelled = false;
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const wakers = new Set<() => void>();

  const sleep = (ms: number) =>
    new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        timers.delete(timer);
        wakers.delete(resolve);
        resolve();
      }, ms);
      timers.add(timer);
      wakers.add(resolve);
    });

  const play = async () => {
    const game = getFlow().game;
    const dice = game.state.dice;
    if (dice === null) return false;
    const forced =
      getVariant(VARIANT_REGISTRY, game.state.variant).legalTurns(game.state, dice).length === 1;
    const [turn] = await Promise.all([
      runner.chooseMove({
        variant: game.state.variant,
        state: game.state,
        dice,
        difficulty,
        seed: rng.nextUint32(),
      }),
      sleep(thinkMs(difficulty, rng, forced)),
    ]);
    if (cancelled) return false;

    // Moves already on the board (the turn was paused): keep them if they
    // start the bot's plan, else take them back.
    const played = getFlow().game.played;
    let next = played.length;
    const fits = played.every((move, i) => {
      const planned = turn.moves[i];
      return planned !== undefined && sameMove(move, planned);
    });
    if (!fits) {
      for (let i = 0; i < played.length; i++) actions.undo();
      next = 0;
    }
    for (const move of turn.moves.slice(next)) {
      if (cancelled) return false;
      if (!actions.move(move)) return false;
      await sleep(timing.moveMs);
    }
    return true;
  };

  const run = async () => {
    for (let guard = 0; guard < 4 && !cancelled; guard++) {
      const step = botStep(getFlow(), player);
      if (step === null) return;
      if (step === 'roll') {
        await sleep(timing.beforeRollMs);
        if (cancelled || !actions.roll()) return;
      } else if (step === 'play') {
        if (!(await play())) return;
      } else {
        actions.confirm();
        return;
      }
    }
  };

  const done = run().catch((error: unknown) => {
    if (cancelled || isBotCancelled(error)) return;
    options.onError?.(error);
  });

  return {
    done,
    cancel: () => {
      if (cancelled) return;
      cancelled = true;
      for (const timer of timers) clearTimeout(timer);
      timers.clear();
      // Let the waiting steps end; they see `cancelled` and stop.
      for (const wake of wakers) wake();
      wakers.clear();
      runner.cancel();
    },
  };
}

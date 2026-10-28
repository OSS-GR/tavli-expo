/**
 * The bot as an online player (#255), for the dev game vs the bot.
 *
 * The bot has its own transport and its own online store, like a second
 * phone. When the server waits for the bot's side (`view.waitingFor`), it
 * plays that view with `startBotTurn`: moves and undos stay in its store,
 * and confirm sends the whole turn. It follows `waitingFor` and the
 * question (`view.prompt`), never "the players take turns": an Asodio
 * turn can give the bot another roll. The server rolls, so the bot never
 * does.
 */
import type { BotRunner, Difficulty, GameTransport } from '@tavli/contracts';
import type { Rng } from '@tavli/engine';

import { startBotTurn, type BotTiming, type BotTurnHandle } from '@/features/bot/botTurn';

import { createOnlineStore, type OnlineStore } from './onlineStore';

export interface OnlineBotOptions {
  /** The bot's own transport: every call comes from the bot's player id. */
  readonly transport: GameTransport;
  readonly gameId: string;
  /** The bot's player id. */
  readonly botId: string;
  readonly difficulty: Difficulty;
  readonly runner: BotRunner;
  /** For think time and bot seeds. Never the dice (the server rolls). */
  readonly rng: Rng;
  /**
   * The bot's moves happen on its own store, out of sight: the other
   * phone sees the whole turn at once. Only the think time shows.
   */
  readonly timing?: Partial<BotTiming>;
  readonly onError?: (error: unknown) => void;
}

export interface OnlineBot {
  /** The bot's store (tests read it). */
  readonly store: OnlineStore;
  /** Stops the bot and its subscription. */
  stop: () => void;
}

/**
 * The bot sends a turn on one view at most this many times. Then it gives up on
 * that view and waits for a new one (the server's turn timer ends the
 * game if none comes), so a server that keeps refusing never makes it
 * loop.
 */
export const MAX_TRIES_PER_TURN = 3;

/** No pauses between the bot's moves: nobody sees them. */
const HIDDEN_MOVES: Partial<BotTiming> = {
  beforeRollMs: 0,
  afterRollMs: 0,
  doubleMs: 0,
  moveMs: 0,
  hitMs: 0,
  landMs: 0,
};

export function startOnlineBot(options: OnlineBotOptions): OnlineBot {
  const { transport, gameId, botId, difficulty, runner, rng } = options;
  const store = createOnlineStore({ transport, gameId, me: botId });
  let stopped = false;
  let turn: BotTurnHandle | null = null;
  /** The view version the bot plays now. A new version is a new turn. */
  let playing: number | null = null;
  /** How many turns the bot started on each view version. */
  const tries = new Map<number, number>();

  const check = () => {
    if (stopped) return;
    const { view, flow, side, sending, notice } = store.getState();
    if (notice !== null) {
      // The turn did not go through (stale, refused, not sent): play the
      // view again, up to MAX_TRIES_PER_TURN turns on one version.
      options.onError?.(new Error(`online bot: ${notice} (${store.getState().lastError ?? ''})`));
      playing = null;
      store.getState().clearNotice();
      return;
    }
    if (view === null || flow === null || side === null || sending) return;
    if (view.status === 'finished') {
      stop();
      return;
    }
    if (view.waitingFor !== side || playing === view.version) return;
    const tried = tries.get(view.version) ?? 0;
    if (tried >= MAX_TRIES_PER_TURN) {
      // Said once; then the bot waits for a newer view.
      if (tried === MAX_TRIES_PER_TURN) {
        options.onError?.(new Error(`online bot: gave up on version ${view.version}`));
        tries.set(view.version, tried + 1);
      }
      return;
    }
    for (const version of tries.keys()) if (version < view.version) tries.delete(version);
    tries.set(view.version, tried + 1);
    turn?.cancel();
    playing = view.version;
    const dispatch = store.getState().dispatch;
    turn = startBotTurn({
      player: side,
      difficulty,
      runner,
      rng,
      timing: { ...HIDDEN_MOVES, ...options.timing },
      getFlow: () => store.getState().flow ?? flow,
      actions: {
        roll: () => false,
        move: (move) => dispatch({ type: 'move', player: side, move }),
        undo: () => dispatch({ type: 'undo', player: side }),
        confirm: () => dispatch({ type: 'confirm', player: side }),
        answer: (choice) => dispatch({ type: 'answer', player: side, choice }),
      },
      ...(options.onError ? { onError: options.onError } : {}),
    });
  };

  const unsubscribe = store.subscribe(check);

  const stop = () => {
    if (stopped) return;
    stopped = true;
    turn?.cancel();
    unsubscribe();
    store.getState().dispose();
  };

  // The store may already wait for the bot.
  check();
  return { store, stop };
}

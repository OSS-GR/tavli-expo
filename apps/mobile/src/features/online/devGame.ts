/**
 * Dev builds only (#255): an online game vs the bot on the in-memory
 * server (`app/dev/online.tsx`). Online play waits for sign-in (#131), so
 * this is the way to try the online screen today.
 *
 * The bot plays through its own transport (`startOnlineBot`). The
 * in-memory server runs no timers, so the dev game calls
 * `runDueTimeouts()` every second: a turn timer that ran out ends that
 * game, as on the real server. One dev game runs at a time: a new one
 * stops the last one. A finished match stops by itself. The game also
 * stops when its board closes (nobody can open it again) or when the dev
 * screen closes.
 */
import { thinkingDelayMs } from '@tavli/bot';
import type { BotRunner, Difficulty, OnlineGameChoice, OnlineGamePace } from '@tavli/contracts';
import type { Rng } from '@tavli/engine';
import type { MemoryGameServer } from '@tavli/online';

import type { BotTiming } from '@/features/bot/botTurn';

import { startOnlineBot } from './onlineBot';

/** The bot's player id in a dev game. */
export const DEV_BOT_ID = 'bot';
/** How often the dev game runs the server's turn timers. */
export const DEV_TICK_MS = 1000;
/**
 * The bot thinks at least this long, so its dice land and stay on screen
 * for a moment before its whole turn arrives.
 */
export const DEV_BOT_MIN_THINK_MS = 1500;

export interface DevGameOptions {
  readonly server: MemoryGameServer;
  /** The player id of this phone. It plays White. */
  readonly me: string;
  readonly choice: OnlineGameChoice;
  readonly pace: OnlineGamePace;
  readonly targetPoints: number;
  readonly difficulty: Difficulty;
  readonly runner: BotRunner;
  readonly rng: Rng;
  /** For tests: faster bot timing. */
  readonly timing?: Partial<BotTiming>;
}

export interface DevGame {
  readonly gameId: string;
  stop: () => void;
}

let current: DevGame | null = null;

/** Starts a dev game and returns its id. The game before it stops. */
export function startDevGame(options: DevGameOptions): DevGame {
  current?.stop();
  const { server, me } = options;
  const gameId = server.createGame(
    me,
    { white: me, black: DEV_BOT_ID },
    options.choice,
    options.targetPoints,
    options.pace,
  );
  const bot = startOnlineBot({
    transport: server.transportFor(DEV_BOT_ID),
    gameId,
    botId: DEV_BOT_ID,
    difficulty: options.difficulty,
    runner: options.runner,
    rng: options.rng,
    timing: {
      thinkMs: (difficulty, rng, forced) =>
        Math.max(DEV_BOT_MIN_THINK_MS, thinkingDelayMs(difficulty, rng, { forced })),
      ...options.timing,
    },
    onError: (error) => console.warn('dev online bot', error),
  });
  const timer = setInterval(() => {
    server.runDueTimeouts();
    if (server.getGame(gameId)?.status === 'finished') game.stop();
  }, DEV_TICK_MS);
  const game: DevGame = {
    gameId,
    stop: () => {
      clearInterval(timer);
      bot.stop();
      if (current === game) current = null;
    },
  };
  current = game;
  return game;
}

/**
 * Stops the dev game `gameId` (its turn timers and its bot), when it is
 * the one that runs. Any other game goes on.
 */
export function stopDevGame(gameId: string): void {
  if (current?.gameId === gameId) current.stop();
}

/** Stops the running dev game, whatever its id. For the dev screen only. */
export function stopAnyDevGame(): void {
  current?.stop();
}

/** Is a dev game running (its timers and its bot)? */
export function devGameRunning(): boolean {
  return current !== null;
}

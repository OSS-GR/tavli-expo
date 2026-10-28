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
 *
 * A dev invite (#256) works the same way: the bot makes an invite, and
 * when this phone accepts it, the bot plays the new game (the bot is the
 * inviter, so it plays White). The invite stops when the dev screen
 * closes.
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

/** What the bot needs to play a dev game. */
export interface DevBotOptions {
  readonly server: MemoryGameServer;
  readonly difficulty: Difficulty;
  readonly runner: BotRunner;
  readonly rng: Rng;
  /** For tests: faster bot timing. */
  readonly timing?: Partial<BotTiming>;
}

/** The game the bot offers: in a dev game, or in a dev invite. */
export interface DevMatchOptions extends DevBotOptions {
  readonly choice: OnlineGameChoice;
  readonly pace: OnlineGamePace;
  readonly targetPoints: number;
}

export interface DevGameOptions extends DevMatchOptions {
  /** The player id of this phone. It plays White. */
  readonly me: string;
}

export interface DevGame {
  readonly gameId: string;
  stop: () => void;
}

/** The dev game or dev invite that runs now. A dev invite has no `gameId`. */
let current: { readonly gameId?: string; stop: () => void } | null = null;

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
  return playDevGame(gameId, options);
}

/** The bot plays its side of `gameId`, and the server's turn timers run. */
function playDevGame(gameId: string, options: DevBotOptions): DevGame {
  const { server } = options;
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

export interface DevInvite {
  /** The invite code, in capital letters. */
  readonly code: string;
  stop: () => void;
}

/**
 * The bot makes an invite (#256). Every `DEV_TICK_MS` the dev invite
 * looks at it: once it is accepted, the bot plays the new game; once it
 * is declined or expired, it stops. The game or invite before it stops.
 */
export function startDevInvite(options: DevMatchOptions): DevInvite {
  current?.stop();
  const { server } = options;
  const code = server.createInvite(DEV_BOT_ID, options.choice, options.targetPoints, options.pace);
  const timer = setInterval(() => {
    const view = server.getInvite(code);
    if (view?.status === 'open') return;
    invite.stop();
    // `playDevGame` becomes the running dev game.
    if (view?.status === 'accepted' && view.gameId !== null) playDevGame(view.gameId, options);
  }, DEV_TICK_MS);
  const invite: DevInvite = {
    code,
    stop: () => {
      clearInterval(timer);
      if (current === invite) current = null;
    },
  };
  current = invite;
  return invite;
}

/**
 * Stops the running dev game or dev invite, if any: its timers and its
 * bot. With `gameId`, only when the running game is that one (a dev invite
 * then keeps running).
 */
export function stopDevGame(gameId?: string): void {
  if (gameId === undefined || current?.gameId === gameId) current?.stop();
}

/** Is a dev game or dev invite running (its timers, and a game's bot)? */
export function devGameRunning(): boolean {
  return current !== null;
}

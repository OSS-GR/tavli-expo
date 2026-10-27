/**
 * `InlineBotRunner`: the `BotRunner` port, running the bot on the same
 * thread (MVP1). A worklet runner (off the UI thread) comes later.
 *
 * The bot starts in a microtask, not inside `chooseMove`. So the caller gets
 * the promise first, and a `cancel()` right after `chooseMove` stops the
 * request before the bot runs.
 */

import { BotCancelledError } from '@tavli/contracts';
import type { BotAnswerRequest, BotMoveRequest, BotRunner } from '@tavli/contracts';
import { createSeededRng } from '@tavli/engine';
import type { Turn } from '@tavli/engine';

import { createBot } from './create-bot';
import { BotError } from './errors';
import type { Bot, BotOptions } from './types';

/** Runs one request synchronously. Exported for runners that call the bot themselves. */
export function runBotRequest(bot: Bot, req: BotMoveRequest): Turn {
  if (req.variant !== req.state.variant) {
    throw new BotError(
      'INVALID_REQUEST',
      `the request is for "${req.variant}", the state is "${req.state.variant}"`,
    );
  }
  const opts: BotOptions = {
    rng: createSeededRng(req.seed),
    ...(req.timeBudgetMs === undefined ? {} : { timeBudgetMs: req.timeBudgetMs }),
  };
  return bot.chooseTurn(req.state, req.dice, req.difficulty, opts);
}

/**
 * Answers one question synchronously (`Bot.chooseAnswer`). Throws
 * `BotError('NOT_IMPLEMENTED')` for a bot without `chooseAnswer`.
 */
export function runBotAnswer(bot: Bot, req: BotAnswerRequest): string {
  if (req.variant !== req.state.variant) {
    throw new BotError(
      'INVALID_REQUEST',
      `the request is for "${req.variant}", the state is "${req.state.variant}"`,
    );
  }
  if (bot.chooseAnswer === undefined) {
    throw new BotError('NOT_IMPLEMENTED', 'this bot cannot answer questions');
  }
  return bot.chooseAnswer(req.state, req.difficulty, { rng: createSeededRng(req.seed) });
}

export class InlineBotRunner implements BotRunner {
  private readonly bot: Bot;
  /** The reject functions of requests that have not run yet. */
  private readonly pending = new Set<(error: Error) => void>();

  /** Default bot: `createBot()` (built-in variants and evaluators). */
  constructor(bot: Bot = createBot()) {
    this.bot = bot;
  }

  chooseMove(req: BotMoveRequest): Promise<Turn> {
    return this.run(() => runBotRequest(this.bot, req));
  }

  chooseAnswer(req: BotAnswerRequest): Promise<string> {
    return this.run(() => runBotAnswer(this.bot, req));
  }

  /** Runs `work` in a microtask, unless `cancel()` comes first. */
  private run<T>(work: () => T): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.pending.add(reject);
      void Promise.resolve().then(() => {
        // Gone from the set = cancelled. The promise is already rejected.
        if (!this.pending.delete(reject)) return;
        try {
          resolve(work());
        } catch (error) {
          reject(error);
        }
      });
    });
  }

  cancel(): void {
    const waiting = [...this.pending];
    this.pending.clear();
    for (const reject of waiting) reject(new BotCancelledError());
  }
}

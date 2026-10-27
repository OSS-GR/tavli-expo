/**
 * Plays the bot's turn in a local game (wireframe 6e).
 *
 * The bot never touches the store itself. It sends the same actions a
 * human sends (roll, move, confirm) through `BotTurnActions`, so the board
 * animates each move like a human move. The dice come from the flow's `Rng`.
 *
 * Order of one bot turn:
 * 0. Plakoto: if the engine asks the bot "resign or play on?" (its mother is
 *    pinned), ask the runner (`chooseAnswer`, or `botAnswer` for a runner
 *    without it), wait `beforeRollMs` and answer;
 * 1. wait `beforeRollMs`, then roll (a roll with no legal move passes by itself);
 * 2. ask the `BotRunner` for a turn and wait at the same time: the think time
 *    (`thinkingDelayMs`). Right after its own roll, never less than
 *    `afterRollMs`, so the dice land and the player can read them. Dice that
 *    were already there (the opening roll, a turn that goes on after the
 *    menu) get only the think time;
 * 3. play the moves one by one, `moveMs` apart, plus `hitMs` after a hit;
 * 4. after the last move wait `landMs` (and `HIT_DELAY_MS` more after a
 *    hit), so the checker lands, then confirm.
 *
 * The timings come from the Bot speed setting (`BOT_SPEED_TIMING` in
 * `botSpeed.ts`, #172).
 *
 * `startBotTurn` returns a handle; `cancel()` stops the turn at the next
 * step (the user opened the menu or left the game).
 */
import { thinkingDelayMs } from '@tavli/bot';
import { isBotCancelled, type BotRunner, type Difficulty } from '@tavli/contracts';
import {
  VARIANT_REGISTRY,
  currentPrompt,
  getVariant,
  matchPhase,
  sameMove,
  type MatchFlow,
  type Move,
  type PlayerId,
  type Rng,
  type VariantPrompt,
} from '@tavli/engine';

import { HIT_DELAY_MS } from '@/features/board/flights';

import { BOT_TIMING, type BotTiming } from './botSpeed';

export { BOT_SPEED_TIMING, BOT_TIMING, type BotTiming } from './botSpeed';

/** What the bot may do. Each returns `false` when the engine refuses it. */
export interface BotTurnActions {
  roll: () => boolean;
  move: (move: Move) => boolean;
  undo: () => boolean;
  confirm: () => boolean;
  /** Answers the variant's question (Plakoto: "resign or play on?"). */
  answer: (choice: string) => boolean;
}

/**
 * The answer for a runner without `chooseAnswer` (the port makes it
 * optional). Plakoto mother pinned: "play on".
 */
export function botAnswer(prompt: VariantPrompt): string {
  if (prompt.choices.includes('playOn')) return 'playOn';
  return prompt.choices[0] ?? '';
}

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

export type BotStep = 'answer' | 'roll' | 'play' | 'confirm';

/** What the bot should do now, or `null` when it is not the bot's move. Pure. */
export function botStep(flow: MatchFlow, player: PlayerId): BotStep | null {
  if (matchPhase(flow) !== 'playing') return null;
  const game = flow.game;
  // A question (Plakoto mother pinned) goes to the player it names.
  if (game.phase === 'awaiting-answer') {
    return currentPrompt(game)?.player === player ? 'answer' : null;
  }
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

  /** `rolled`: the bot rolled these dice just now, so they must stay on screen a moment. */
  const play = async (rolled: boolean) => {
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
      sleep(Math.max(thinkMs(difficulty, rng, forced), rolled ? timing.afterRollMs : 0)),
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
    const rest = turn.moves.slice(next);
    for (const [i, move] of rest.entries()) {
      if (cancelled) return false;
      if (!actions.move(move)) return false;
      const hit = move.capture === 'hit';
      // Between moves: the full gap. After the last one: only until it lands.
      const last = i === rest.length - 1;
      await sleep(
        last ? timing.landMs + (hit ? HIT_DELAY_MS : 0) : timing.moveMs + (hit ? timing.hitMs : 0),
      );
    }
    return true;
  };

  const run = async () => {
    // Did this call roll the dice? Then they get time on screen.
    let rolled = false;
    // At most: answer, roll, play, confirm.
    for (let guard = 0; guard < 5 && !cancelled; guard++) {
      const step = botStep(getFlow(), player);
      if (step === null) return;
      if (step === 'answer') {
        const game = getFlow().game;
        const prompt = currentPrompt(game);
        if (prompt === null) return;
        const [choice] = await Promise.all([
          runner.chooseAnswer
            ? runner.chooseAnswer({
                variant: game.state.variant,
                state: game.state,
                difficulty,
                seed: rng.nextUint32(),
              })
            : Promise.resolve(botAnswer(prompt)),
          sleep(timing.beforeRollMs),
        ]);
        if (cancelled) return;
        // A choice the question does not offer would stall the game: fall
        // back to the default answer, and report it if that fails too.
        const tries = [choice, botAnswer(prompt)].filter(
          (c, i, all) => prompt.choices.includes(c) && all.indexOf(c) === i,
        );
        if (!tries.some((c) => actions.answer(c))) {
          throw new Error(
            `the bot could not answer "${prompt.kind}" (got ${JSON.stringify(choice)})`,
          );
        }
      } else if (step === 'roll') {
        await sleep(timing.beforeRollMs);
        if (cancelled || !actions.roll()) return;
        rolled = true;
      } else if (step === 'play') {
        if (!(await play(rolled))) return;
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

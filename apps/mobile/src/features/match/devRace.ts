/**
 * Dev only: plays a vs-bot match forward until it is a race (no checker
 * can touch an opponent checker again) and you are to roll. The dev route
 * `/dev/race` uses it, so the owner and the Maestro flows
 * (`apps/mobile/.maestro/`) reach Fast forward without playing a whole
 * game first.
 *
 * Every step is a normal action on the store, so the match log is real:
 * it saves, replays and reviews like any other match. The dice come from
 * the store's RNG, and the bot picks the moves of both sides. This file
 * never checks a rule: `isRace` and the moves come from the engine.
 */
import type { BotRunner, Difficulty } from '@tavli/contracts';
import { PLAYERS, currentPrompt, isRace, matchPhase, type PlayerId, type Rng } from '@tavli/engine';

import { botAnswer } from '@/features/bot/botTurn';
import type { GameStore } from '@/features/game/gameStore';

export interface PlayToRaceOptions {
  readonly runner: BotRunner;
  /** Seeds for the bot's picks. Never the dice RNG. */
  readonly rng: Rng;
  /** The side that should be to roll in the race. Default: White (you, vs the bot). */
  readonly player?: PlayerId;
  /** The level that plays both sides. Default: medium. */
  readonly difficulty?: Difficulty;
  /** At most this many actions. Default: 3000. */
  readonly maxActions?: number;
}

/**
 * Plays on until the game on the board is a race with `player` to roll.
 * A game that ends first is followed by the next one. Returns `false` when
 * the match ended (or `maxActions` ran out) before a race came.
 */
export async function playToRace(store: GameStore, options: PlayToRaceOptions): Promise<boolean> {
  const { runner, rng, player = 'white', difficulty = 'medium', maxActions = 3000 } = options;
  const act = store.getState().dispatch;
  for (let step = 0; step < maxActions; step += 1) {
    const flow = store.getState().flow;
    const phase = matchPhase(flow);
    if (phase === 'match-over') return false;
    if (phase === 'game-over') {
      act({ type: 'nextGame' });
      continue;
    }
    const game = flow.game;
    const toMove = game.state.toMove;
    switch (game.phase) {
      case 'opening-roll': {
        const roller = PLAYERS.find((p) => game.opening?.[p] === null);
        if (game.opening === null || roller === undefined) {
          act({ type: 'chooseStarter', player });
        } else {
          act({ type: 'rollOpening', player: roller });
        }
        break;
      }
      case 'awaiting-roll':
        if (toMove === player && isRace(game.state)) return true;
        act({ type: 'roll', player: toMove });
        break;
      case 'awaiting-answer': {
        const prompt = currentPrompt(game);
        if (prompt === null) return false;
        act({ type: 'answer', player: prompt.player, choice: botAnswer(prompt) });
        break;
      }
      case 'awaiting-confirm':
        act({ type: 'confirm', player: toMove });
        break;
      case 'moving': {
        const dice = game.state.dice;
        if (dice === null) return false;
        const turn = await runner.chooseMove({
          variant: game.state.variant,
          state: game.state,
          dice,
          difficulty,
          seed: rng.nextUint32(),
        });
        for (const move of turn.moves) act({ type: 'move', player: toMove, move });
        act({ type: 'confirm', player: toMove });
        break;
      }
      case 'game-over':
        break;
    }
  }
  return false;
}

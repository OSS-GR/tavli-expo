/**
 * The time left on an online turn (#254). Pure.
 *
 * The server sets `turnDeadline` on its own clock. The phone clock can be
 * off, so the phone keeps an estimate of the difference:
 * `offset = server time - phone time`. Every save sets
 * `turnDeadline = save time + TURN_TIME_MS[pace]`, so a new version tells
 * us the server time of its save. See "Turn timers" in
 * `docs/architecture/online-game-service.md`.
 */
import { TURN_TIME_MS, type OnlineGameView } from '@tavli/contracts';

/**
 * The offset (server time - phone time) that a view gives when it arrives
 * at `localNow` just after its save. `null` when the view has no deadline
 * (the match is over). The network delay makes the estimate a little
 * low, so the phone shows a little more time than the server has.
 */
export function estimateOffset(
  view: Pick<OnlineGameView, 'turnDeadline' | 'pace'>,
  localNow: number,
): number | null {
  if (view.turnDeadline === null) return null;
  const savedAt = view.turnDeadline - TURN_TIME_MS[view.pace];
  return savedAt - localNow;
}

/**
 * The milliseconds left before `view.turnDeadline`, at phone time
 * `localNow`. Never below 0. `null` when the match is over (no deadline).
 */
export function timeLeft(
  view: Pick<OnlineGameView, 'turnDeadline'>,
  localNow: number,
  offset: number,
): number | null {
  if (view.turnDeadline === null) return null;
  return Math.max(0, view.turnDeadline - (localNow + offset));
}

/**
 * The app's turn notifications (#285): `createTurnPushes` on the services
 * of this build. `undefined` when online play is off (no Convex URL): then
 * the app never asks for the push permission and shows no Settings row.
 *
 * It is made on first use, and the ports it uses are made on their first
 * call (`onlineServices.ts`). The first calls are the offer after an async
 * invite, the Settings row, an online game and a tap on a push: nothing
 * at start, and no network call.
 */
import { auth, notifications, pushTokens, storage } from '@/services';

import { sendPushPermissionAnswered } from './pushAnalytics';
import { TURN_PUSHES_STORAGE_KEY, createTurnPushes, type TurnPushes } from './turnPushes';

function make(): TurnPushes | undefined {
  if (auth === undefined || notifications === undefined || pushTokens === undefined) {
    return undefined;
  }
  return createTurnPushes({
    storage,
    notifications,
    pushTokens,
    auth,
    onAnswer: (answer) => sendPushPermissionAnswered(answer),
  });
}

/** `null` until the first call. */
let instance: { readonly pushes: TurnPushes | undefined } | null = null;

/** The turn notifications of this app run, or `undefined` when online play is off. */
export function turnPushes(): TurnPushes | undefined {
  instance ??= { pushes: make() };
  return instance.pushes;
}

/**
 * Forgets the instance and the saved "Not now" (`test/afterEnv.ts`, before
 * each test): the next call makes a new one on the services of that moment.
 */
export function resetTurnPushesForTest(): void {
  instance?.pushes?.stop();
  instance = null;
  storage.remove(TURN_PUSHES_STORAGE_KEY);
}

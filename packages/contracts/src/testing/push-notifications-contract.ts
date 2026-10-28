/**
 * The `PushNotifications` and `PushTokens` port contracts (#285), as
 * plain async checks that work in any test runner (Vitest in packages,
 * Jest in the app).
 *
 *   for (const check of pushNotificationsContract()) {
 *     it(check.name, () => check.run(makeSubject()));
 *   }
 *
 * Make a new subject for each check. Its phone is a fake: it starts with
 * the permission `undetermined`, no tap and no listener. A check rejects
 * with an `Error` when the port breaks the contract. The checks never
 * wait on a clock: they call `subject.settle()` while they wait.
 */
import { isGameTransportErrorData } from '../game-transport';
import { isPushPermission } from '../push-notifications';
import type { PushNotifications, PushPermission, PushTap, PushTokens } from '../push-notifications';

export interface PushNotificationsContractSubject {
  /** The port under test, on a fake phone. */
  readonly notifications: PushNotifications;
  /** Sets what the fake phone allows. */
  readonly setSystem: (permission: PushPermission) => void;
  /** What the system prompt answers from now on. */
  readonly answerPrompt: (answer: 'granted' | 'denied') => void;
  /** How many times the system prompt showed. */
  readonly prompts: () => number;
  /** The push service gives the phone a new token. */
  readonly rollToken: () => void;
  /** The player taps a push with `data` while the app runs. */
  readonly tap: (data: Record<string, unknown>) => void;
  /** The player tapped a push with `data`, and the tap opened the app. */
  readonly openingTap: (data: Record<string, unknown>) => void;
  /** The same port on a phone where every native call fails. */
  readonly broken: PushNotifications;
  /** Lets the port deliver. Default: wait one microtask. Never wait on a real clock here. */
  readonly settle?: () => Promise<void>;
}

export interface PushNotificationsContractCheck {
  readonly name: string;
  readonly run: (subject: PushNotificationsContractSubject) => Promise<void>;
}

/** `settle()` calls that must pass with no change, to show that none comes. */
const SETTLES = 20;

function same(actual: unknown, expected: unknown, what: string): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${what}: expected ${e}, got ${a}`);
}

async function settleAll(subject: PushNotificationsContractSubject): Promise<void> {
  const settle = subject.settle ?? (() => Promise.resolve());
  for (let i = 0; i < SETTLES; i++) await settle();
}

/** Runs `call`; a rejection or a throw fails the check. */
async function noReject<T>(call: () => Promise<T>, what: string): Promise<T> {
  try {
    return await call();
  } catch (error) {
    throw new Error(`${what} rejected (${String(error)})`, { cause: error });
  }
}

async function permissionOf(
  call: () => Promise<PushPermission>,
  what: string,
): Promise<PushPermission> {
  const permission = await noReject(call, what);
  if (!isPushPermission(permission)) {
    throw new Error(`${what}: not a permission: ${JSON.stringify(permission)}`);
  }
  return permission;
}

function checkTap(tap: PushTap, what: string): void {
  if (typeof tap.id !== 'string' || tap.id === '') throw new Error(`${what}: the tap has no id`);
  same(JSON.parse(JSON.stringify(tap)), tap, `${what}: the tap is plain JSON`);
}

function checkToken(token: string | null, what: string): string {
  if (typeof token !== 'string' || token === '') {
    throw new Error(`${what}: expected a token, got ${JSON.stringify(token)}`);
  }
  return token;
}

export function pushNotificationsContract(): PushNotificationsContractCheck[] {
  return [
    {
      name: 'permission reads what the phone allows, with no prompt',
      run: async (subject) => {
        const { notifications } = subject;
        for (const state of ['undetermined', 'granted', 'denied'] as const) {
          subject.setSystem(state);
          same(await permissionOf(() => notifications.permission(), 'permission()'), state, state);
        }
        same(subject.prompts(), 0, 'prompts');
      },
    },
    {
      name: 'requestPermission shows the prompt while undetermined and gives the answer',
      run: async (subject) => {
        const { notifications } = subject;
        subject.answerPrompt('granted');
        same(await permissionOf(() => notifications.requestPermission(), 'ask'), 'granted', 'ask');
        same(subject.prompts(), 1, 'prompts after the first ask');
        same(
          await permissionOf(() => notifications.permission(), 'permission()'),
          'granted',
          'now',
        );
        same(
          await permissionOf(() => notifications.requestPermission(), 'ask'),
          'granted',
          'again',
        );
        same(subject.prompts(), 1, 'prompts after asking a granted phone');
      },
    },
    {
      name: 'a "no" to the prompt is denied, and asking again shows nothing',
      run: async (subject) => {
        const { notifications } = subject;
        subject.answerPrompt('denied');
        same(await permissionOf(() => notifications.requestPermission(), 'ask'), 'denied', 'ask');
        same(subject.prompts(), 1, 'prompts after the first ask');
        subject.setSystem('denied');
        same(await permissionOf(() => notifications.requestPermission(), 'ask'), 'denied', 'again');
        same(subject.prompts(), 1, 'prompts after asking a denied phone');
      },
    },
    {
      name: 'getToken is null until granted, then the same token each time',
      run: async (subject) => {
        const { notifications } = subject;
        same(await noReject(() => notifications.getToken(), 'getToken'), null, 'undetermined');
        subject.setSystem('denied');
        same(await noReject(() => notifications.getToken(), 'getToken'), null, 'denied');
        subject.setSystem('granted');
        const token = checkToken(await noReject(() => notifications.getToken(), 'getToken'), 'one');
        same(await noReject(() => notifications.getToken(), 'getToken'), token, 'the second token');
      },
    },
    {
      name: 'onTokenChange gives the new token, later, and nothing after stop',
      run: async (subject) => {
        const { notifications } = subject;
        subject.setSystem('granted');
        const first = checkToken(await notifications.getToken(), 'the first token');
        const got: string[] = [];
        const stop = notifications.onTokenChange((token) => got.push(token));
        same(got, [], 'tokens inside onTokenChange');
        subject.rollToken();
        same(got, [], 'tokens inside rollToken');
        await settleAll(subject);
        same(got.length, 1, 'tokens after a new token');
        const next = checkToken(got[0] ?? null, 'the new token');
        if (next === first) throw new Error('the new token is the old one');
        same(await notifications.getToken(), next, 'getToken after the change');
        stop();
        stop();
        subject.rollToken();
        await settleAll(subject);
        same(got.length, 1, 'tokens after stop');
      },
    },
    {
      name: 'onTap gives the game id of each tap, later, and nothing after stop',
      run: async (subject) => {
        const { notifications } = subject;
        const taps: PushTap[] = [];
        const stop = notifications.onTap((tap) => taps.push(tap));
        subject.tap({ gameId: 'game-1' });
        same(taps, [], 'taps inside tap');
        await settleAll(subject);
        subject.tap({});
        await settleAll(subject);
        subject.tap({ gameId: 7 });
        await settleAll(subject);
        same(
          taps.map((tap) => tap.gameId),
          ['game-1', null, null],
          'the game ids',
        );
        for (const tap of taps) checkTap(tap, 'onTap');
        same(new Set(taps.map((tap) => tap.id)).size, 3, 'different taps have different ids');
        stop();
        stop();
        subject.tap({ gameId: 'game-2' });
        await settleAll(subject);
        same(taps.length, 3, 'taps after stop');
      },
    },
    {
      name: 'lastTap gives the tap that opened the app, once',
      run: async (subject) => {
        const { notifications } = subject;
        same(await noReject(() => notifications.lastTap(), 'lastTap'), null, 'no tap');
        subject.openingTap({ gameId: 'game-3' });
        const tap = await noReject(() => notifications.lastTap(), 'lastTap');
        if (tap === null) throw new Error('lastTap: no tap after a tap opened the app');
        checkTap(tap, 'lastTap');
        same(tap.gameId, 'game-3', 'the game id');
        same(await notifications.lastTap(), null, 'lastTap a second time');
      },
    },
    {
      name: 'a phone with no notification system never rejects: denied, no token, no tap',
      run: async ({ broken }) => {
        same(await permissionOf(() => broken.permission(), 'permission()'), 'denied', 'permission');
        same(await permissionOf(() => broken.requestPermission(), 'ask'), 'denied', 'ask');
        same(await noReject(() => broken.getToken(), 'getToken'), null, 'getToken');
        same(await noReject(() => broken.lastTap(), 'lastTap'), null, 'lastTap');
        const stops = [broken.onTap(() => undefined), broken.onTokenChange(() => undefined)];
        for (const stop of stops) stop();
      },
    },
  ];
}

// ---------------------------------------------------------------------------
// PushTokens

export interface PushTokensContractSubject {
  /** The port of a signed-in player, or with nobody signed in (`null`). */
  readonly tokensFor: (player: 'me' | 'other' | null) => PushTokens;
  /** A valid Expo push token. Different `i`, different tokens. */
  readonly token: (i: number) => string;
  /** The tokens the server keeps for the player, any order. */
  readonly savedFor: (player: 'me' | 'other') => Promise<readonly string[]>;
}

export interface PushTokensContractCheck {
  readonly name: string;
  readonly run: (subject: PushTokensContractSubject) => Promise<void>;
}

async function rejection(call: Promise<unknown>, what: string): Promise<unknown> {
  return await call.then(
    () => {
      throw new Error(`${what} resolved`);
    },
    (error: unknown) => error,
  );
}

async function failsWith(call: Promise<unknown>, code: string, what: string): Promise<void> {
  const reason = await rejection(call, what);
  if (!isGameTransportErrorData(reason) || reason.code !== code) {
    throw new Error(`${what}: expected ${code}, got ${JSON.stringify(reason)}`);
  }
  same(JSON.parse(JSON.stringify(reason)), reason, `${what}: the error is plain JSON`);
}

function sorted(tokens: readonly string[]): string[] {
  return [...tokens].sort();
}

export function pushTokensContract(): PushTokensContractCheck[] {
  return [
    {
      name: 'register saves the token once, also when called again',
      run: async ({ tokensFor, token, savedFor }) => {
        const me = tokensFor('me');
        await me.register(token(1), 'ios');
        await me.register(token(1), 'ios');
        await me.register(token(2), 'android');
        same(sorted(await savedFor('me')), sorted([token(1), token(2)]), 'saved');
      },
    },
    {
      name: 'remove takes the token away; an unknown token is fine',
      run: async ({ tokensFor, token, savedFor }) => {
        const me = tokensFor('me');
        await me.register(token(1), 'ios');
        await me.remove(token(1));
        await me.remove(token(2));
        same(await savedFor('me'), [], 'saved');
      },
    },
    {
      name: 'a token of another player stays when I remove it, and moves to me when I register it',
      run: async ({ tokensFor, token, savedFor }) => {
        await tokensFor('other').register(token(1), 'android');
        await tokensFor('me').remove(token(1));
        same(await savedFor('other'), [token(1)], 'the other player after my remove');
        await tokensFor('me').register(token(1), 'android');
        same(await savedFor('me'), [token(1)], 'mine after my register');
        same(await savedFor('other'), [], 'the other player after my register');
      },
    },
    {
      name: 'with nobody signed in, both calls fail NOT_SIGNED_IN as plain data',
      run: async ({ tokensFor, token }) => {
        const nobody = tokensFor(null);
        await failsWith(nobody.register(token(1), 'ios'), 'NOT_SIGNED_IN', 'register');
        await failsWith(nobody.remove(token(1)), 'NOT_SIGNED_IN', 'remove');
      },
    },
    {
      name: 'a token that is not an Expo push token fails BAD_REQUEST',
      run: async ({ tokensFor, savedFor }) => {
        const me = tokensFor('me');
        await failsWith(me.register('not-a-token', 'ios'), 'BAD_REQUEST', 'register');
        await failsWith(me.remove('not-a-token'), 'BAD_REQUEST', 'remove');
        // The right shape, but longer than the 200 characters the server keeps.
        const long = `ExponentPushToken[${'x'.repeat(200)}]`;
        await failsWith(me.register(long, 'ios'), 'BAD_REQUEST', 'register a long token');
        same(await savedFor('me'), [], 'saved');
      },
    },
  ];
}

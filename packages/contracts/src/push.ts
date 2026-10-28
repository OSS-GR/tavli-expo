/**
 * The push port (#280, ADR-0004 point 7): the server sends a short note to
 * a player's phones, for example "Your turn" in an async game.
 *
 * Rules for every adapter:
 * - `send` never throws. A broken push service must not break the caller.
 *   Each message gets its own result, in the order of the messages.
 * - A message holds no names and no emails: only a fixed text and the
 *   game id (`data.gameId`), so the app can open the game on a tap.
 *
 * The Expo Push adapter is `@tavli/push-expo`. The recording provider
 * below is for tests. The contract checks are `pushProviderContract` in
 * `@tavli/contracts/testing`. See "Push" in
 * `docs/architecture/online-game-service.md`.
 */

/** One push to one device. Plain JSON. */
export interface PushMessage {
  /** The device's push token. */
  readonly to: string;
  readonly title: string;
  readonly body: string;
  /** What the app reads when the player taps the push. */
  readonly data: { readonly gameId: string };
}

/** Why a push failed. */
export const PUSH_ERROR_CODES = [
  /** The token is dead (the app was removed, or push was turned off). Delete it. */
  'DeviceNotRegistered',
  /** The message is too large. */
  'MessageTooBig',
  /** Too many pushes to this device. Try again later. */
  'MessageRateExceeded',
  /** The push service does not accept our credentials. */
  'InvalidCredentials',
  /** Anything else: the network, a server error, an answer we do not know. */
  'Failed',
] as const;

export type PushErrorCode = (typeof PUSH_ERROR_CODES)[number];

/** The result of one message. */
export type PushResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly error: PushErrorCode; readonly message: string };

export interface PushProvider {
  /**
   * Sends `messages`. Resolves with one result per message, in the same
   * order. Never rejects: a failed request gives `Failed` results.
   */
  send(messages: readonly PushMessage[]): Promise<readonly PushResult[]>;
}

export function isPushErrorCode(value: unknown): value is PushErrorCode {
  return typeof value === 'string' && (PUSH_ERROR_CODES as readonly string[]).includes(value);
}

export interface RecordingPushProvider extends PushProvider {
  /** Every message sent so far, in order. */
  readonly sent: readonly PushMessage[];
  /** From now on, a push to `token` answers `DeviceNotRegistered`. */
  kill(token: string): void;
  /**
   * From now on, a push to `token` fails with `error` (default `Failed`:
   * the network or a server error), until `revive(token)`.
   */
  fail(token: string, error?: PushErrorCode): void;
  /** A push to `token` answers `ok` again (after `kill` or `fail`). */
  revive(token: string): void;
  /** Forgets the sent messages. */
  clear(): void;
}

const ERROR_TEXT: Readonly<Record<PushErrorCode, string>> = {
  DeviceNotRegistered: 'the token is not registered',
  MessageTooBig: 'the message is too big',
  MessageRateExceeded: 'too many pushes to this device',
  InvalidCredentials: 'the credentials are not valid',
  Failed: 'the push failed',
};

/**
 * A push provider that only records what it sends. A token passed to
 * `kill` (or in `deadTokens`) answers `DeviceNotRegistered`, a token
 * passed to `fail` answers its error, and every other token answers `ok`.
 */
export function createRecordingPushProvider(
  deadTokens: readonly string[] = [],
): RecordingPushProvider {
  const failing = new Map<string, PushErrorCode>(
    deadTokens.map((token) => [token, 'DeviceNotRegistered']),
  );
  let sent: PushMessage[] = [];
  return {
    get sent() {
      return sent;
    },
    kill(token) {
      failing.set(token, 'DeviceNotRegistered');
    },
    fail(token, error = 'Failed') {
      failing.set(token, error);
    },
    revive(token) {
      failing.delete(token);
    },
    clear() {
      sent = [];
    },
    send(messages) {
      sent = [...sent, ...messages];
      return Promise.resolve(
        messages.map((message): PushResult => {
          const error = failing.get(message.to);
          return error === undefined
            ? { ok: true }
            : { ok: false, error, message: ERROR_TEXT[error] };
        }),
      );
    },
  };
}

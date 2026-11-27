/**
 * The `Chat` port on a Convex client (ADR-0011, #692): the chat of an
 * online game.
 *
 * It calls `getChat`, `sendChat`, `setChatMuted`, `myChatSettings` and
 * `setChatEnabled` in `apps/server/convex/chat.ts`. Like the other
 * adapters, no call carries the caller's id: the client sends the
 * sign-in token, and the server reads the caller from it (#131).
 * `ConvexClient` from `convex/browser` fits the client below; a test can
 * pass a fake.
 *
 * `getChat` is a Convex query, so `watch` follows it: the server sends a
 * new view after each message, mute, block or setting change. The text of
 * a message is never logged here.
 */
import { isChatErrorData } from '@tavli/contracts';
import type { Chat, ChatView } from '@tavli/contracts';

import { CHAT_FUNCTIONS } from './functions';
import type { ConvexInvitesClient } from './invites';
import { isConvexError } from './transport';

/** The Convex client calls the chat needs. `ConvexClient` has all three. */
export type ConvexChatClient = Pick<ConvexInvitesClient, 'query' | 'mutation' | 'onUpdate'>;

export interface ConvexChatOptions {
  readonly client: ConvexChatClient;
}

/**
 * A server error (`ConvexError` with `ChatErrorData`) becomes that data,
 * as plain JSON. Any other error (the network) stays as it is.
 */
export function toChatError(error: unknown): unknown {
  if (isConvexError(error) && isChatErrorData(error.data)) {
    return { code: error.data.code, message: error.data.message };
  }
  return error;
}

async function run<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (error) {
    throw toChatError(error);
  }
}

function copy<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function createConvexChat(options: ConvexChatOptions): Chat {
  const { client } = options;
  return {
    watch(gameId, onChat, onError) {
      let active = true;
      // Like `watchInvite`: never inside the call, never after the stop function.
      const later = (deliver: () => void) => {
        void Promise.resolve().then(() => {
          if (active) deliver();
        });
      };
      const stop = client.onUpdate(
        CHAT_FUNCTIONS.getChat,
        { gameId },
        (view: ChatView) => {
          later(() => onChat(copy(view)));
        },
        (error) => {
          const data = toChatError(error);
          // The port's `onError` takes chat errors. Convex tries the
          // network again by itself, so any other error is dropped.
          if (isChatErrorData(data)) later(() => onError?.(data));
        },
      );
      return () => {
        if (!active) return;
        active = false;
        stop();
      };
    },
    send: ({ gameId, text, phrase }) =>
      run(async () =>
        copy(
          await client.mutation(CHAT_FUNCTIONS.sendChat, {
            gameId,
            text,
            ...(phrase === undefined ? {} : { phrase }),
          }),
        ),
      ),
    setMuted: async (gameId, muted) => {
      await run(() => client.mutation(CHAT_FUNCTIONS.setChatMuted, { gameId, muted }));
    },
    settings: () => run(() => client.query(CHAT_FUNCTIONS.myChatSettings, {})),
    setEnabled: async (enabled) => {
      await run(() => client.mutation(CHAT_FUNCTIONS.setChatEnabled, { enabled }));
    },
  };
}

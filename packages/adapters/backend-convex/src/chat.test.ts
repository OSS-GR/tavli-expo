// The chat adapter on a fake Convex client: the names, the arguments, how
// errors map to the port, and the live view. The contract checks against
// the real Convex functions run in `apps/server`
// (`convex/convexChat.test.ts`).

import { ConvexError } from 'convex/values';
import { getFunctionName } from 'convex/server';
import { describe, expect, it } from 'vitest';

import type { ChatView } from '@tavli/contracts';

import { createConvexChat } from './chat';
import type { ConvexChatClient } from './chat';
import { CHAT_FUNCTION_NAMES } from './functions';

const MESSAGE = { id: 'm1', from: 'white', text: 'hi', sentAt: 5 } as const;

function fakeClient(answer: () => Promise<unknown> = () => Promise.resolve(null)) {
  const calls: { kind: string; name: string; args: unknown }[] = [];
  const watches: {
    onResult: (view: ChatView) => void;
    onError: (error: Error) => void;
    stopped: boolean;
  }[] = [];
  const client: ConvexChatClient = {
    query: (fn, args) => {
      calls.push({ kind: 'query', name: getFunctionName(fn), args });
      return answer() as never;
    },
    mutation: (fn, args) => {
      calls.push({ kind: 'mutation', name: getFunctionName(fn), args });
      return answer() as never;
    },
    onUpdate: (fn, args, onResult, onError) => {
      calls.push({ kind: 'watch', name: getFunctionName(fn), args });
      const watch = {
        onResult: onResult as (view: ChatView) => void,
        onError: (onError ?? (() => undefined)) as (error: Error) => void,
        stopped: false,
      };
      watches.push(watch);
      return () => {
        watch.stopped = true;
      };
    },
  };
  return { client, calls, watches };
}

/** Lets the adapter's microtasks run. */
async function flush() {
  for (let i = 0; i < 3; i += 1) await Promise.resolve();
}

describe('createConvexChat', () => {
  it('names the chat functions', () => {
    expect(CHAT_FUNCTION_NAMES).toEqual({
      getChat: 'chat:getChat',
      sendChat: 'chat:sendChat',
      setChatMuted: 'chat:setChatMuted',
      myChatSettings: 'chat:myChatSettings',
      setChatEnabled: 'chat:setChatEnabled',
    });
  });

  it('sends only the game and the text, never the caller', async () => {
    const { client, calls } = fakeClient(() => Promise.resolve(MESSAGE));
    const chat = createConvexChat({ client });
    await expect(chat.send({ gameId: 'g1', text: 'hi' })).resolves.toEqual(MESSAGE);
    await chat.setMuted('g1', true);
    await chat.settings();
    await chat.setEnabled(false);
    expect(calls).toEqual([
      { kind: 'mutation', name: 'chat:sendChat', args: { gameId: 'g1', text: 'hi' } },
      { kind: 'mutation', name: 'chat:setChatMuted', args: { gameId: 'g1', muted: true } },
      { kind: 'query', name: 'chat:myChatSettings', args: {} },
      { kind: 'mutation', name: 'chat:setChatEnabled', args: { enabled: false } },
    ]);
  });

  it('rejects with the server error data, as a plain object', async () => {
    const data = { code: 'TOO_FAST', message: 'too many messages: wait a moment' };
    const { client } = fakeClient(() => Promise.reject(new ConvexError(data)));
    const reason: unknown = await createConvexChat({ client })
      .send({ gameId: 'g1', text: 'hi' })
      .then(
        () => null,
        (error: unknown) => error,
      );
    expect(reason).toEqual(data);
    expect(reason).not.toBeInstanceOf(Error);
  });

  it('keeps any other error (the network) as it is', async () => {
    const network = new Error('offline');
    const { client } = fakeClient(() => Promise.reject(network));
    await expect(createConvexChat({ client }).settings()).rejects.toBe(network);
  });

  it('watches the chat query: views and chat errors, never after the stop', async () => {
    const { client, calls, watches } = fakeClient();
    const views: ChatView[] = [];
    const errors: unknown[] = [];
    const stop = createConvexChat({ client }).watch(
      'g1',
      (view) => views.push(view),
      (error) => errors.push(error),
    );
    expect(calls).toEqual([{ kind: 'watch', name: 'chat:getChat', args: { gameId: 'g1' } }]);
    const view: ChatView = { gameId: 'g1', status: 'open', messages: [MESSAGE] };
    watches[0]?.onResult(view);
    // Never inside the server's own call.
    expect(views).toEqual([]);
    await flush();
    expect(views).toEqual([view]);
    expect(views[0]).not.toBe(view);
    watches[0]?.onError(new ConvexError({ code: 'NOT_A_PLAYER', message: 'no' }));
    // An error that is not a chat error is dropped: Convex tries again itself.
    watches[0]?.onError(new Error('offline'));
    await flush();
    expect(errors).toEqual([{ code: 'NOT_A_PLAYER', message: 'no' }]);
    stop();
    expect(watches[0]?.stopped).toBe(true);
    watches[0]?.onResult(view);
    await flush();
    expect(views).toHaveLength(1);
  });
});

/**
 * The `Chat` port contract (ADR-0011, #692), as plain async checks that
 * work in any test runner (Vitest in packages, Jest in the app).
 *
 *   for (const check of chatContract()) {
 *     it(check.name, () => check.run(await makeSubject()));
 *   }
 *
 * Make a new subject for each check. A check rejects with an `Error` when
 * the adapter breaks the contract. The checks never wait on a real clock:
 * `advance` moves the server's clock.
 */
import {
  CHAT_MAX_LENGTH,
  CHAT_MESSAGES_PER_MINUTE,
  CHAT_RATE_WINDOW_MS,
  isChatErrorData,
} from '../chat';
import type { Chat, ChatErrorCode, ChatErrorData, ChatStatus, ChatView } from '../chat';
import type { Safety } from '../safety';

/**
 * Alice, Bob and Carol have a saved account, a username and the current
 * terms. Gil is a guest.
 */
export type ChatContractPlayer = 'alice' | 'bob' | 'carol' | 'gil';

export interface ChatContractSubject {
  /** The port as a signed-in player, or with nobody signed in (`null`). */
  readonly chatFor: (player: ChatContractPlayer | null) => Chat;
  readonly safetyFor: (player: ChatContractPlayer) => Safety;
  /** The player id of each player, as `Safety` takes it. */
  readonly idOf: (player: ChatContractPlayer) => string;
  /** A running game between Alice and Bob. Carol is not in it. */
  readonly gameId: string;
  /** A running game between Alice and Gil, the guest. */
  readonly guestGameId: string;
  /** Moves the server's clock forward. */
  readonly advance: (ms: number) => Promise<void>;
  /** Lets the server deliver what it owes (views to watchers). Never wait on a real clock here. */
  readonly settle: () => Promise<void>;
}

export interface ChatContractCheck {
  readonly name: string;
  readonly run: (subject: ChatContractSubject) => Promise<void>;
}

function check(ok: boolean, what: string): void {
  if (!ok) throw new Error(what);
}

/** JSON with the keys of each object sorted: servers may order keys their own way. */
function sortedJson(value: unknown): string {
  return JSON.stringify(value, (_key, inner: unknown) =>
    inner !== null && typeof inner === 'object' && !Array.isArray(inner)
      ? Object.fromEntries(
          Object.entries(inner as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)),
        )
      : inner,
  );
}

function same(actual: unknown, expected: unknown, what: string): void {
  const a = sortedJson(actual);
  const e = sortedJson(expected);
  if (a !== e) throw new Error(`${what}: expected ${e}, got ${a}`);
}

/** `call` rejects with plain `ChatErrorData` with `code`. */
async function failsWith(call: Promise<unknown>, code: ChatErrorCode, what: string): Promise<void> {
  const reason = await call.then(
    () => new Error(`${what}: expected a ${code} rejection, but the call resolved`),
    (error: unknown) => error,
  );
  if (reason instanceof Error) throw reason;
  if (!isChatErrorData(reason) || reason.code !== code) {
    throw new Error(`${what}: expected ${code}, got ${JSON.stringify(reason)}`);
  }
}

interface Watch {
  readonly views: ChatView[];
  readonly errors: ChatErrorData[];
  /** The newest view. Throws when none came. */
  readonly last: () => ChatView;
  readonly stop: () => void;
}

/** Follows a chat and waits for what the server owes. */
async function watch(
  subject: ChatContractSubject,
  player: ChatContractPlayer | null,
  gameId: string,
): Promise<Watch> {
  const views: ChatView[] = [];
  const errors: ChatErrorData[] = [];
  const stop = subject.chatFor(player).watch(
    gameId,
    (view) => views.push(view),
    (error) => errors.push(error),
  );
  await subject.settle();
  return {
    views,
    errors,
    last: () => {
      const view = views[views.length - 1];
      if (view === undefined) throw new Error(`${player ?? 'nobody'} got no chat view`);
      return view;
    },
    stop,
  };
}

/** What `player` sees of the chat now: the status and the texts. */
async function seenBy(
  subject: ChatContractSubject,
  player: ChatContractPlayer,
  gameId: string,
): Promise<{ status: ChatStatus; texts: string[] }> {
  const watching = await watch(subject, player, gameId);
  watching.stop();
  const view = watching.last();
  return { status: view.status, texts: view.messages.map((message) => message.text) };
}

export function chatContract(): ChatContractCheck[] {
  return [
    {
      name: 'a chat between two players who may chat starts open and empty',
      run: async (subject) => {
        for (const player of ['alice', 'bob'] as const) {
          const watching = await watch(subject, player, subject.gameId);
          same(
            watching.last(),
            { gameId: subject.gameId, status: 'open', messages: [] },
            `${player}'s first view`,
          );
          same(watching.errors, [], `${player}'s errors`);
          watching.stop();
        }
      },
    },
    {
      name: 'a message reaches both players, clean, in order, with its side',
      run: async (subject) => {
        const alice = await watch(subject, 'alice', subject.gameId);
        const bob = await watch(subject, 'bob', subject.gameId);
        const first = await subject.chatFor('alice').send({
          gameId: subject.gameId,
          text: '  good\n luck ',
        });
        same(first.text, 'good luck', 'the kept text');
        same(first.game, 1, 'a message of the first game of the match has game 1');
        same(first.phrase, undefined, 'a typed message is no ready phrase');
        await subject.advance(1000);
        const second = await subject
          .chatFor('bob')
          .send({ gameId: subject.gameId, text: 'you too' });
        await subject.settle();
        check(first.id !== second.id, 'two messages have two ids');
        same(second.phrase, undefined, 'a typed answer is no ready phrase');
        check(first.from !== second.from, 'the two players write from two sides');
        check(second.sentAt > first.sentAt, 'the later message has the later time');
        for (const watching of [alice, bob]) {
          same(watching.last().messages, [first, second], 'the messages, oldest first');
          watching.stop();
        }
      },
    },
    {
      name: 'a ready phrase keeps its id and its text for both players',
      run: async (subject) => {
        const alice = await watch(subject, 'alice', subject.gameId);
        const bob = await watch(subject, 'bob', subject.gameId);
        const sent = await subject
          .chatFor('alice')
          .send({ gameId: subject.gameId, text: 'Καλή τύχη!', phrase: 'goodLuck' });
        await subject.settle();
        same(sent.phrase, 'goodLuck', 'the phrase id');
        same(sent.text, 'Καλή τύχη!', "the text in the sender's language");
        for (const watching of [alice, bob]) {
          same(watching.last().messages, [sent], 'the phrase as both players get it');
          watching.stop();
        }
      },
    },
    {
      name: 'the server refuses an empty text, a long text, a link and a slur',
      run: async (subject) => {
        const chat = subject.chatFor('alice');
        const send = (text: string) => chat.send({ gameId: subject.gameId, text });
        await failsWith(send(' \n '), 'EMPTY', 'an empty text');
        await failsWith(send('a'.repeat(CHAT_MAX_LENGTH + 1)), 'TOO_LONG', 'a long text');
        await failsWith(send('see www.example.com'), 'LINK', 'a link');
        await failsWith(send('mail me a@example.com'), 'LINK', 'an email address');
        await failsWith(send('you faggot'), 'BAD_WORDS', 'a slur');
        // Ordinary swearing is allowed.
        await send('oh shit, nice roll');
        await send('a'.repeat(CHAT_MAX_LENGTH));
        same(
          (await seenBy(subject, 'bob', subject.gameId)).texts,
          ['oh shit, nice roll', 'a'.repeat(CHAT_MAX_LENGTH)],
          'only the allowed messages are kept',
        );
      },
    },
    {
      name: 'nobody signed in, a stranger and an unknown game are refused',
      run: async (subject) => {
        const text = 'hello';
        await failsWith(
          subject.chatFor(null).send({ gameId: subject.gameId, text }),
          'NOT_SIGNED_IN',
          'a send with no sign-in',
        );
        await failsWith(
          subject.chatFor(null).setMuted(subject.gameId, true),
          'NOT_SIGNED_IN',
          'a mute with no sign-in',
        );
        await failsWith(
          subject.chatFor(null).settings(),
          'NOT_SIGNED_IN',
          'settings with no sign-in',
        );
        await failsWith(
          subject.chatFor(null).setEnabled(false),
          'NOT_SIGNED_IN',
          'the switch with no sign-in',
        );
        await failsWith(
          subject.chatFor('carol').send({ gameId: subject.gameId, text }),
          'NOT_A_PLAYER',
          "a send in another pair's game",
        );
        await failsWith(
          subject.chatFor('carol').setMuted(subject.gameId, true),
          'NOT_A_PLAYER',
          "a mute of another pair's game",
        );
        const nobody = await watch(subject, null, subject.gameId);
        same(nobody.views, [], 'no view with no sign-in');
        same(
          nobody.errors.map((error) => error.code),
          ['NOT_SIGNED_IN'],
          'the watch error with no sign-in',
        );
        const stranger = await watch(subject, 'carol', subject.gameId);
        same(stranger.views, [], 'no view for a stranger');
        same(
          stranger.errors.map((error) => error.code),
          ['NOT_A_PLAYER'],
          "the stranger's watch error",
        );
        same((await seenBy(subject, 'alice', subject.gameId)).texts, [], 'nothing was kept');
      },
    },
    {
      name: 'a game with a guest has no chat for either player',
      run: async (subject) => {
        same(
          await seenBy(subject, 'gil', subject.guestGameId),
          { status: 'needs-account', texts: [] },
          'the guest',
        );
        same(
          await seenBy(subject, 'alice', subject.guestGameId),
          { status: 'unavailable', texts: [] },
          'the saved player',
        );
        for (const player of ['gil', 'alice'] as const) {
          await failsWith(
            subject.chatFor(player).send({ gameId: subject.guestGameId, text: 'hello' }),
            'CHAT_CLOSED',
            `${player}'s send`,
          );
        }
      },
    },
    {
      name: 'a mute hides one chat for the muter only, and an unmute shows it all again',
      run: async (subject) => {
        const { gameId } = subject;
        await subject.chatFor('bob').send({ gameId, text: 'one' });
        const alice = await watch(subject, 'alice', gameId);
        await subject.chatFor('alice').setMuted(gameId, true);
        await subject.settle();
        same(alice.last(), { gameId, status: 'muted', messages: [] }, "the muter's view");
        same((await seenBy(subject, 'bob', gameId)).status, 'open', 'the other player');
        await subject.advance(1000);
        await subject.chatFor('bob').send({ gameId, text: 'two' });
        await subject.settle();
        same(alice.last().messages, [], 'a muted chat stays empty');
        await failsWith(
          subject.chatFor('alice').send({ gameId, text: 'hi' }),
          'CHAT_CLOSED',
          "the muter's send",
        );
        // A second mute changes nothing.
        await subject.chatFor('alice').setMuted(gameId, true);
        await subject.chatFor('alice').setMuted(gameId, false);
        await subject.settle();
        same(alice.last().status, 'open', 'after the unmute');
        same(
          alice.last().messages.map((message) => message.text),
          ['one', 'two'],
          'the messages after the unmute',
        );
        alice.stop();
      },
    },
    {
      name: 'the switch turns chat off in all games of the player, for both players',
      run: async (subject) => {
        const { gameId } = subject;
        same(await subject.chatFor('alice').settings(), { enabled: true }, 'the first settings');
        await subject.chatFor('bob').send({ gameId, text: 'one' });
        const bob = await watch(subject, 'bob', gameId);
        await subject.chatFor('alice').setEnabled(false);
        await subject.settle();
        same(await subject.chatFor('alice').settings(), { enabled: false }, 'the settings after');
        same(await subject.chatFor('bob').settings(), { enabled: true }, "the other's settings");
        same(
          await seenBy(subject, 'alice', gameId),
          { status: 'turned-off', texts: [] },
          'the player who turned it off',
        );
        same(bob.last(), { gameId, status: 'unavailable', messages: [] }, 'the other player');
        await failsWith(
          subject.chatFor('bob').send({ gameId, text: 'two' }),
          'CHAT_CLOSED',
          "the other player's send",
        );
        await subject.chatFor('alice').setEnabled(true);
        await subject.settle();
        same(bob.last().status, 'open', 'after the switch is on again');
        same(
          bob.last().messages.map((message) => message.text),
          ['one'],
          'the old messages',
        );
        bob.stop();
      },
    },
    {
      name: 'a block closes the chat for the blocker, and the blocked player is not told',
      run: async (subject) => {
        const { gameId } = subject;
        await subject.chatFor('bob').send({ gameId, text: 'before' });
        const alice = await watch(subject, 'alice', gameId);
        const bob = await watch(subject, 'bob', gameId);
        await subject.safetyFor('alice').block(subject.idOf('bob'));
        await subject.settle();
        same(alice.last(), { gameId, status: 'unavailable', messages: [] }, "the blocker's view");
        same(bob.last().status, 'open', "the blocked player's status");
        await subject.advance(1000);
        // The blocked player's send resolves, and only they see it.
        await subject.chatFor('bob').send({ gameId, text: 'after' });
        await subject.settle();
        same(
          bob.last().messages.map((message) => message.text),
          ['before', 'after'],
          'what the blocked player sees',
        );
        same(alice.last().messages, [], 'the blocker sees nothing');
        await failsWith(
          subject.chatFor('alice').send({ gameId, text: 'hi' }),
          'CHAT_CLOSED',
          "the blocker's send",
        );
        await subject.safetyFor('alice').unblock(subject.idOf('bob'));
        await subject.settle();
        same(alice.last().status, 'open', 'after the unblock');
        same(
          alice.last().messages.map((message) => message.text),
          ['before'],
          'a message sent during the block stays hidden',
        );
        alice.stop();
        bob.stop();
      },
    },
    {
      name: 'a player sends at most CHAT_MESSAGES_PER_MINUTE in a minute',
      run: async (subject) => {
        const { gameId } = subject;
        const chat = subject.chatFor('alice');
        for (let i = 0; i < CHAT_MESSAGES_PER_MINUTE; i += 1) {
          await chat.send({ gameId, text: `message ${i}` });
        }
        await failsWith(chat.send({ gameId, text: 'one more' }), 'TOO_FAST', 'the next send');
        // The other player has their own count.
        await subject.chatFor('bob').send({ gameId, text: 'slow down' });
        await subject.advance(CHAT_RATE_WINDOW_MS);
        await chat.send({ gameId, text: 'after the wait' });
        same(
          (await seenBy(subject, 'bob', gameId)).texts.length,
          CHAT_MESSAGES_PER_MINUTE + 2,
          'the kept messages',
        );
      },
    },
    {
      name: 'the stop function ends the views',
      run: async (subject) => {
        const { gameId } = subject;
        const alice = await watch(subject, 'alice', gameId);
        const before = alice.views.length;
        alice.stop();
        await subject.chatFor('bob').send({ gameId, text: 'anyone?' });
        await subject.settle();
        same(alice.views.length, before, 'views after the stop');
      },
    },
  ];
}

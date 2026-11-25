// The chat on the online game screen (ADR-0011, #692): the chat button
// and its dot, the sheet (rules once, messages, the text field, refusals),
// mute, the "chat needs…" cards, and a report from the chat.

import { TERMS_VERSION } from '@tavli/contracts';
import { createSeededRng } from '@tavli/engine';
import { createMemoryGameServer, type MemoryGameServer } from '@tavli/online';
import { markNamed } from '@tavli/online/testing';
import { act, screen } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';

import { OnlineMatchScreen } from '@/features/online/OnlineMatchScreen';
import { storage } from '@/services';

import { CHAT_RULES_STORAGE_KEY, CHAT_SEEN_STORAGE_KEY } from './chatSeen';

import { runOnFakeTimers, setupUser } from '../../../test/clock';
import { renderWithRoot } from '../../../test/render';

runOnFakeTimers();

beforeEach(() => {
  // A new phone: nothing read, the rules not seen.
  storage.remove(CHAT_SEEN_STORAGE_KEY);
  storage.remove(CHAT_RULES_STORAGE_KEY);
});

interface Opened {
  readonly server: MemoryGameServer;
  readonly gameId: string;
  readonly onChatFix: jest.Mock;
  readonly onSettings: jest.Mock;
}

/** A game of `me` (White) vs `bob` on its own in-memory server, on the screen. */
async function openGame(
  options: { readonly meNamed?: boolean; readonly bobNamed?: boolean } = {},
): Promise<Opened> {
  const server = createMemoryGameServer({ rng: createSeededRng(21), now: () => Date.now() });
  if (options.meNamed !== false) await markNamed(server, 'me');
  if (options.bobNamed !== false) await markNamed(server, 'bob');
  const gameId = server.createGame('me', { white: 'me', black: 'bob' }, 'portes', 3, null);
  const onChatFix = jest.fn();
  const onSettings = jest.fn();
  await renderWithRoot(
    <OnlineMatchScreen
      gameId={gameId}
      transport={server.transportFor('me')}
      safety={server.safetyFor('me')}
      chat={server.chatFor('me')}
      onChatFix={onChatFix}
      me="me"
      onExit={jest.fn()}
      onSettings={onSettings}
      onRules={jest.fn()}
      onMatchOver={jest.fn()}
    />,
  );
  await screen.findByTestId('game-board', { includeHiddenElements: true });
  return { server, gameId, onChatFix, onSettings };
}

/** Lets the server's answers reach the screen. */
async function settle() {
  await act(async () => {
    jest.advanceTimersByTime(50);
    await Promise.resolve();
  });
}

const button = () => screen.findByTestId('chat-button', { includeHiddenElements: true });
const dot = () => screen.queryByTestId('chat-unread', { includeHiddenElements: true });

describe('the chat of an online game', () => {
  it('shows the rules once, then sends a message and shows it', async () => {
    const user = setupUser();
    const { server, gameId } = await openGame();
    await user.press(await button());
    expect(await screen.findByTestId('chat-rules')).toBeTruthy();
    // No text field before the rules are read.
    expect(screen.queryByTestId('chat-input')).toBeNull();
    await user.press(screen.getByTestId('chat-rules-ok'));
    expect(await screen.findByTestId('chat-empty')).toBeTruthy();
    expect(storage.getString(CHAT_RULES_STORAGE_KEY)).toBe('1');

    await user.type(screen.getByTestId('chat-input'), 'good luck');
    await user.press(screen.getByTestId('chat-send'));
    await settle();
    expect(await screen.findByText('good luck')).toBeTruthy();
    // The field is empty again, and the other player has the message.
    expect(screen.getByTestId('chat-input').props.value).toBe('');
    const seen: string[] = [];
    server.chatFor('bob').watch(gameId, (view) => seen.push(...view.messages.map((m) => m.text)));
    await settle();
    expect(seen).toEqual(['good luck']);
  });

  it('keeps the text and says why when the server refuses a message', async () => {
    storage.setString(CHAT_RULES_STORAGE_KEY, '1');
    const user = setupUser();
    await openGame();
    await user.press(await button());
    await user.type(await screen.findByTestId('chat-input'), 'see www.example.com');
    await user.press(screen.getByTestId('chat-send'));
    await settle();
    expect((await screen.findByTestId('chat-problem')).props.children).toBe(
      'Messages cannot hold links or email addresses.',
    );
    expect(screen.getByTestId('chat-input').props.value).toBe('see www.example.com');
    expect(screen.queryByTestId('chat-messages')).toBeNull();
    // Typing again clears the problem.
    await user.type(screen.getByTestId('chat-input'), '!');
    expect(screen.queryByTestId('chat-problem')).toBeNull();
  });

  it('shows a dot for a new message, and an open chat reads it', async () => {
    storage.setString(CHAT_RULES_STORAGE_KEY, '1');
    const user = setupUser();
    const { server, gameId } = await openGame();
    await button();
    expect(dot()).toBeNull();
    await act(async () => {
      await server.chatFor('bob').send({ gameId, text: 'hello there' });
    });
    await settle();
    expect(dot()).not.toBeNull();
    expect((await button()).props.accessibilityLabel).toBe('Chat with U_bob, 1 new message');
    await user.press(await button());
    expect(await screen.findByText('hello there')).toBeTruthy();
    await user.press(screen.getByTestId('chat-close'));
    await settle();
    expect(dot()).toBeNull();
    // The phone keeps what was read.
    expect(JSON.parse(storage.getString(CHAT_SEEN_STORAGE_KEY) ?? '{}')).toHaveProperty(gameId);
  });

  it('keeps the typed text while Report or block is open', async () => {
    storage.setString(CHAT_RULES_STORAGE_KEY, '1');
    const user = setupUser();
    await openGame();
    await user.press(await button());
    await user.type(await screen.findByTestId('chat-input'), 'half a thought');
    await user.press(screen.getByTestId('chat-report'));
    await user.press(await screen.findByTestId('safety-cancel'));
    await user.press(await button());
    expect((await screen.findByTestId('chat-input')).props.value).toBe('half a thought');
  });

  it('does not read old messages to screen readers when the screen opens', async () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
    const server = createMemoryGameServer({ rng: createSeededRng(21), now: () => Date.now() });
    await markNamed(server, 'me');
    await markNamed(server, 'bob');
    const gameId = server.createGame('me', { white: 'me', black: 'bob' }, 'portes', 3, null);
    await server.chatFor('bob').send({ gameId, text: 'from yesterday' });
    await renderWithRoot(
      <OnlineMatchScreen
        gameId={gameId}
        transport={server.transportFor('me')}
        chat={server.chatFor('me')}
        me="me"
        onExit={jest.fn()}
        onSettings={jest.fn()}
        onRules={jest.fn()}
        onMatchOver={jest.fn()}
      />,
    );
    await button();
    await settle();
    // The dot still shows it as unread; it is only not read aloud.
    expect(dot()).not.toBeNull();
    expect(announce.mock.calls.map(([text]) => text).join('|')).not.toContain('from yesterday');
    announce.mockRestore();
  });

  it('reads a new message to screen readers once, with the name', async () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
    const { server, gameId } = await openGame();
    await button();
    await act(async () => {
      await server.chatFor('bob').send({ gameId, text: 'your turn!' });
    });
    await settle();
    await settle();
    const said = announce.mock.calls.map(([text]) => text);
    expect(said.filter((text) => text === 'U_bob wrote: your turn!')).toHaveLength(1);
    // Your own message is not read back to you.
    await act(async () => {
      await server.chatFor('me').send({ gameId, text: 'I know' });
    });
    await settle();
    expect(announce.mock.calls.map(([text]) => text).join('|')).not.toContain('I know');
    announce.mockRestore();
  });

  it('mutes and shows the chat again', async () => {
    storage.setString(CHAT_RULES_STORAGE_KEY, '1');
    const user = setupUser();
    const { server, gameId } = await openGame();
    await act(async () => {
      await server.chatFor('bob').send({ gameId, text: 'hello' });
    });
    await user.press(await button());
    await user.press(await screen.findByTestId('chat-mute'));
    await settle();
    expect(await screen.findByTestId('chat-status-muted')).toBeTruthy();
    expect(screen.queryByText('hello')).toBeNull();
    expect(screen.queryByTestId('chat-input')).toBeNull();
    await user.press(screen.getByTestId('chat-unmute'));
    await settle();
    expect(await screen.findByText('hello')).toBeTruthy();
  });

  it('has no chat button when the other player cannot chat', async () => {
    await openGame({ bobNamed: false });
    await settle();
    expect(screen.queryByTestId('chat-button', { includeHiddenElements: true })).toBeNull();
  });

  it('tells a guest what chat needs, and opens the way to it', async () => {
    const user = setupUser();
    const { onChatFix } = await openGame({ meNamed: false });
    await user.press(await button());
    expect(await screen.findByTestId('chat-status-needs-account')).toBeTruthy();
    expect(screen.queryByTestId('chat-input')).toBeNull();
    await user.press(screen.getByTestId('chat-fix'));
    expect(onChatFix).toHaveBeenCalledWith('needs-account');
  });

  it('accepts new terms in place, and the chat opens', async () => {
    storage.setString(CHAT_RULES_STORAGE_KEY, '1');
    const user = setupUser();
    const server = createMemoryGameServer({ rng: createSeededRng(21), now: () => Date.now() });
    await markNamed(server, 'bob');
    // `me` has a username with older terms: as after a new terms version.
    server.markSaved('me');
    const usernames = server.usernamesFor('me', true);
    const accepted: string[] = [];
    const gameId = server.createGame('me', { white: 'me', black: 'bob' }, 'portes', 3, null);
    await renderWithRoot(
      <OnlineMatchScreen
        gameId={gameId}
        transport={server.transportFor('me')}
        chat={{
          ...server.chatFor('me'),
          // The server's view says `needs-username` for a player with no
          // name; this test acts the `needs-terms` view and then lets the
          // real view through once the terms are in.
          watch: (id, onChat, onError) =>
            server
              .chatFor('me')
              .watch(
                id,
                (view) =>
                  onChat(
                    accepted.length === 0 ? { ...view, status: 'needs-terms', messages: [] } : view,
                  ),
                onError,
              ),
        }}
        usernames={{
          mine: async () => ({ ...(await usernames.mine()), name: 'Me_Player' }),
          setMine: async (request) => {
            accepted.push(request.acceptTerms ?? '');
            const mine = await usernames.setMine({ ...request, ageChecked: true });
            return mine;
          },
        }}
        me="me"
        onExit={jest.fn()}
        onSettings={jest.fn()}
        onRules={jest.fn()}
        onMatchOver={jest.fn()}
      />,
    );
    await screen.findByTestId('game-board', { includeHiddenElements: true });
    await user.press(await button());
    expect(await screen.findByTestId('chat-status-needs-terms')).toBeTruthy();
    // No trip to another screen: the card has its own Accept.
    expect(screen.queryByTestId('chat-fix')).toBeNull();
    await user.press(screen.getByTestId('chat-terms-accept'));
    await settle();
    expect(accepted).toEqual([TERMS_VERSION]);
    expect(await screen.findByTestId('chat-input')).toBeTruthy();
  });

  it('tells a player who turned chat off, and opens Settings', async () => {
    const user = setupUser();
    const { server, onSettings } = await openGame();
    await act(async () => {
      await server.chatFor('me').setEnabled(false);
    });
    await user.press(await button());
    expect(await screen.findByTestId('chat-status-turned-off')).toBeTruthy();
    await user.press(screen.getByTestId('chat-settings'));
    expect(onSettings).toHaveBeenCalled();
  });

  it('a report from the chat offers the chat reason first and keeps the messages', async () => {
    storage.setString(CHAT_RULES_STORAGE_KEY, '1');
    const user = setupUser();
    const { server, gameId } = await openGame();
    await act(async () => {
      await server.chatFor('bob').send({ gameId, text: 'rude words' });
    });
    await user.press(await button());
    await user.press(await screen.findByTestId('chat-report'));
    await user.press(await screen.findByTestId('safety-report'));
    const reasons = await screen.findByTestId('safety-reasons');
    expect(reasons).toBeTruthy();
    await user.press(screen.getByTestId('safety-reason-chat'));
    await settle();
    expect(server.reportsOf()).toMatchObject([
      { reporterId: 'me', reportedId: 'bob', reason: 'chat', chat: [{ text: 'rude words' }] },
    ]);
  });

  it('the report dialog from the menu has no chat reason', async () => {
    const user = setupUser();
    await openGame();
    await user.press(await screen.findByTestId('menu-button', { includeHiddenElements: true }));
    await user.press(await screen.findByTestId('menu-report-block'));
    await user.press(await screen.findByTestId('safety-report'));
    await screen.findByTestId('safety-reasons');
    expect(screen.queryByTestId('safety-reason-chat')).toBeNull();
    expect(screen.getByTestId('safety-reason-name')).toBeTruthy();
  });
});

// Settings → Online → "Chat in online games" (#692): the row loads the
// switch, changes it on the server, and says so when the call fails.

import type { Chat } from '@tavli/contracts';
import { createSeededRng } from '@tavli/engine';
import { createMemoryGameServer } from '@tavli/online';
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { ChatSettingRow } from './ChatSettingRow';

/** Lets the port's answers reach the row. */
async function settle() {
  await act(async () => {
    for (let i = 0; i < 5; i += 1) await Promise.resolve();
  });
}

describe('ChatSettingRow', () => {
  it('shows the switch as the server has it, and changes it there', async () => {
    const server = createMemoryGameServer({ rng: createSeededRng(1), now: () => 0 });
    const chat = server.chatFor('me');
    await render(<ChatSettingRow chat={chat} visit={0} />);
    await settle();
    const row = screen.getByTestId('settings-chat');
    expect(row.props.accessibilityState).toMatchObject({ checked: true });
    await act(async () => {
      fireEvent(row, 'valueChange', false);
    });
    await settle();
    expect(await chat.settings()).toEqual({ enabled: false });
    expect(screen.getByTestId('settings-chat').props.accessibilityState).toMatchObject({
      checked: false,
    });
  });

  it('shows no row when the setting does not load', async () => {
    const chat: Chat = {
      watch: () => () => undefined,
      send: () => Promise.reject(new Error('offline')),
      setMuted: () => Promise.reject(new Error('offline')),
      settings: () => Promise.reject(new Error('offline')),
      setEnabled: () => Promise.reject(new Error('offline')),
    };
    await render(<ChatSettingRow chat={chat} visit={0} />);
    await settle();
    expect(screen.queryByTestId('settings-chat')).toBeNull();
  });

  it('keeps the switch and opens the problem popup when the change fails', async () => {
    const chat: Chat = {
      watch: () => () => undefined,
      send: () => Promise.reject(new Error('offline')),
      setMuted: () => Promise.reject(new Error('offline')),
      settings: () => Promise.resolve({ enabled: true }),
      setEnabled: () => Promise.reject(new Error('offline')),
    };
    await render(<ChatSettingRow chat={chat} visit={0} />);
    await settle();
    await act(async () => {
      fireEvent(screen.getByTestId('settings-chat'), 'valueChange', false);
    });
    await settle();
    expect(screen.getByTestId('settings-chat').props.accessibilityState).toMatchObject({
      checked: true,
    });
    expect(await screen.findByTestId('settings-chat-problem')).toBeTruthy();
  });
});

/**
 * The chat of one online game, live (ADR-0011, #692): one `Chat.watch`
 * per game screen. `view` is `null` until the first view comes, and stays
 * `null` with no `chat` (the build has none) or after a watch error (the
 * chat button then does not show).
 *
 * Nothing here goes to analytics or the logs.
 */
import type { Chat, ChatView } from '@tavli/contracts';
import { useEffect, useState } from 'react';

export function useChat(chat: Chat | undefined, gameId: string): ChatView | null {
  const [view, setView] = useState<ChatView | null>(null);
  useEffect(() => {
    if (chat === undefined) return undefined;
    const stop = chat.watch(
      gameId,
      (next) => setView(next),
      () => setView(null),
    );
    return () => {
      stop();
      setView(null);
    };
  }, [chat, gameId]);
  return view;
}

/** True when the game has a chat to offer to this player: every status but "no chat here". */
export function chatOffered(view: ChatView | null): view is ChatView {
  return view !== null && view.status !== 'unavailable';
}

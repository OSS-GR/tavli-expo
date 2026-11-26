/**
 * The chat of one online game, live (ADR-0011, #692): one `Chat.watch`
 * per game screen. `view` is `null` until the first view comes, and stays
 * `null` with no `chat` (the build has none) or after a watch error (the
 * chat button then does not show).
 *
 * Nothing here goes to analytics or the logs.
 */
import type { Chat, ChatStatus, ChatView } from '@tavli/contracts';
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

/**
 * What the chat's header and its content share (chat v2, #711): the "…"
 * menu, and the chat rules when the player asks for them again. The
 * header sits over the scrolling messages, so the two are apart.
 */
export interface ChatPanel {
  readonly menuOpen: boolean;
  /** The player asked for the chat rules from the menu. */
  readonly rulesAsked: boolean;
  toggleMenu(): void;
  closeMenu(): void;
  askRules(): void;
  rulesDone(): void;
}

/**
 * `open`: the chat shows. A chat that closes forgets the menu and the
 * asked rules; a chat that is no longer `open` (muted) forgets the rules.
 */
export function useChatPanel(open: boolean, status: ChatStatus | undefined): ChatPanel {
  const [menuOpen, setMenuOpen] = useState(false);
  const [rulesAsked, setRulesAsked] = useState(false);
  if (!open && menuOpen) setMenuOpen(false);
  if ((!open || status !== 'open') && rulesAsked) setRulesAsked(false);
  return {
    menuOpen,
    rulesAsked,
    toggleMenu: () => setMenuOpen((was) => !was),
    closeMenu: () => setMenuOpen(false),
    askRules: () => {
      setMenuOpen(false);
      setRulesAsked(true);
    },
    rulesDone: () => setRulesAsked(false),
  };
}

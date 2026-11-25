/**
 * What this phone has read in each chat (ADR-0011, #692), saved through
 * the `Storage` port under `CHAT_SEEN_STORAGE_KEY`. The chat button shows
 * a dot while the other player wrote something newer (`unreadCount`).
 *
 * The saved value maps a game id to the time of the newest message read.
 * It holds no text and no name. It never leaves the phone and never goes
 * to analytics. A storage error is no problem: the dot is only a nudge.
 */
import type { ChatView, Storage } from '@tavli/contracts';
import type { PlayerId } from '@tavli/engine';

import { storage as appStorage } from '@/services';

/** Storage key. The saved value is JSON: `{ [gameId]: sentAt }`. */
export const CHAT_SEEN_STORAGE_KEY = 'chatSeen';

/** Storage key of the chat rules step: `1` once the player read them. */
export const CHAT_RULES_STORAGE_KEY = 'chatRulesSeen';

/** The most games kept. The oldest reads go first. */
const MAX_GAMES = 40;

export interface ChatSeen {
  /** The time of the newest message read in the chat of `gameId`. 0: none. */
  seenAt(gameId: string): number;
  /** The player read the chat of `gameId` up to `sentAt`. */
  markSeen(gameId: string, sentAt: number): void;
  /** The player read the chat rules step (shown once, before the first chat). */
  rulesSeen(): boolean;
  markRulesSeen(): void;
}

export function createChatSeen(storage: Storage): ChatSeen {
  const read = (): Record<string, number> => {
    try {
      const saved: unknown = JSON.parse(storage.getString(CHAT_SEEN_STORAGE_KEY) ?? '{}');
      if (typeof saved !== 'object' || saved === null || Array.isArray(saved)) return {};
      return Object.fromEntries(
        Object.entries(saved).filter(
          (entry): entry is [string, number] => typeof entry[1] === 'number',
        ),
      );
    } catch {
      return {};
    }
  };
  return {
    seenAt: (gameId) => read()[gameId] ?? 0,
    markSeen(gameId, sentAt) {
      const seen = read();
      if ((seen[gameId] ?? 0) >= sentAt) return;
      // The newest read goes last, so the oldest drop first.
      const { [gameId]: _old, ...rest } = seen;
      const kept = Object.entries({ ...rest, [gameId]: sentAt }).slice(-MAX_GAMES);
      try {
        storage.setString(CHAT_SEEN_STORAGE_KEY, JSON.stringify(Object.fromEntries(kept)));
      } catch {
        // The dot shows again next time: no harm.
      }
    },
    rulesSeen() {
      try {
        return storage.getString(CHAT_RULES_STORAGE_KEY) !== undefined;
      } catch {
        return false;
      }
    },
    markRulesSeen() {
      try {
        storage.setString(CHAT_RULES_STORAGE_KEY, '1');
      } catch {
        // The step shows once more: no harm.
      }
    },
  };
}

/** The app's instance. */
export const chatSeen: ChatSeen = createChatSeen(appStorage);

/** The time of the newest message of the view. 0 for none. */
export function newestSentAt(view: ChatView): number {
  return view.messages.reduce((newest, message) => Math.max(newest, message.sentAt), 0);
}

/** How many messages the other player wrote after `seenAt`. */
export function unreadCount(view: ChatView | null, me: PlayerId, seenAt: number): number {
  if (view === null) return 0;
  return view.messages.filter((message) => message.from !== me && message.sentAt > seenAt).length;
}

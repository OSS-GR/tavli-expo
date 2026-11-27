/**
 * How the chat lays out its messages (chat v2, #709): messages from one
 * player that follow each other closely form a group. The last bubble of
 * a group has the tail, and the time when no answer came at once.
 */
import type { ChatMessage } from '@tavli/contracts';
import type { PlayerId } from '@tavli/engine';

/** A message this long after the one before starts a new group. */
export const CHAT_GROUP_GAP_MS = 5 * 60 * 1000;

export interface ChatRow {
  readonly message: ChatMessage;
  readonly mine: boolean;
  /** The last message of its group: it has the tail. */
  readonly last: boolean;
  /**
   * The time shows under it: the last message of a group, unless an
   * answer came within `CHAT_TIME_QUIET_MS`. So a fast talk shows one
   * time at its end, not one per message.
   */
  readonly time: boolean;
  /**
   * A new game of the match started before this message: a line with
   * this game number shows over it. `null` for no line. The first
   * message has one only when it is not from game 1.
   */
  readonly gameLine: number | null;
  /**
   * This message is the first of its day (the phone's time zone): a line
   * with the day shows over it. The first message has one only when it
   * is not from today. `dayLabel` makes the text.
   */
  readonly dayLine: boolean;
}

/** An answer this soon after a group hides the group's time. */
export const CHAT_TIME_QUIET_MS = 60 * 1000;

/** The day of a time in the phone's time zone, as a key to compare. */
function dayKey(ms: number): string {
  const date = new Date(ms);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

/** `now`: the phone time, to know which messages are from today. */
export function chatRows(messages: readonly ChatMessage[], me: PlayerId, now: number): ChatRow[] {
  return messages.map((message, i) => {
    const next = messages[i + 1];
    const gameBefore = messages[i - 1]?.game ?? 1;
    // A new game also ends the group before it.
    const newGame = next !== undefined && next.game !== message.game;
    const last =
      next === undefined ||
      newGame ||
      next.from !== message.from ||
      next.sentAt - message.sentAt > CHAT_GROUP_GAP_MS;
    const time =
      last && (next === undefined || newGame || next.sentAt - message.sentAt > CHAT_TIME_QUIET_MS);
    const gameLine = message.game !== gameBefore ? message.game : null;
    const before = messages[i - 1];
    const dayLine = dayKey(message.sentAt) !== dayKey(before === undefined ? now : before.sentAt);
    return { message, mine: message.from === me, last, time, gameLine, dayLine };
  });
}

/** The time of day of a message, in the phone's time zone, like "21:04". */
export function clockTime(sentAt: number, locale: string): string {
  return new Date(sentAt).toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' });
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The day of a message for its line: "today", "yesterday", or the date
 * ("12 Nov") for an older one.
 */
export function dayLabel(
  sentAt: number,
  now: number,
  locale: string,
): { kind: 'today' } | { kind: 'yesterday' } | { kind: 'date'; text: string } {
  if (dayKey(sentAt) === dayKey(now)) return { kind: 'today' };
  if (dayKey(sentAt) === dayKey(now - DAY_MS)) return { kind: 'yesterday' };
  return {
    kind: 'date',
    text: new Date(sentAt).toLocaleDateString(locale, { day: 'numeric', month: 'short' }),
  };
}

/** The ready phrases, in the order the chips show. The text is in `chat.phrases`. */
export const CHAT_PHRASES = ['goodLuck', 'niceRoll', 'oneMore', 'goodGame', 'thanks'] as const;
export type ChatPhrase = (typeof CHAT_PHRASES)[number];

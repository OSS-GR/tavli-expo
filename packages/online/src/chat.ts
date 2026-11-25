/**
 * Chat in online games (ADR-0011, epic #692): the rules both servers run.
 * The Convex functions (`apps/server/convex/chat.ts`) and the in-memory
 * server use these, so the rules are the same. The servers add only their
 * storage: the messages, the mutes, the setting and the blocks.
 *
 * Everything here is pure: `now` is an argument.
 */

import {
  CHAT_KEEP_DAYS,
  CHAT_MAX_LENGTH,
  CHAT_MESSAGES_PER_MINUTE,
  CHAT_RATE_WINDOW_MS,
  CHAT_VIEW_MESSAGES,
  REPORT_CHAT_MESSAGES,
  TERMS_VERSION,
} from '@tavli/contracts';
import type { ChatErrorCode, ChatMessage, ChatStatus, ReportedChatMessage } from '@tavli/contracts';
import type { PlayerId } from '@tavli/engine';

import { foldLetters } from './usernames';

/** A rejected chat call. The servers turn it into `ChatErrorData`. */
export class ChatError extends Error {
  constructor(
    readonly code: ChatErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ChatError';
  }
}

/** What a server knows about one player of a game, for the chat. */
export interface ChatPlayer {
  /** A saved account (ADR-0008), not a guest. */
  readonly saved: boolean;
  /** The account has a username. */
  readonly hasUsername: boolean;
  /** The terms version the player accepted, or `null` for none. */
  readonly termsVersion: string | null;
  /** The player's chat switch (`setEnabled`). A player with no stored value has `true`. */
  readonly enabled: boolean;
  /** The owner stopped the player's chat, and the ban has not ended (`chatBanned`). */
  readonly banned?: boolean;
}

/**
 * True while a ban holds. `until`: the end of the ban in epoch ms, `null`
 * for a ban with no end, `undefined` for no ban.
 */
export function chatBanned(until: number | null | undefined, now: number): boolean {
  return until !== undefined && (until === null || now < until);
}

/**
 * What a report from the chat of a game keeps: the last
 * `REPORT_CHAT_MESSAGES` messages `reported` wrote there that the
 * reporter could see (not the hidden ones), oldest first.
 */
export function reportedChat(
  messages: readonly StoredChatMessage[],
  reported: PlayerId,
): ReportedChatMessage[] {
  return messages
    .filter((message) => message.from === reported && !message.hidden)
    .sort((a, b) => a.sentAt - b.sentAt)
    .slice(-REPORT_CHAT_MESSAGES)
    .map(({ text, sentAt }) => ({ text, sentAt }));
}

/** A player with nothing kept: a guest. */
export const NO_CHAT_PLAYER: ChatPlayer = {
  saved: false,
  hasUsername: false,
  termsVersion: null,
  enabled: true,
};

/** Why `player` alone may not chat, or `null` when they may. The order is the order the app fixes them in. */
function ownReason(
  player: ChatPlayer,
): Exclude<ChatStatus, 'open' | 'muted' | 'unavailable'> | null {
  if (!player.saved) return 'needs-account';
  if (!player.hasUsername) return 'needs-username';
  if (player.termsVersion !== TERMS_VERSION) return 'needs-terms';
  if (player.banned === true) return 'banned';
  if (!player.enabled) return 'turned-off';
  return null;
}

export interface ChatStatusInput {
  readonly me: ChatPlayer;
  readonly other: ChatPlayer;
  /** The caller muted this game. */
  readonly muted: boolean;
  /** The caller blocks the other player. (The other way never shows: the blocked player is not told.) */
  readonly blocksOther: boolean;
  /** The match ended `CHAT_KEEP_DAYS` ago (`chatExpired`): its chat is deleted and closed. */
  readonly expired?: boolean;
}

/** How long a chat stays after its match ends, in milliseconds. */
export const CHAT_KEEP_MS = CHAT_KEEP_DAYS * 24 * 60 * 60 * 1000;

/**
 * True when the chat of a match is over for good: the match is finished
 * and ended `CHAT_KEEP_MS` ago or more. `endedAt`: the last save of the
 * finished match, or `null` while it runs.
 */
export function chatExpired(endedAt: number | null, now: number): boolean {
  return endedAt !== null && now - endedAt >= CHAT_KEEP_MS;
}

/**
 * What the caller sees of a game's chat. The caller's own reasons come
 * first, so the app can lead them to the fix. A reason on the other side
 * is always `unavailable`: the view never says which.
 */
export function chatStatus({
  me,
  other,
  muted,
  blocksOther,
  expired = false,
}: ChatStatusInput): ChatStatus {
  const mine = ownReason(me);
  if (mine !== null) return mine;
  if (expired || blocksOther || ownReason(other) !== null) return 'unavailable';
  return muted ? 'muted' : 'open';
}

// A web address: a scheme, "www.", or a name with a dot and a common ending.
const LINK =
  /(?:https?:\/\/|www\.)\S|\b[\p{L}\p{N}-]+\.(?:com|net|org|gr|io|me|co|app|gg|ly|tv|xyz|info|eu|uk|de|ru|cc|to|link|site|online|shop|live)\b/iu;
// An email address, or "name at host dot com" written with the sign.
const EMAIL = /\S@\S/u;

/** True when the text holds a web address or an email address. */
export function hasLink(text: string): boolean {
  return LINK.test(text) || EMAIL.test(text);
}

/** The words of a message: runs of letters, digits and `_`. */
function wordsOf(text: string): string[] {
  return text.split(/[^\p{L}\p{M}\p{N}_]+/u).filter((word) => word !== '');
}

/**
 * The chat block list (ADR-0011 item 9). Ordinary swearing is allowed in
 * chat; only slurs (words that attack a person for their race, origin or
 * sexuality) and words about the abuse of children are refused. It is
 * its own list: the username list (`usernames.ts`) stays stricter. A
 * part matches anywhere in a word; keep each long enough not to hit
 * common words.
 */
const SLUR_PARTS = [
  // Not the shorter "nigg": it would refuse "niggle".
  'nigger',
  'nigga',
  'faggot',
  'tranny',
  'paedo',
  'pedophil',
  'πουστ',
  'poust',
  'αραπη',
  'αραπα',
  'γυφτ',
  'gyft',
  'παιδεραστ',
  'paiderast',
];

/** Short slurs that are refused only as a whole word (as a part they are in common words). */
const SLUR_WORDS = ['kike', 'spic', 'chink', 'fag', 'coon'];

const SLUR_PART_KEYS = SLUR_PARTS.map(foldLetters);
const SLUR_WORD_KEYS = new Set(SLUR_WORDS.map(foldLetters));

/** True when a word of the text is a slur. Digits and `_` do not hide one. */
export function hasBadWord(text: string): boolean {
  return wordsOf(text).some((word) => {
    const folded = foldLetters(word);
    const bare = foldLetters(word.replace(/[_0-9]/g, ''));
    return (
      SLUR_WORD_KEYS.has(folded) ||
      SLUR_WORD_KEYS.has(bare) ||
      SLUR_PART_KEYS.some((part) => folded.includes(part) || bare.includes(part))
    );
  });
}

/**
 * The text to keep: composed form (NFC), control and invisible format
 * characters out, each run of white space (line breaks too) as one space,
 * no space at the ends. The two joiners stay (U+200D and U+200C): joined
 * emoji and some scripts need them.
 */
export function cleanChatText(text: string): string {
  return text
    .normalize('NFC')
    .replace(/[\p{Cc}\p{Cf}]/gu, (char) => (char === '\u200D' || char === '\u200C' ? char : ' '))
    .replace(/\s+/gu, ' ')
    .trim();
}

export interface PlanChatInput {
  /** The text as sent. */
  readonly text: string;
  /** `chatStatus` for the sender. */
  readonly status: ChatStatus;
  /**
   * When the sender's earlier messages of this game were sent (any
   * order). Only the last `CHAT_RATE_WINDOW_MS` count, so a server may
   * pass just those.
   */
  readonly sentTimes: readonly number[];
  readonly now: number;
}

export type ChatPlan =
  | { readonly ok: true; readonly text: string }
  | { readonly ok: false; readonly code: ChatErrorCode; readonly message: string };

function refuse(code: ChatErrorCode, message: string): ChatPlan {
  return { ok: false, code, message };
}

/**
 * One send: the status, the text checks, then the rate limit. A plan, not a
 * throw, so a server can count a refused message if it needs to.
 */
export function planChatMessage({ text, status, sentTimes, now }: PlanChatInput): ChatPlan {
  if (status !== 'open') return refuse('CHAT_CLOSED', `the chat is ${status}`);
  if (typeof text !== 'string') return refuse('EMPTY', 'no text');
  const clean = cleanChatText(text);
  if (clean === '') return refuse('EMPTY', 'no text');
  if (Array.from(clean).length > CHAT_MAX_LENGTH) {
    return refuse('TOO_LONG', `at most ${CHAT_MAX_LENGTH} characters`);
  }
  if (hasLink(clean)) return refuse('LINK', 'no links or email addresses');
  if (hasBadWord(clean)) return refuse('BAD_WORDS', 'this message breaks the chat rules');
  const since = now - CHAT_RATE_WINDOW_MS;
  if (sentTimes.filter((at) => at > since).length >= CHAT_MESSAGES_PER_MINUTE) {
    return refuse('TOO_FAST', 'too many messages: wait a moment');
  }
  return { ok: true, text: clean };
}

/** A kept message. `hidden`: sent by a player the other blocks, so only its sender sees it. */
export interface StoredChatMessage extends ChatMessage {
  readonly hidden: boolean;
}

/**
 * The messages `viewer` sees: none unless the chat is `open` for them;
 * else the newest `CHAT_VIEW_MESSAGES` of all but the other side's hidden
 * ones. Oldest first.
 */
export function chatSeenBy(
  messages: readonly StoredChatMessage[],
  viewer: PlayerId,
  status: ChatStatus,
): ChatMessage[] {
  if (status !== 'open') return [];
  return messages
    .filter((message) => !message.hidden || message.from === viewer)
    .map(({ id, from, text, sentAt }) => ({ id, from, text, sentAt }))
    .sort((a, b) => a.sentAt - b.sentAt)
    .slice(-CHAT_VIEW_MESSAGES);
}

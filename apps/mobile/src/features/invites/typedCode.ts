/**
 * A code the player typed or pasted on "Join with a code" (#333). Pure: no
 * React, no router.
 *
 * The phone checks the text before any server call:
 * - An invite link (`tavlaki://invite/<code>` or
 *   `https://tavlaki.com/i/<code>`) gives its code, also inside a longer
 *   text such as the whole share message.
 * - Else the text is the code. Spaces and dashes inside it are dropped, and
 *   Greek capitals that look like Latin ones (a Greek keyboard) become the
 *   Latin letter. Then `normalizeInviteCode` checks the length and the
 *   characters (no `0`/`O`, no `1`/`I`/`L`).
 */
import { INVITE_CODE_ALPHABET, INVITE_CODE_LENGTH, normalizeInviteCode } from '@tavli/contracts';

import { inviteCodeFromLink } from './link';

/** Why the text is not a code. */
export type TypedCodeProblem = 'short' | 'long' | 'characters' | 'link';

export type TypedCode =
  | { readonly kind: 'code'; readonly code: string }
  | { readonly kind: 'empty' }
  | { readonly kind: 'problem'; readonly problem: TypedCodeProblem };

/** A link anywhere in the text: the app scheme or the share site. */
const LINK_IN_TEXT = /(?:tavlaki:\/\/invite\/|https:\/\/(?:www\.)?tavlaki\.com\/i\/)\S*/i;

/** Greek letters (both cases) whose capital looks like a Latin capital. */
const GREEK_LOOK_ALIKES: Readonly<Record<string, string>> = {
  Α: 'A',
  α: 'A',
  Β: 'B',
  β: 'B',
  Ε: 'E',
  ε: 'E',
  Ζ: 'Z',
  ζ: 'Z',
  Η: 'H',
  η: 'H',
  Κ: 'K',
  κ: 'K',
  Μ: 'M',
  μ: 'M',
  Ν: 'N',
  ν: 'N',
  Ρ: 'P',
  ρ: 'P',
  Τ: 'T',
  τ: 'T',
  Υ: 'Y',
  υ: 'Y',
  Χ: 'X',
  χ: 'X',
};

/** The code in `text`, in capital letters, or why it is not one. */
export function readTypedCode(text: string): TypedCode {
  const trimmed = text.trim();
  if (trimmed === '') return { kind: 'empty' };

  const link = LINK_IN_TEXT.exec(trimmed)?.[0];
  if (link !== undefined) {
    // A closing bracket or a full stop right after the link is not part of it.
    const code = inviteCodeFromLink(link.replace(/[).,;:!?]+$/, ''));
    return code === null ? { kind: 'problem', problem: 'link' } : { kind: 'code', code };
  }

  const compact = compactText(trimmed);
  const code = normalizeInviteCode(compact);
  if (code !== null) return { kind: 'code', code };
  // A character that is never in a code says the most: say that first.
  const chars = [...compact.replace(/[a-z]/g, (char) => char.toUpperCase())];
  if (chars.some((char) => !INVITE_CODE_ALPHABET.includes(char))) {
    return { kind: 'problem', problem: 'characters' };
  }
  return { kind: 'problem', problem: chars.length < INVITE_CODE_LENGTH ? 'short' : 'long' };
}

/** The text with no spaces or dashes, and Greek look-alikes as Latin letters. */
function compactText(text: string): string {
  // Dashes: the ASCII one and the Unicode ones (U+2010 to U+2015).
  return [...text.replace(/[\s\-\u2010-\u2015]/g, '')]
    .map((char) => GREEK_LOOK_ALIKES[char] ?? char)
    .join('');
}

/**
 * What the code slots of "Join with a code" show (#521): the code of a
 * link or a message, else the typed characters in capital letters, with
 * no spaces or dashes. It checks nothing: `readTypedCode` does.
 */
export function codeSlots(text: string): string {
  const typed = readTypedCode(text);
  if (typed.kind === 'code') return typed.code;
  return compactText(text.trim()).toUpperCase();
}

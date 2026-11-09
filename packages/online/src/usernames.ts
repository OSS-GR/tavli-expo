/**
 * Usernames (#405, ADR-0008): the rules both servers use (the Convex
 * functions in `apps/server/convex/usernames.ts` and the in-memory
 * server), and the app before it sends a name. Everything here is pure.
 *
 * - `checkUsername`: 3 to 16 characters, Latin or Greek letters (accents
 *   allowed), digits and `_`, a letter first, one alphabet per name.
 * - `usernameKey`: the normal form that makes a name unique. It ignores
 *   case and accents, and maps letters that look the same to one letter
 *   (Greek "Α" and Latin "A", "l", "1" and "I", "0" and "O", "rn" and
 *   "m"). Two names with the same key are the same name.
 * - `isAllowedUsername`: no reserved name (admin, support, tavlaki,
 *   guest, …) and no word from the short block list, in English, Greek
 *   and Greeklish. The lists are short on purpose: the report button
 *   (#320) and the owner's `clearUsername` handle the rest.
 * - `planUsername`: one pick or change: the rules above, the terms of
 *   use, the age check, and one change in 30 days (the first pick is
 *   free). The caller checks the key is not taken by another player.
 */

import {
  TERMS_VERSION,
  USERNAME_CHANGE_MS,
  USERNAME_MAX_LENGTH,
  USERNAME_MIN_LENGTH,
} from '@tavli/contracts';
import type { MyUsername, SetUsernameRequest, UsernameErrorCode } from '@tavli/contracts';

/** Why a name breaks the rules. The app says which. */
export type UsernameProblem =
  /** Fewer than 3 characters. */
  | 'short'
  /** More than 16 characters. */
  | 'long'
  /** A character that is not a letter, a digit or `_` (a space, a dot, an emoji). */
  | 'chars'
  /** Starts with a digit or `_`. */
  | 'start'
  /** Latin and Greek letters in one name. */
  | 'mixed';

export type UsernameCheck =
  | { readonly ok: true; readonly name: string }
  | { readonly ok: false; readonly problem: UsernameProblem };

const LATIN = /^[A-Za-z]$/;
// Greek capitals (U+03A2 is not a letter) and small letters, final sigma too.
const GREEK = /^[Α-ΡΣ-Ωα-ω]$/;
const OTHER = /^[0-9_]$/;
/** Accents (combining marks) after a letter. */
const MARK = /^[̀-ͯ]$/;
/** At most this many accents on one letter ("ΐ" has two). More is a trick, not a name. */
const MAX_MARKS = 2;

/**
 * Checks a name as typed. On success `name` is the name to keep: the
 * same text in its composed form (NFC), so "é" is one character.
 */
export function checkUsername(text: string): UsernameCheck {
  const name = text.normalize('NFC');
  let script: 'latin' | 'greek' | null = null;
  let first = true;
  let afterLetter = false;
  let marks = 0;
  let mixed = false;
  for (const char of name.normalize('NFD')) {
    if (MARK.test(char)) {
      marks += 1;
      if (!afterLetter || marks > MAX_MARKS) return { ok: false, problem: 'chars' };
      continue;
    }
    marks = 0;
    const letter = LATIN.test(char) ? 'latin' : GREEK.test(char) ? 'greek' : null;
    if (letter === null) {
      if (!OTHER.test(char)) return { ok: false, problem: 'chars' };
      if (first) return { ok: false, problem: 'start' };
      afterLetter = false;
    } else {
      if (script !== null && script !== letter) mixed = true;
      script = letter;
      afterLetter = true;
    }
    first = false;
  }
  if (mixed) return { ok: false, problem: 'mixed' };
  const length = Array.from(name).length;
  if (length < USERNAME_MIN_LENGTH) return { ok: false, problem: 'short' };
  if (length > USERNAME_MAX_LENGTH) return { ok: false, problem: 'long' };
  return { ok: true, name };
}

/**
 * Greek small letters that look like a Latin letter (in small or capital
 * form) map to it, so "ΑΒΕ" and "ABE" are one name. The others stay.
 */
const GREEK_LOOK_ALIKES: Readonly<Record<string, string>> = {
  α: 'a',
  β: 'b',
  γ: 'y',
  ε: 'e',
  ζ: 'z',
  η: 'h',
  ι: 'i',
  κ: 'k',
  μ: 'm',
  ν: 'n',
  ο: 'o',
  ρ: 'p',
  τ: 't',
  υ: 'y',
  χ: 'x',
  ω: 'w',
};

/** No case, no accents, look-alike single letters as one. */
function foldLetters(name: string): string {
  const plain = name
    .normalize('NFD')
    .replace(/[\u0300-\u036F]/g, '')
    .toLowerCase()
    .replace(/ς/g, 'σ');
  return Array.from(plain, (char) => GREEK_LOOK_ALIKES[char] ?? char)
    .join('')
    .replace(/[l1]/g, 'i')
    .replace(/0/g, 'o');
}

/**
 * The normal form of a name: two names with the same key are one name.
 * No case, no accents, look-alike letters as one (see the file comment).
 */
export function usernameKey(name: string): string {
  return foldLetters(name).replace(/rn/g, 'm').replace(/vv/g, 'w');
}

/** Names nobody may take: the key may not be one of these. */
const RESERVED_NAMES = [
  'bot',
  'help',
  'mod',
  'root',
  'staff',
  'system',
  'server',
  'tavli',
  'opponent',
  'anonymous',
  'everyone',
  'null',
  'undefined',
  'ταβλι',
  'βοηθεια',
  'αντιπαλος',
  'ανωνυμος',
];

/** No key may start with one of these: they pass for us, or for a guest. */
const RESERVED_STARTS = [
  'admin',
  'moderat',
  'support',
  'tavlaki',
  'official',
  'guest',
  'διαχειρισ',
  'υποστηριξ',
  'ταβλακι',
  'επισημ',
  'επισκεπτ',
  'συντονιστ',
  'diaxeiris',
  'ypostirix',
  'episkept',
];

/** No key may hold one of these anywhere. Each is long enough not to block common words. */
const BLOCKED_PARTS = [
  'fuck',
  'shit',
  'cunt',
  'bitch',
  'nigg',
  'faggot',
  'whore',
  'slut',
  'paedo',
  'pedophil',
  'nazi',
  'hitler',
  'porn',
  'penis',
  'vagina',
  'pussy',
  'asshole',
  'bastard',
  'retard',
  'wank',
  'twat',
  'jizz',
  'γαμω',
  'γαμησ',
  'γαμιεσ',
  'γαμιολ',
  'γαμημεν',
  'μαλακ',
  'μουνι',
  'πουστ',
  'πουταν',
  'πουτσ',
  'καριολ',
  'αρχιδ',
  'καυλ',
  'ψωλ',
  'σκατα',
  'τσουλα',
  'gamw',
  'gamis',
  'gamiol',
  'malak',
  'mouni',
  'poust',
  'poutan',
  'poutsa',
  'kariol',
  'arxid',
  'kavl',
  'skata',
  'tsoula',
];

/** Short words that are blocked only as the whole name (as a part they are in common words). */
const BLOCKED_NAMES = ['kkk', 'cock', 'cum', 'sex', 'tits', 'dick', 'anal', 'gamo', 'κωλος'];

const RESERVED_KEYS = new Set(RESERVED_NAMES.map(usernameKey));
const RESERVED_START_KEYS = RESERVED_STARTS.map(usernameKey);
// "rn" stays "rn" for the block list, or "porn" would block "pomegranate".
const BLOCKED_PART_KEYS = BLOCKED_PARTS.map(foldLetters);
const BLOCKED_NAME_KEYS = new Set(BLOCKED_NAMES.map(usernameKey));

/** False for a reserved name or a blocked word. `_` and digits do not hide a word. */
export function isAllowedUsername(name: string): boolean {
  const key = usernameKey(name);
  // The name without `_` and digits: "bot_1" is "bot". (The key has
  // turned "1" into "i" already, so strip them from the name.)
  const plain = name.replace(/[_0-9]/g, '');
  const bare = usernameKey(plain);
  if (RESERVED_KEYS.has(key) || RESERVED_KEYS.has(bare)) return false;
  if (BLOCKED_NAME_KEYS.has(key) || BLOCKED_NAME_KEYS.has(bare)) return false;
  if (RESERVED_START_KEYS.some((start) => key.startsWith(start) || bare.startsWith(start))) {
    return false;
  }
  const folded = foldLetters(name);
  const foldedBare = foldLetters(plain);
  return !BLOCKED_PART_KEYS.some((part) => folded.includes(part) || foldedBare.includes(part));
}

/**
 * What a server keeps for one player's username (Convex: optional fields
 * of the `playerNames` row). Every field is absent until it is set.
 */
export interface UsernameRecord {
  /** The name as typed (NFC). */
  readonly username?: string;
  /** `usernameKey(username)`: the server keeps it unique. */
  readonly usernameKey?: string;
  /** The last change after the first pick. Absent: the next change is free. */
  readonly usernameChangedAt?: number;
  /** When the player said they are old enough. */
  readonly ageCheckedAt?: number;
  /** The terms version the player accepted, and when. */
  readonly termsVersion?: string;
  readonly termsAcceptedAt?: number;
}

/** When the player may change the name again, or `null` when they may now. */
export function nextUsernameChange(record: UsernameRecord | null, now: number): number | null {
  if (record?.username === undefined || record.usernameChangedAt === undefined) return null;
  const next = record.usernameChangedAt + USERNAME_CHANGE_MS;
  return next > now ? next : null;
}

/** The port's view of a record. */
export function myUsernameOf(
  record: UsernameRecord | null,
  saved: boolean,
  now: number,
): MyUsername {
  return {
    saved,
    name: record?.username ?? null,
    nextChangeAt: nextUsernameChange(record, now),
    ageChecked: record?.ageCheckedAt !== undefined,
    termsVersion: record?.termsVersion ?? null,
  };
}

/** The fields a pick or change sets. */
export type UsernamePatch = {
  -readonly [K in keyof UsernameRecord]?: UsernameRecord[K];
};

export type UsernamePlan =
  | { readonly ok: false; readonly code: UsernameErrorCode; readonly message: string }
  | {
      readonly ok: true;
      /** The fields to set on the record. */
      readonly patch: UsernamePatch;
      /**
       * The key of the new name: the caller must refuse it with `TAKEN`
       * when another player holds it. `null` when the name stays.
       */
      readonly key: string | null;
    };

export interface PlanUsernameInput {
  /** The caller's record, or `null` when they have none. */
  readonly record: UsernameRecord | null;
  /** The caller has a saved account (not a guest). */
  readonly saved: boolean;
  readonly request: SetUsernameRequest;
  readonly now: number;
}

function refuse(code: UsernameErrorCode, message: string): UsernamePlan {
  return { ok: false, code, message };
}

/** Checks one pick or change and says what to save. See the file comment. */
export function planUsername({ record, saved, request, now }: PlanUsernameInput): UsernamePlan {
  if (!saved) return refuse('NOT_SAVED', 'save the account with a key first');
  if (typeof request.name !== 'string') return refuse('BAD_NAME', 'the name is not text');
  const check = checkUsername(request.name);
  if (!check.ok) return refuse('BAD_NAME', `the name is not valid (${check.problem})`);
  if (!isAllowedUsername(check.name)) return refuse('NOT_ALLOWED', 'this name is not allowed');

  const patch: UsernamePatch = {};
  if (record?.termsVersion !== TERMS_VERSION) {
    if (request.acceptTerms !== TERMS_VERSION) {
      return refuse('TERMS_NEEDED', 'accept the terms of use first');
    }
    patch.termsVersion = TERMS_VERSION;
    patch.termsAcceptedAt = now;
  }
  if (record?.ageCheckedAt === undefined) {
    if (request.ageChecked !== true) return refuse('AGE_NEEDED', 'check the age first');
    patch.ageCheckedAt = now;
  }

  if (check.name === record?.username) return { ok: true, patch, key: null };
  if (nextUsernameChange(record, now) !== null) {
    return refuse('TOO_SOON', 'the name was changed less than 30 days ago');
  }
  const key = usernameKey(check.name);
  patch.username = check.name;
  patch.usernameKey = key;
  // The first pick (no name now) is free: only a change starts the 30 days.
  if (record?.username !== undefined) patch.usernameChangedAt = now;
  return { ok: true, patch, key };
}

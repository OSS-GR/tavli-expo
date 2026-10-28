/**
 * What each rules page shows (#112): its sections in reading order, and the
 * start position for the small board picture.
 *
 * The text lives in the `rules.*` group of `en.json` and `el.json`. It
 * follows `docs/rules/` and the app's default presets (owner rules), so a
 * page never describes a flag the default preset leaves off. A game in
 * another rules version (#241) opens the page with `version`: a section on
 * top says what that version changes (`versionSection`). Pure: no React.
 */
import {
  ASODIO_START,
  DEFAULT_PRESET_BY_GAME,
  FEVGA_START,
  PLAKOTO_START,
  PORTES_START,
  createBoard,
  getPreset,
  type BoardState,
  type Direction,
  type SideLayout,
} from '@tavli/engine';
import type { ParseKeys } from 'i18next';

import {
  VERSION_KEYS,
  isRulesVersion,
  isVersionedGame,
  otherVersion,
  type OtherVersion,
} from '@/features/match/setup';

/** A translation key (checked against `en.json`). */
export type RulesKey = ParseKeys;

/** The ids the rules route knows. */
export const RULES_VARIANTS = ['portes', 'plakoto', 'fevga', 'asodio', 'tavli'] as const;

export type RulesVariant = (typeof RULES_VARIANTS)[number];

/** The games with a full rules page. */
export const RULES_GAMES = ['portes', 'plakoto', 'fevga', 'asodio'] as const;

export type RulesGame = (typeof RULES_GAMES)[number];

/** The games of a Tavli match, linked from the Tavli page. Asodio is not one of them. */
export const TAVLI_GAMES = ['portes', 'plakoto', 'fevga'] as const satisfies readonly RulesGame[];

export function isRulesGame(value: unknown): value is RulesGame {
  return (RULES_GAMES as readonly unknown[]).includes(value);
}

/** The `variant` route param, or `null` for an id we have no page for. */
export function parseRulesVariant(value: string | string[] | undefined): RulesVariant | null {
  const id = Array.isArray(value) ? value[0] : value;
  return (RULES_VARIANTS as readonly unknown[]).includes(id) ? (id as RulesVariant) : null;
}

/** The screen title ("How to play Plakoto"). */
export function rulesTitleKey(variant: RulesVariant | null): RulesKey {
  return variant ? `rules.title.${variant}` : 'rules.title.other';
}

export interface RulesSection {
  /** Used in test ids: `rules-section-<id>`. */
  readonly id: string;
  readonly title: RulesKey;
  /** Each key holds one or more lines, split by "\n". Each line is one paragraph. */
  readonly body: readonly RulesKey[];
  /** Show the start picture under the title. */
  readonly picture?: boolean;
}

const goal = (extra?: RulesKey): RulesSection => ({
  id: 'goal',
  title: 'rules.common.goal.title',
  body: extra ? ['rules.common.goal.body', extra] : ['rules.common.goal.body'],
});

const start = (text: RulesKey): RulesSection => ({
  id: 'start',
  title: 'rules.common.start',
  body: ['rules.common.numbering', text],
  picture: true,
});

const dice: RulesSection = {
  id: 'dice',
  title: 'rules.common.dice.title',
  body: ['rules.common.dice.body'],
};

const bearOff = (extra?: RulesKey): RulesSection => ({
  id: 'bearOff',
  title: 'rules.common.bearOff.title',
  body: extra ? ['rules.common.bearOff.body', extra] : ['rules.common.bearOff.body'],
});

const scoring: RulesSection = {
  id: 'scoring',
  title: 'rules.common.scoring.title',
  body: ['rules.common.scoring.body'],
};

/** The sections of each full page, in reading order. */
export const RULES_PAGES: { readonly [G in RulesGame]: readonly RulesSection[] } = {
  portes: [
    goal(),
    start('rules.portes.start'),
    dice,
    { id: 'moves', title: 'rules.portes.moves.title', body: ['rules.portes.moves.body'] },
    { id: 'hitting', title: 'rules.portes.hitting.title', body: ['rules.portes.hitting.body'] },
    bearOff('rules.portes.bearOff'),
    scoring,
  ],
  plakoto: [
    goal('rules.plakoto.goal'),
    start('rules.plakoto.start'),
    dice,
    { id: 'moves', title: 'rules.plakoto.moves.title', body: ['rules.plakoto.moves.body'] },
    { id: 'pinning', title: 'rules.plakoto.pinning.title', body: ['rules.plakoto.pinning.body'] },
    // Owner rule (`motherRule: "offerConcede"`): resign or play on.
    { id: 'mother', title: 'rules.plakoto.mother.title', body: ['rules.plakoto.mother.body'] },
    bearOff('rules.plakoto.bearOff'),
    scoring,
  ],
  fevga: [
    goal('rules.fevga.goal'),
    start('rules.fevga.start'),
    dice,
    { id: 'moves', title: 'rules.fevga.moves.title', body: ['rules.fevga.moves.body'] },
    {
      id: 'noHitting',
      title: 'rules.fevga.noHitting.title',
      body: ['rules.fevga.noHitting.body'],
    },
    // `runnerRule` with `runnerTarget: "passMother"`.
    { id: 'runner', title: 'rules.fevga.runner.title', body: ['rules.fevga.runner.body'] },
    // P1, P2 (window 6-11) and P3, checked at the end of the turn.
    { id: 'primes', title: 'rules.fevga.primes.title', body: ['rules.fevga.primes.body'] },
    bearOff(),
    scoring,
  ],
  // The owner version, `asodio.kafeneio` (A1–A6): load all 15 first, quarter
  // lock, pins, no extra rolls, a draw when no one can move.
  asodio: [
    goal('rules.asodio.goal'),
    start('rules.asodio.start'),
    dice,
    { id: 'moves', title: 'rules.asodio.moves.title', body: ['rules.asodio.moves.body'] },
    {
      id: 'entering',
      title: 'rules.asodio.entering.title',
      body: ['rules.asodio.entering.body'],
    },
    {
      id: 'quarters',
      title: 'rules.asodio.quarters.title',
      body: ['rules.asodio.quarters.body'],
    },
    { id: 'pinning', title: 'rules.asodio.pinning.title', body: ['rules.asodio.pinning.body'] },
    bearOff('rules.asodio.bearOff'),
    scoring,
    { id: 'draw', title: 'rules.asodio.draw.title', body: ['rules.asodio.draw.body'] },
  ],
};

/** The Tavli page: the match rotation, with links to the three games. */
export const TAVLI_SECTION: RulesSection = {
  id: 'tavli',
  title: 'rules.tavli.title',
  body: ['rules.tavli.body'],
};

const START_LAYOUTS: { readonly [G in RulesGame]: SideLayout } = {
  portes: PORTES_START,
  plakoto: PLAKOTO_START,
  fevga: FEVGA_START,
  asodio: ASODIO_START,
};

/**
 * The `version` route param (#241): a rules version of `variant` that is
 * not its default, else `null` (the page then shows the default rules).
 */
export function parseRulesVersion(
  variant: RulesVariant | null,
  value: string | string[] | undefined,
): OtherVersion | null {
  const id = Array.isArray(value) ? value[0] : value;
  if (!isVersionedGame(variant) || !isRulesVersion(variant, id)) return null;
  return otherVersion(id);
}

/** The section on top of a page in another rules version: what it changes. */
export function versionSection(version: OtherVersion): RulesSection {
  const key = VERSION_KEYS[version];
  return {
    id: 'version',
    title: `rules.versions.${key}.title`,
    body: [`rules.versions.${key}.body`],
  };
}

/** How the game's default preset moves (Fevga: parallel). */
export function rulesDirection(game: RulesGame): Direction {
  return getPreset(DEFAULT_PRESET_BY_GAME[game]).movement.direction;
}

/** The start position of a game, for the picture. Asodio: an empty board, 15 to enter each. */
export function startBoard(game: RulesGame): BoardState {
  const layout = START_LAYOUTS[game];
  return createBoard({ white: layout, black: layout }, rulesDirection(game));
}

/** Splits translated texts into paragraphs. */
export function paragraphs(texts: readonly string[]): string[] {
  return texts.flatMap((text) => text.split('\n')).filter((line) => line.trim() !== '');
}

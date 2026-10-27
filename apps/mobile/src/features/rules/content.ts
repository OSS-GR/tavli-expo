/**
 * What each rules page shows (#112): its sections in reading order, and the
 * start position for the small board picture.
 *
 * The text lives in the `rules.*` group of `en.json` and `el.json`. It
 * follows `docs/rules/` and the app's default presets (owner rules), so a
 * page never describes a flag the default preset leaves off. Pure: no React.
 */
import {
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

/** A translation key (checked against `en.json`). */
export type RulesKey = ParseKeys;

/** The ids the rules route knows. */
export const RULES_VARIANTS = ['portes', 'plakoto', 'fevga', 'asodio', 'tavli'] as const;

export type RulesVariant = (typeof RULES_VARIANTS)[number];

/** The games with a full rules page. */
export const RULES_GAMES = ['portes', 'plakoto', 'fevga'] as const;

export type RulesGame = (typeof RULES_GAMES)[number];

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
};

/** How the game's default preset moves (Fevga: parallel). */
export function rulesDirection(game: RulesGame): Direction {
  return getPreset(DEFAULT_PRESET_BY_GAME[game]).movement.direction;
}

/** The start position of a game, for the picture. */
export function startBoard(game: RulesGame): BoardState {
  const layout = START_LAYOUTS[game];
  return createBoard({ white: layout, black: layout }, rulesDirection(game));
}

/** Splits translated texts into paragraphs. */
export function paragraphs(texts: readonly string[]): string[] {
  return texts.flatMap((text) => text.split('\n')).filter((line) => line.trim() !== '');
}

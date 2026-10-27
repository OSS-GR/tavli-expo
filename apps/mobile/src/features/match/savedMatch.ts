/**
 * The saved local match (#36): one slot in the `Storage` port.
 *
 * We save the match setup and the flow's **event log**. The engine's way to
 * load a flow from outside is `replay(log)`: every event is checked again,
 * so a broken or edited save cannot give an illegal position. The log
 * holds every die, so no RNG is needed to load it.
 *
 * Versions: `SAVE_VERSION` is the shape of this envelope;
 * `MATCH_FLOW_SCHEMA_VERSION` is the engine's flow shape. A save with
 * another version is dropped (MVP1 has no migrations yet). Add a step in
 * `parseSavedMatch` when a version changes and old saves should live on.
 *
 * The game (#109) is `setup.game`. The envelope did not change: version 1
 * saves always held `game: 'portes'`, and they still load as Portes. The
 * game must match the preset of the log's rules, else the save is broken.
 */
import { MATCH_FLOW_SCHEMA_VERSION, replay, type FlowEvent, type MatchFlow } from '@tavli/engine';

import {
  gamePreset,
  gameRotation,
  isGameChoice,
  isMatchMode,
  sanitizeSetup,
  type GameLevels,
  type MatchSetup,
} from './setup';

export const SAVED_MATCH_KEY = 'savedMatch';

/** Raise this when the envelope below changes. */
export const SAVE_VERSION = 1;

interface SaveEnvelope {
  readonly v: typeof SAVE_VERSION;
  readonly flowSchema: typeof MATCH_FLOW_SCHEMA_VERSION;
  readonly id: string;
  readonly setup: MatchSetup;
  /** When it was saved (ms since 1970), for "12 min ago". */
  readonly savedAt: number;
  readonly log: readonly FlowEvent[];
}

export interface SavedMatch {
  readonly id: string;
  readonly setup: MatchSetup;
  readonly savedAt: number;
  readonly flow: MatchFlow;
}

export type SavedMatchResult =
  | { readonly kind: 'none' }
  | { readonly kind: 'ok'; readonly saved: SavedMatch }
  /** Bad JSON, an old version, or a log the engine refuses. Drop it. */
  | { readonly kind: 'broken'; readonly reason: string };

export function serializeSavedMatch(
  id: string,
  setup: MatchSetup,
  flow: MatchFlow,
  savedAt: number,
): string {
  const envelope: SaveEnvelope = {
    v: SAVE_VERSION,
    flowSchema: MATCH_FLOW_SCHEMA_VERSION,
    id,
    setup,
    savedAt,
    log: flow.log,
  };
  return JSON.stringify(envelope);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const broken = (reason: string): SavedMatchResult => ({ kind: 'broken', reason });

/**
 * Reads a save. Never throws. A finished match counts as no save (it is
 * cleared when the match ends; this catches an older app version).
 */
export function parseSavedMatch(text: string | undefined, levels: GameLevels): SavedMatchResult {
  if (text === undefined) return { kind: 'none' };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return broken('not JSON');
  }
  if (!isRecord(raw)) return broken('not an object');
  if (raw['v'] !== SAVE_VERSION) return broken(`save version ${String(raw['v'])}`);
  if (raw['flowSchema'] !== MATCH_FLOW_SCHEMA_VERSION) {
    return broken(`flow schema ${String(raw['flowSchema'])}`);
  }
  const { id, savedAt, log } = raw;
  const setupRaw = raw['setup'];
  if (typeof id !== 'string' || !id.startsWith('local-')) return broken('bad id');
  if (typeof savedAt !== 'number' || !Number.isFinite(savedAt)) return broken('bad time');
  if (!Array.isArray(log)) return broken('no log');
  if (!isRecord(setupRaw) || !isMatchMode(setupRaw['mode'])) return broken('bad setup');
  // A save with no game is Portes (the only game before #109).
  const game = setupRaw['game'] ?? 'portes';
  if (!isGameChoice(game)) return broken('bad game');
  // The match is already under way: keep its game even if the bot lost it.
  const setup = sanitizeSetup({ ...setupRaw, game }, setupRaw['mode'], levels, {
    keepBuiltGame: true,
  });
  if (setup.game !== game) return broken('game not built');

  let flow: MatchFlow;
  try {
    flow = replay(log as FlowEvent[]);
  } catch (error) {
    return broken(error instanceof Error ? error.message : 'replay failed');
  }
  if (flow.match.targetPoints !== setup.targetPoints) return broken('setup and log differ');
  const { rules } = flow.match;
  const rotation = gameRotation(setup.game);
  if (
    rules.presetId !== gamePreset(setup.game) ||
    rules.match.rotation.length !== rotation.length ||
    rules.match.rotation.some((variant, i) => variant !== rotation[i])
  ) {
    return broken('setup and log differ');
  }
  if (flow.match.status === 'finished') return { kind: 'none' };
  return { kind: 'ok', saved: { id, setup, savedAt, flow } };
}

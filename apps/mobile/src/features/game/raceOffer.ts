/**
 * The race card (fast forward a race): vs the bot, a card offers Fast
 * forward once per game, on your first roll of the race. This store keeps
 * the games whose card you answered in this app run, so the card does not
 * come back after Home and Continue. It saves nothing.
 */
import { create } from 'zustand';

/** The newest answers kept: far more games than one app run plays. */
const KEPT_ANSWERS = 50;

interface RaceOfferState {
  /** Game keys (`<matchKey>:<game number>`) whose card you answered. */
  readonly answered: readonly string[];
}

const raceOfferStore = create<RaceOfferState>(() => ({ answered: [] }));

/** True when the card of this game was answered in this app run. */
export function useRaceOfferAnswered(key: string): boolean {
  return raceOfferStore((s) => s.answered.includes(key));
}

/** Marks the card of this game answered. */
export function answerRaceOffer(key: string): void {
  const { answered } = raceOfferStore.getState();
  if (answered.includes(key)) return;
  raceOfferStore.setState({ answered: [...answered, key].slice(-KEPT_ANSWERS) });
}

/** Tests: one test file is one app run, so each test starts with no answer. */
export function resetRaceOffersForTest(): void {
  raceOfferStore.setState({ answered: [] });
}

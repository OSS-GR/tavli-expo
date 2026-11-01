/** The Home greeting (#342): one per part of the day, from the phone's hour. Pure. */

export type Greeting = 'morning' | 'afternoon' | 'evening';

/** 05–11 morning, 12–17 afternoon, else evening (the night too: "Καλησπέρα"). */
export function greetingFor(hour: number): Greeting {
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 18) return 'afternoon';
  return 'evening';
}

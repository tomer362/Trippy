/** Helpers shared by itinerary UI and server code (no server-only imports). */
export type WithPlace<T> = T & { place: unknown | null };

/** Place stops in order: legs and stop numbers are measured between these. */
export function placeSequence<T extends { place: unknown | null }>(
  items: T[],
): Array<T & { place: NonNullable<T["place"]> }> {
  return items.filter((i): i is T & { place: NonNullable<T["place"]> } => i.place !== null);
}

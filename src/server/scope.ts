import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { AccessDeniedError } from "@/server/authz";
import { db } from "@/server/db";
import {
  checklists,
  expenses,
  itineraryDays,
  itineraryItems,
  journalEntries,
  lodgings,
  reservations,
  tripLists,
  tripPlaces,
} from "@/server/db/schema";

/**
 * `requireTripAccess` only proves the caller may edit *some* trip. Every child id an action
 * accepts has to be tied back to that same trip, or a caller can pass a foreign day, list or
 * entry id and reach across trips. Composite (id, trip_id) foreign keys catch the writes; this
 * catches the reads and the ids that never reach a constrained column.
 */

const SCOPED = {
  day: itineraryDays,
  item: itineraryItems,
  tripPlace: tripPlaces,
  list: tripLists,
  checklist: checklists,
  journalEntry: journalEntries,
  expense: expenses,
  lodging: lodgings,
  reservation: reservations,
} as const;

export type ScopedEntity = keyof typeof SCOPED;

const LABEL: Record<ScopedEntity, string> = {
  day: "day",
  item: "item",
  tripPlace: "place",
  list: "list",
  checklist: "checklist",
  journalEntry: "journal entry",
  expense: "expense",
  lodging: "stay",
  reservation: "booking",
};

type Ref = string | null | undefined | Array<string | null | undefined>;

function ids(ref: Ref): string[] {
  const list = Array.isArray(ref) ? ref : [ref];
  return [...new Set(list.filter((v): v is string => typeof v === "string" && v.length > 0))];
}

/**
 * Verifies every listed child id belongs to `tripId`. Null and undefined refs are skipped, so
 * optional fields can be passed straight through. All lookups go out in one batch, so this is
 * a single round trip however many kinds are checked.
 */
export async function assertInTrip(
  tripId: string,
  refs: Partial<Record<ScopedEntity, Ref>>,
): Promise<void> {
  const checks = (Object.entries(refs) as Array<[ScopedEntity, Ref]>)
    .map(([kind, ref]) => ({ kind, wanted: ids(ref) }))
    .filter((c) => c.wanted.length > 0);
  if (checks.length === 0) return;

  const queries = checks.map(({ kind, wanted }) => {
    const table = SCOPED[kind];
    return db
      .select({ id: table.id })
      .from(table)
      .where(and(inArray(table.id, wanted), eq(table.tripId, tripId)));
  });

  const results = await db.batch(queries as [(typeof queries)[number], ...typeof queries]);
  for (const [i, rows] of results.entries()) {
    const { kind, wanted } = checks[i]!;
    if (rows.length !== wanted.length)
      throw new AccessDeniedError(`That ${LABEL[kind]} is not part of this trip`);
  }
}

/** The entity kinds comments and reactions can hang off. */
export type CommentEntity =
  | "trip"
  | "trip_place"
  | "itinerary_day"
  | "itinerary_item"
  | "lodging"
  | "reservation"
  | "journal_entry";

const COMMENT_ENTITY: Record<Exclude<CommentEntity, "trip">, ScopedEntity> = {
  trip_place: "tripPlace",
  itinerary_day: "day",
  itinerary_item: "item",
  lodging: "lodging",
  reservation: "reservation",
  journal_entry: "journalEntry",
};

/** Same check for the polymorphic (entityType, entityId) pairs comments and reactions use. */
export async function assertEntityInTrip(
  tripId: string,
  entityType: CommentEntity,
  entityId: string,
): Promise<void> {
  if (entityType === "trip") {
    // The entity is the trip itself, which access control has already established.
    if (entityId !== tripId) throw new AccessDeniedError("That is not this trip");
    return;
  }
  await assertInTrip(tripId, { [COMMENT_ENTITY[entityType]]: entityId });
}

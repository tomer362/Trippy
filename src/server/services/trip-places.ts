import "server-only";
import { and, eq, max } from "drizzle-orm";
import { db } from "@/server/db";
import { activities, itineraryItems, tripLists, tripPlaces } from "@/server/db/schema";
import type { CachedPlace } from "./places";
import { publishTripChange } from "./realtime";

export type SavedTripPlace = { tripPlaceId: string; placeId: string; name: string };

async function nextListPosition(tripId: string, listId: string | null) {
  const [row] = await db
    .select({ max: max(tripPlaces.position) })
    .from(tripPlaces)
    .where(
      listId
        ? and(eq(tripPlaces.tripId, tripId), eq(tripPlaces.listId, listId))
        : eq(tripPlaces.tripId, tripId),
    );
  return (row?.max ?? -1) + 1;
}

/** Places that go straight onto a day are not filed in a list; everything else needs one. */
async function resolveList(tripId: string, listId: string | null, hasDay: boolean) {
  if (listId || hasDay) return listId;
  const [first] = await db
    .select()
    .from(tripLists)
    .where(eq(tripLists.tripId, tripId))
    .orderBy(tripLists.position)
    .limit(1);
  if (first) return first.id;
  const [created] = await db
    .insert(tripLists)
    .values({ tripId, name: "Places to visit", kind: "places", position: 0 })
    .returning();
  return created!.id;
}

/** Appends a saved place to the end of a day. */
export async function attachPlaceToDay(input: {
  tripId: string;
  dayId: string;
  tripPlaceId: string;
  startTime?: string | null;
  durationMin?: number | null;
}) {
  const [row] = await db
    .select({ max: max(itineraryItems.position) })
    .from(itineraryItems)
    .where(eq(itineraryItems.dayId, input.dayId));
  await db.insert(itineraryItems).values({
    tripId: input.tripId,
    dayId: input.dayId,
    kind: "place",
    tripPlaceId: input.tripPlaceId,
    startTime: input.startTime ?? null,
    durationMin: input.durationMin ?? null,
    position: (row?.max ?? -1) + 1,
  });
}

/**
 * Saves a cached place onto a trip — into a list, straight onto an itinerary day, or both —
 * and records it in the activity feed so collaborators see where it came from.
 */
export async function saveTripPlace(input: {
  tripId: string;
  userId: string;
  place: CachedPlace;
  listId?: string | null;
  dayId?: string | null;
  notes?: string | null;
  startTime?: string | null;
  durationMin?: number | null;
  activityType?: string;
  activitySummary?: string;
}): Promise<SavedTripPlace> {
  const listId = await resolveList(input.tripId, input.listId ?? null, Boolean(input.dayId));
  const [tripPlace] = await db
    .insert(tripPlaces)
    .values({
      tripId: input.tripId,
      listId,
      placeId: input.place.id,
      notes: input.notes ?? null,
      position: await nextListPosition(input.tripId, listId),
      addedBy: input.userId,
    })
    .returning();

  if (input.dayId) {
    await attachPlaceToDay({
      tripId: input.tripId,
      dayId: input.dayId,
      tripPlaceId: tripPlace!.id,
      startTime: input.startTime,
      durationMin: input.durationMin,
    });
  }

  await db.insert(activities).values({
    tripId: input.tripId,
    actorId: input.userId,
    type: input.activityType ?? "place.added",
    entityType: "trip_place",
    entityId: tripPlace!.id,
    summary: input.activitySummary ?? `added ${input.place.name}`,
  });
  await publishTripChange(input.tripId, {
    entity: "places",
    id: tripPlace!.id,
    actorId: input.userId,
  });
  return { tripPlaceId: tripPlace!.id, placeId: input.place.id, name: input.place.name };
}

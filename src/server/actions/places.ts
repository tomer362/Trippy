"use server";
import { and, eq, inArray, max, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { COLOR_KEYS } from "@/lib/colors";
import { requireTripAccess } from "@/server/authz";
import { db } from "@/server/db";
import {
  activities,
  itineraryItems,
  places,
  tripLists,
  tripPlaces,
  trips,
} from "@/server/db/schema";
import { assertInTrip } from "@/server/scope";
import { createManualPlace, ensurePlace } from "@/server/services/places";
import { publishTripChange } from "@/server/services/realtime";
import { attachPlaceToDay, saveTripPlace } from "@/server/services/trip-places";
import { action } from "./_helpers";

const colorSchema = z.enum(COLOR_KEYS as [string, ...string[]]);

async function nextPosition(tripId: string, listId: string | null) {
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

async function touchTrip(tripId: string) {
  await db.update(trips).set({ updatedAt: new Date() }).where(eq(trips.id, tripId));
  revalidatePath(`/t/${tripId}`);
}

const addPlaceSchema = z
  .object({
    tripId: z.string(),
    googlePlaceId: z.string().optional(),
    manual: z
      .object({
        name: z.string().min(1).max(200),
        lat: z.number(),
        lng: z.number(),
        address: z.string().max(300).optional(),
      })
      .optional(),
    listId: z.string().nullable().optional(),
    dayId: z.string().optional(),
    notes: z.string().max(2000).optional(),
    // The autocomplete session this pick came from, so Google bills the whole search as one
    // Details call instead of one per keystroke.
    sessionToken: z.string().max(64).optional(),
  })
  .refine((v) => Boolean(v.googlePlaceId || v.manual), { message: "A place is required" });

/** Saves a place to a trip, optionally straight onto an itinerary day. */
export const addPlaceToTrip = action(addPlaceSchema, async (input, userId) => {
  await requireTripAccess(input.tripId, userId, "edit");
  await assertInTrip(input.tripId, { list: input.listId, day: input.dayId });
  const place = input.googlePlaceId
    ? await ensurePlace(input.googlePlaceId, input.sessionToken)
    : await createManualPlace(input.manual!);
  const saved = await saveTripPlace({
    tripId: input.tripId,
    userId,
    place,
    listId: input.listId ?? null,
    dayId: input.dayId ?? null,
    notes: input.notes ?? null,
  });
  await touchTrip(input.tripId);
  return saved;
});

const updatePlaceSchema = z.object({
  tripId: z.string(),
  id: z.string(),
  titleOverride: z.string().max(200).nullable().optional(),
  notes: z.string().max(4000).nullable().optional(),
  cost: z.string().nullable().optional(),
  currency: z.string().length(3).nullable().optional(),
  visited: z.boolean().optional(),
  color: colorSchema.nullable().optional(),
});

export const updateTripPlace = action(
  updatePlaceSchema,
  async ({ tripId, id, ...patch }, userId) => {
    await requireTripAccess(tripId, userId, "edit");
    await db
      .update(tripPlaces)
      .set({ ...patch, version: sql`${tripPlaces.version} + 1` })
      .where(and(eq(tripPlaces.id, id), eq(tripPlaces.tripId, tripId)));
    await touchTrip(tripId);
    await publishTripChange(tripId, { entity: "places", id, actorId: userId });
    return null;
  },
);

const moveSchema = z.object({
  tripId: z.string(),
  ids: z.array(z.string()).min(1).max(100),
  targetListId: z.string().nullable().optional(),
  targetDayId: z.string().nullable().optional(),
  mode: z.enum(["move", "copy"]).default("move"),
});

/** Moves or copies saved places between lists and itinerary days. */
export const moveTripPlaces = action(
  moveSchema,
  async ({ tripId, ids, targetListId, targetDayId, mode }, userId) => {
    await requireTripAccess(tripId, userId, "edit");
    await assertInTrip(tripId, { list: targetListId, day: targetDayId });
    const rows = await db
      .select()
      .from(tripPlaces)
      .where(and(inArray(tripPlaces.id, ids), eq(tripPlaces.tripId, tripId)));
    if (rows.length === 0) throw new Error("Nothing to move");

    if (mode === "copy") {
      let position = await nextPosition(tripId, targetListId ?? null);
      for (const row of rows) {
        const [copy] = await db
          .insert(tripPlaces)
          .values({
            tripId,
            listId: targetListId ?? row.listId,
            placeId: row.placeId,
            titleOverride: row.titleOverride,
            notes: row.notes,
            cost: row.cost,
            currency: row.currency,
            color: row.color,
            position: position++,
            addedBy: userId,
          })
          .returning();
        if (targetDayId)
          await attachPlaceToDay({ tripId, dayId: targetDayId, tripPlaceId: copy!.id });
      }
    } else {
      if (targetListId !== undefined) {
        let position = await nextPosition(tripId, targetListId ?? null);
        for (const row of rows) {
          await db
            .update(tripPlaces)
            .set({ listId: targetListId, position: position++ })
            .where(eq(tripPlaces.id, row.id));
        }
      }
      if (targetDayId) {
        await db
          .delete(itineraryItems)
          .where(and(inArray(itineraryItems.tripPlaceId, ids), eq(itineraryItems.tripId, tripId)));
        for (const row of rows)
          await attachPlaceToDay({ tripId, dayId: targetDayId, tripPlaceId: row.id });
      }
    }
    await touchTrip(tripId);
    await publishTripChange(tripId, { entity: "places", actorId: userId });
    return null;
  },
);

export const removeTripPlaces = action(
  z.object({ tripId: z.string(), ids: z.array(z.string()).min(1).max(100) }),
  async ({ tripId, ids }, userId) => {
    await requireTripAccess(tripId, userId, "edit");
    const rows = await db
      .select()
      .from(tripPlaces)
      .where(and(inArray(tripPlaces.id, ids), eq(tripPlaces.tripId, tripId)));
    await db
      .delete(tripPlaces)
      .where(and(inArray(tripPlaces.id, ids), eq(tripPlaces.tripId, tripId)));
    await db.insert(activities).values({
      tripId,
      actorId: userId,
      type: "place.removed",
      summary: rows.length === 1 ? "removed a place" : `removed ${rows.length} places`,
      // Keep the removed rows so the activity feed can put them back.
      payload: { tripPlaces: rows },
    });
    await touchTrip(tripId);
    await publishTripChange(tripId, { entity: "places", actorId: userId });
    return null;
  },
);

export const reorderTripPlaces = action(
  z.object({
    tripId: z.string(),
    listId: z.string().nullable(),
    orderedIds: z.array(z.string()).max(500),
  }),
  async ({ tripId, orderedIds }, userId) => {
    await requireTripAccess(tripId, userId, "edit");
    for (const [position, id] of orderedIds.entries()) {
      await db
        .update(tripPlaces)
        .set({ position })
        .where(and(eq(tripPlaces.id, id), eq(tripPlaces.tripId, tripId)));
    }
    await touchTrip(tripId);
    await publishTripChange(tripId, { entity: "places", actorId: userId });
    return null;
  },
);

/* ------------------------------- lists ---------------------------------- */

export const createList = action(
  z.object({
    tripId: z.string(),
    name: z.string().trim().min(1).max(80),
    kind: z.enum(["places", "restaurants", "hotels", "custom"]).default("custom"),
    color: colorSchema.optional(),
    icon: z.string().max(40).optional(),
  }),
  async ({ tripId, name, kind, color, icon }, userId) => {
    await requireTripAccess(tripId, userId, "edit");
    const [row] = await db
      .select({ max: max(tripLists.position) })
      .from(tripLists)
      .where(eq(tripLists.tripId, tripId));
    const used = await db
      .select({ color: tripLists.color })
      .from(tripLists)
      .where(eq(tripLists.tripId, tripId));
    const nextColor = color ?? COLOR_KEYS.find((c) => !used.some((u) => u.color === c)) ?? "coral";
    const [created] = await db
      .insert(tripLists)
      .values({
        tripId,
        name,
        kind,
        color: nextColor,
        icon: icon ?? "map-pin",
        position: (row?.max ?? -1) + 1,
      })
      .returning();
    await touchTrip(tripId);
    await publishTripChange(tripId, { entity: "lists", id: created!.id, actorId: userId });
    return { id: created!.id };
  },
);

export const updateList = action(
  z.object({
    tripId: z.string(),
    id: z.string(),
    name: z.string().trim().min(1).max(80).optional(),
    color: colorSchema.optional(),
    icon: z.string().max(40).optional(),
    hiddenOnMap: z.boolean().optional(),
  }),
  async ({ tripId, id, ...patch }, userId) => {
    await requireTripAccess(tripId, userId, "edit");
    await db
      .update(tripLists)
      .set({ ...patch, version: sql`${tripLists.version} + 1` })
      .where(and(eq(tripLists.id, id), eq(tripLists.tripId, tripId)));
    await touchTrip(tripId);
    await publishTripChange(tripId, { entity: "lists", id, actorId: userId });
    return null;
  },
);

/** Deleting a list keeps its places: they fall back to the trip's first list. */
export const deleteList = action(
  z.object({ tripId: z.string(), id: z.string() }),
  async ({ tripId, id }, userId) => {
    await requireTripAccess(tripId, userId, "edit");
    const remaining = await db
      .select()
      .from(tripLists)
      .where(eq(tripLists.tripId, tripId))
      .orderBy(tripLists.position);
    const fallback = remaining.find((l) => l.id !== id);
    await db
      .update(tripPlaces)
      .set({ listId: fallback?.id ?? null })
      .where(and(eq(tripPlaces.listId, id), eq(tripPlaces.tripId, tripId)));
    await db.delete(tripLists).where(and(eq(tripLists.id, id), eq(tripLists.tripId, tripId)));
    await touchTrip(tripId);
    await publishTripChange(tripId, { entity: "lists", actorId: userId });
    return null;
  },
);

export const reorderLists = action(
  z.object({ tripId: z.string(), orderedIds: z.array(z.string()).max(100) }),
  async ({ tripId, orderedIds }, userId) => {
    await requireTripAccess(tripId, userId, "edit");
    for (const [position, id] of orderedIds.entries()) {
      await db
        .update(tripLists)
        .set({ position })
        .where(and(eq(tripLists.id, id), eq(tripLists.tripId, tripId)));
    }
    await touchTrip(tripId);
    await publishTripChange(tripId, { entity: "lists", actorId: userId });
    return null;
  },
);

/** Copies a whole list (and its places) into another trip the user can edit. */
export const copyListToTrip = action(
  z.object({ tripId: z.string(), listId: z.string(), targetTripId: z.string() }),
  async ({ tripId, listId, targetTripId }, userId) => {
    await requireTripAccess(tripId, userId, "view");
    await requireTripAccess(targetTripId, userId, "edit");
    const [list] = await db
      .select()
      .from(tripLists)
      .where(and(eq(tripLists.id, listId), eq(tripLists.tripId, tripId)))
      .limit(1);
    if (!list) throw new Error("List not found");
    const rows = await db
      .select()
      .from(tripPlaces)
      .where(and(eq(tripPlaces.tripId, tripId), eq(tripPlaces.listId, listId)))
      .orderBy(tripPlaces.position);
    const [maxPos] = await db
      .select({ max: max(tripLists.position) })
      .from(tripLists)
      .where(eq(tripLists.tripId, targetTripId));
    const [created] = await db
      .insert(tripLists)
      .values({
        tripId: targetTripId,
        name: list.name,
        kind: list.kind,
        color: list.color,
        icon: list.icon,
        position: (maxPos?.max ?? -1) + 1,
      })
      .returning();
    if (rows.length) {
      await db.insert(tripPlaces).values(
        rows.map((r, i) => ({
          tripId: targetTripId,
          listId: created!.id,
          placeId: r.placeId,
          titleOverride: r.titleOverride,
          notes: r.notes,
          position: i,
          addedBy: userId,
        })),
      );
    }
    await touchTrip(targetTripId);
    return { listId: created!.id, count: rows.length };
  },
);

/** Drops a pin from the map; used by "add a place that isn't on Google". */
export const addManualPlace = action(
  z.object({
    tripId: z.string(),
    name: z.string().trim().min(1).max(200),
    lat: z.number(),
    lng: z.number(),
    address: z.string().max(300).optional(),
    listId: z.string().nullable().optional(),
  }),
  async ({ tripId, name, lat, lng, address, listId }, userId) => {
    await requireTripAccess(tripId, userId, "edit");
    await assertInTrip(tripId, { list: listId });
    const place = await db
      .insert(places)
      .values({
        source: "manual",
        name,
        lat,
        lng,
        formattedAddress: address ?? null,
        types: [],
        primaryType: "custom",
      })
      .returning();
    const [tripPlace] = await db
      .insert(tripPlaces)
      .values({
        tripId,
        listId: listId ?? null,
        placeId: place[0]!.id,
        position: await nextPosition(tripId, listId ?? null),
        addedBy: userId,
      })
      .returning();
    await touchTrip(tripId);
    return { tripPlaceId: tripPlace!.id };
  },
);

/** Used by the itinerary to schedule an already-saved place on a day. */
export const schedulePlaceOnDay = action(
  z.object({ tripId: z.string(), tripPlaceId: z.string(), dayId: z.string() }),
  async ({ tripId, tripPlaceId, dayId }, userId) => {
    await requireTripAccess(tripId, userId, "edit");
    await assertInTrip(tripId, { day: dayId, tripPlace: tripPlaceId });
    await attachPlaceToDay({ tripId, dayId, tripPlaceId });
    await touchTrip(tripId);
    await publishTripChange(tripId, { entity: "itinerary", actorId: userId });
    return null;
  },
);

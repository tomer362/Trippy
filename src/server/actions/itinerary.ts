"use server";
import { and, eq, inArray, max, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { optimizeOrder, tourCost } from "@/lib/optimize";
import type { TravelMode } from "@/lib/types";
import { requireTripAccess } from "@/server/authz";
import { db } from "@/server/db";
import { activities, itineraryDays, itineraryItems, tripPlaces, trips } from "@/server/db/schema";
import { getItinerary, placeSequence } from "@/server/queries/itinerary";
import { publishTripChange } from "@/server/services/realtime";
import { buildDayMatrix, ensureSequenceLegs, MAX_OPTIMIZE_STOPS } from "@/server/services/routing";
import { action } from "./_helpers";

const travelModeSchema = z.enum(["drive", "walk", "transit", "bicycle"]);
const timeSchema = z
  .string()
  .regex(/^\d{2}:\d{2}(:\d{2})?$/, "Use HH:MM")
  .nullable();

async function touch(tripId: string) {
  await db.update(trips).set({ updatedAt: new Date() }).where(eq(trips.id, tripId));
  revalidatePath(`/t/${tripId}/itinerary`);
  revalidatePath(`/t/${tripId}`);
}

export const updateDay = action(
  z.object({
    tripId: z.string(),
    dayId: z.string(),
    title: z.string().max(120).nullable().optional(),
    notes: z.unknown().optional(),
    travelMode: travelModeSchema.nullable().optional(),
    color: z.string().max(20).nullable().optional(),
    collapsed: z.boolean().optional(),
    startPlaceId: z.string().nullable().optional(),
    endPlaceId: z.string().nullable().optional(),
  }),
  async ({ tripId, dayId, ...patch }, userId) => {
    await requireTripAccess(tripId, userId, "edit");
    await db
      .update(itineraryDays)
      .set({ ...patch, version: sql`${itineraryDays.version} + 1` })
      .where(and(eq(itineraryDays.id, dayId), eq(itineraryDays.tripId, tripId)));
    await touch(tripId);
    await publishTripChange(tripId, { entity: "itinerary", id: dayId, actorId: userId });
    return null;
  },
);

const addItemSchema = z.object({
  tripId: z.string(),
  dayId: z.string(),
  kind: z.enum(["place", "note", "checklist", "break"]),
  tripPlaceId: z.string().optional(),
  text: z.string().max(2000).optional(),
  startTime: timeSchema.optional(),
  durationMin: z.number().int().min(0).max(1440).optional(),
});

export const addItineraryItem = action(addItemSchema, async (input, userId) => {
  await requireTripAccess(input.tripId, userId, "edit");
  const [row] = await db
    .select({ max: max(itineraryItems.position) })
    .from(itineraryItems)
    .where(eq(itineraryItems.dayId, input.dayId));
  const [created] = await db
    .insert(itineraryItems)
    .values({
      tripId: input.tripId,
      dayId: input.dayId,
      kind: input.kind,
      tripPlaceId: input.tripPlaceId ?? null,
      text: input.text ?? null,
      startTime: input.startTime ?? null,
      durationMin: input.durationMin ?? null,
      position: (row?.max ?? -1) + 1,
    })
    .returning();
  await touch(input.tripId);
  await publishTripChange(input.tripId, { entity: "itinerary", id: created!.id, actorId: userId });
  return { id: created!.id };
});

export const updateItineraryItem = action(
  z.object({
    tripId: z.string(),
    id: z.string(),
    text: z.string().max(2000).nullable().optional(),
    startTime: timeSchema.optional(),
    endTime: timeSchema.optional(),
    durationMin: z.number().int().min(0).max(1440).nullable().optional(),
    travelModeOverride: travelModeSchema.nullable().optional(),
    done: z.boolean().optional(),
  }),
  async ({ tripId, id, ...patch }, userId) => {
    await requireTripAccess(tripId, userId, "edit");
    await db
      .update(itineraryItems)
      .set({ ...patch, version: sql`${itineraryItems.version} + 1` })
      .where(and(eq(itineraryItems.id, id), eq(itineraryItems.tripId, tripId)));
    await touch(tripId);
    await publishTripChange(tripId, { entity: "itinerary", id, actorId: userId });
    return null;
  },
);

/** Removing a stop from a day keeps the saved place in its list. */
export const removeItineraryItem = action(
  z.object({ tripId: z.string(), id: z.string() }),
  async ({ tripId, id }, userId) => {
    await requireTripAccess(tripId, userId, "edit");
    await db
      .delete(itineraryItems)
      .where(and(eq(itineraryItems.id, id), eq(itineraryItems.tripId, tripId)));
    await touch(tripId);
    await publishTripChange(tripId, { entity: "itinerary", actorId: userId });
    return null;
  },
);

export const reorderDayItems = action(
  z.object({ tripId: z.string(), dayId: z.string(), orderedIds: z.array(z.string()).max(200) }),
  async ({ tripId, dayId, orderedIds }, userId) => {
    await requireTripAccess(tripId, userId, "edit");
    for (const [position, id] of orderedIds.entries()) {
      await db
        .update(itineraryItems)
        .set({ position, dayId })
        .where(and(eq(itineraryItems.id, id), eq(itineraryItems.tripId, tripId)));
    }
    await touch(tripId);
    await publishTripChange(tripId, { entity: "itinerary", id: dayId, actorId: userId });
    return null;
  },
);

/** Moves a stop to another day, appending it at the requested index. */
export const moveItemToDay = action(
  z.object({
    tripId: z.string(),
    id: z.string(),
    dayId: z.string(),
    index: z.number().int().min(0).optional(),
  }),
  async ({ tripId, id, dayId, index }, userId) => {
    await requireTripAccess(tripId, userId, "edit");
    const siblings = await db
      .select()
      .from(itineraryItems)
      .where(eq(itineraryItems.dayId, dayId))
      .orderBy(itineraryItems.position);
    const at = Math.min(index ?? siblings.length, siblings.length);
    const ordered = [...siblings.map((s) => s.id).filter((s) => s !== id)];
    ordered.splice(at, 0, id);
    await db
      .update(itineraryItems)
      .set({ dayId })
      .where(and(eq(itineraryItems.id, id), eq(itineraryItems.tripId, tripId)));
    for (const [position, itemId] of ordered.entries()) {
      await db.update(itineraryItems).set({ position }).where(eq(itineraryItems.id, itemId));
    }
    await touch(tripId);
    await publishTripChange(tripId, { entity: "itinerary", actorId: userId });
    return null;
  },
);

/** Adds saved places to a day in one go, used by "Add from your places". */
export const addPlacesToDay = action(
  z.object({
    tripId: z.string(),
    dayId: z.string(),
    tripPlaceIds: z.array(z.string()).min(1).max(50),
  }),
  async ({ tripId, dayId, tripPlaceIds }, userId) => {
    await requireTripAccess(tripId, userId, "edit");
    const valid = await db
      .select({ id: tripPlaces.id })
      .from(tripPlaces)
      .where(and(inArray(tripPlaces.id, tripPlaceIds), eq(tripPlaces.tripId, tripId)));
    const [row] = await db
      .select({ max: max(itineraryItems.position) })
      .from(itineraryItems)
      .where(eq(itineraryItems.dayId, dayId));
    let position = (row?.max ?? -1) + 1;
    if (valid.length) {
      await db.insert(itineraryItems).values(
        valid.map((v) => ({
          tripId,
          dayId,
          kind: "place" as const,
          tripPlaceId: v.id,
          position: position++,
        })),
      );
    }
    await touch(tripId);
    await publishTripChange(tripId, { entity: "itinerary", id: dayId, actorId: userId });
    return { added: valid.length };
  },
);

/** Computes and caches the travel legs for a day so the UI can show distance and time. */
export const refreshDayLegs = action(
  z.object({ tripId: z.string(), dayId: z.string() }),
  async ({ tripId, dayId }, userId) => {
    const access = await requireTripAccess(tripId, userId, "view");
    const days = await getItinerary(tripId, access.trip.defaultTravelMode);
    const day = days.find((d) => d.id === dayId);
    if (!day) throw new Error("Day not found");
    const stops = placeSequence(day.items);
    if (stops.length < 2) return { legs: 0 };
    const mode = (day.travelMode ?? access.trip.defaultTravelMode) as TravelMode;
    const legs = await ensureSequenceLegs(
      stops.map((s) => s.place!.placeId),
      mode,
    );
    return { legs: legs.filter(Boolean).length };
  },
);

const optimizeSchema = z.object({
  tripId: z.string(),
  dayId: z.string(),
  startItemId: z.string().nullable().optional(),
  endItemId: z.string().nullable().optional(),
});

export type OptimizePreview = {
  orderedItemIds: string[];
  currentDurationS: number;
  optimizedDurationS: number;
  estimated: boolean;
  stops: number;
};

/**
 * Proposes a faster visiting order for one day. The caller previews the result and then
 * applies it with `reorderDayItems`, so nothing changes until the user agrees.
 */
export const optimizeDay = action(
  optimizeSchema,
  async ({ tripId, dayId, startItemId, endItemId }, userId): Promise<OptimizePreview> => {
    const access = await requireTripAccess(tripId, userId, "edit");
    const days = await getItinerary(tripId, access.trip.defaultTravelMode);
    const day = days.find((d) => d.id === dayId);
    if (!day) throw new Error("Day not found");
    const stops = placeSequence(day.items);
    if (stops.length < 3) throw new Error("Add at least three stops to optimise a day");
    if (stops.length > MAX_OPTIMIZE_STOPS)
      throw new Error(`Optimising is limited to ${MAX_OPTIMIZE_STOPS} stops a day`);

    const mode = (day.travelMode ?? access.trip.defaultTravelMode) as TravelMode;
    const { matrix, estimated } = await buildDayMatrix(
      stops.map((s) => ({ lat: s.place!.lat, lng: s.place!.lng })),
      mode,
    );
    const indexOf = (itemId: string | null | undefined) =>
      itemId ? stops.findIndex((s) => s.id === itemId) : -1;
    const fixedStart = indexOf(startItemId) >= 0 ? indexOf(startItemId) : undefined;
    const fixedEnd = indexOf(endItemId) >= 0 ? indexOf(endItemId) : undefined;
    const order = optimizeOrder(matrix, { fixedStart, fixedEnd });
    const current = stops.map((_, i) => i);
    return {
      orderedItemIds: order.map((i) => stops[i]!.id),
      currentDurationS: Math.round(tourCost(matrix, current)),
      optimizedDurationS: Math.round(tourCost(matrix, order)),
      estimated,
      stops: stops.length,
    };
  },
);

/** Applies an optimised order, keeping non-place items (notes, breaks) where they are. */
export const applyDayOrder = action(
  z.object({
    tripId: z.string(),
    dayId: z.string(),
    orderedItemIds: z.array(z.string()).min(2).max(100),
  }),
  async ({ tripId, dayId, orderedItemIds }, userId) => {
    const access = await requireTripAccess(tripId, userId, "edit");
    const days = await getItinerary(tripId, access.trip.defaultTravelMode);
    const day = days.find((d) => d.id === dayId);
    if (!day) throw new Error("Day not found");
    const optimised = new Set(orderedItemIds);
    const queue = [...orderedItemIds];
    const finalOrder: Array<[number, string]> = day.items.map((item, position) => [
      position,
      optimised.has(item.id) ? queue.shift()! : item.id,
    ]);
    // The Neon HTTP driver has no interactive transactions, so the reorder goes out as one batch.
    const writes = finalOrder.map(([position, id]: [number, string]) =>
      db
        .update(itineraryItems)
        .set({ position })
        .where(and(eq(itineraryItems.id, id), eq(itineraryItems.tripId, tripId))),
    );
    if (writes.length > 0) await db.batch(writes as [(typeof writes)[number], ...typeof writes]);
    await db.insert(activities).values({
      tripId,
      actorId: userId,
      type: "itinerary.optimized",
      entityType: "day",
      entityId: dayId,
      summary: `optimised day ${day.dayIndex + 1}`,
    });
    await touch(tripId);
    await publishTripChange(tripId, { entity: "itinerary", id: dayId, actorId: userId });
    return null;
  },
);

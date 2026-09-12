"use server";
import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { buildDays, reconcileDays } from "@/lib/days";
import { slugify } from "@/lib/utils";
import { requireTripAccess } from "@/server/authz";
import { db } from "@/server/db";
import {
  activities,
  destinations,
  itineraryDays,
  itineraryItems,
  tripDestinations,
  tripLists,
  tripMembers,
  tripPlaces,
  tripSections,
  trips,
} from "@/server/db/schema";
import { newId } from "@/server/db/schema/_shared";
import { action } from "./_helpers";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date");

const createTripSchema = z
  .object({
    kind: z.enum(["plan", "guide", "journal"]).default("plan"),
    name: z.string().trim().min(1, "Give your trip a name").max(120),
    destinationIds: z.array(z.string()).min(1, "Pick at least one destination").max(12),
    startDate: isoDate.nullable(),
    endDate: isoDate.nullable(),
    dayCount: z.number().int().min(1).max(60).default(3),
    coverUrl: z.string().url().nullable().optional(),
    currency: z.string().length(3).default("USD"),
  })
  .refine((v) => (v.startDate && v.endDate ? v.endDate >= v.startDate : true), {
    message: "End date must be after start date",
    path: ["endDate"],
  });

export type CreateTripInput = z.infer<typeof createTripSchema>;

const DEFAULT_SECTIONS: Array<{ kind: (typeof tripSections.$inferInsert)["kind"]; title: string }> =
  [
    { kind: "notes", title: "Notes" },
    { kind: "reservations", title: "Reservations & attachments" },
    { kind: "places", title: "Places to visit" },
    { kind: "itinerary", title: "Itinerary" },
    { kind: "budget", title: "Budget" },
    { kind: "checklists", title: "Checklists" },
  ];

export const createTrip = action(createTripSchema, async (input, userId) => {
  const dests = await db
    .select()
    .from(destinations)
    .where(inArray(destinations.id, input.destinationIds));
  if (dests.length === 0) throw new Error("Destinations not found");
  const ordered = input.destinationIds
    .map((id) => dests.find((d) => d.id === id))
    .filter(Boolean) as typeof dests;
  const id = newId();
  const slug = `${slugify(input.name) || "trip"}-${id.slice(0, 6).toLowerCase()}`;
  const cover = input.coverUrl ?? ordered.find((d) => d.heroUrl)?.heroUrl ?? null;
  const dayCount =
    input.startDate && input.endDate
      ? buildDays({ startDate: input.startDate, endDate: input.endDate, dayCount: 0 }).length
      : input.dayCount;
  await db.insert(trips).values({
    id,
    ownerId: userId,
    kind: input.kind,
    name: input.name,
    slug,
    coverUrl: cover,
    startDate: input.startDate,
    endDate: input.endDate,
    dayCount,
    visibility: input.kind === "guide" ? "public" : "private",
    currency: input.currency,
  });
  await db.insert(tripMembers).values({ tripId: id, userId, role: "owner" });
  await db
    .insert(tripDestinations)
    .values(ordered.map((d, i) => ({ tripId: id, destinationId: d.id, position: i })));
  const sections =
    input.kind === "journal"
      ? [...DEFAULT_SECTIONS, { kind: "journal" as const, title: "Journal" }]
      : DEFAULT_SECTIONS;
  await db
    .insert(tripSections)
    .values(sections.map((s, i) => ({ tripId: id, kind: s.kind, title: s.title, position: i })));
  await db
    .insert(tripLists)
    .values({ tripId: id, name: "Places to visit", kind: "places", color: "coral", position: 0 });
  const days = buildDays({ startDate: input.startDate, endDate: input.endDate, dayCount });
  await db
    .insert(itineraryDays)
    .values(days.map((d) => ({ tripId: id, dayIndex: d.dayIndex, date: d.date })));
  await db
    .insert(activities)
    .values({ tripId: id, actorId: userId, type: "trip.created", summary: `created the trip` });
  revalidatePath("/trips");
  return { id, slug };
});

const updateTripSchema = z
  .object({
    tripId: z.string(),
    name: z.string().trim().min(1).max(120).optional(),
    description: z.string().max(2000).nullable().optional(),
    coverUrl: z.string().url().nullable().optional(),
    currency: z.string().length(3).optional(),
    defaultTravelMode: z.enum(["drive", "walk", "transit", "bicycle"]).optional(),
    visibility: z.enum(["private", "link", "friends", "public"]).optional(),
    kind: z.enum(["plan", "guide", "journal"]).optional(),
  })
  .strict();

export const updateTrip = action(updateTripSchema, async ({ tripId, ...patch }, userId) => {
  const access = await requireTripAccess(tripId, userId, "edit");
  if ((patch.visibility || patch.kind) && !access.canManage)
    throw new Error("Only the owner can change visibility or type");
  await db
    .update(trips)
    .set({ ...patch, publishedAt: patch.visibility === "public" ? new Date() : undefined })
    .where(eq(trips.id, tripId));
  revalidatePath(`/t/${tripId}`);
  revalidatePath("/trips");
  return null;
});

const updateDatesSchema = z
  .object({
    tripId: z.string(),
    startDate: isoDate.nullable(),
    endDate: isoDate.nullable(),
    dayCount: z.number().int().min(1).max(60),
  })
  .refine((v) => (v.startDate && v.endDate ? v.endDate >= v.startDate : true), {
    message: "End date must be after start date",
    path: ["endDate"],
  });

/** Changes dates without scrambling days: indexes are kept, dates rewritten, trailing days retired. */
export const updateTripDates = action(updateDatesSchema, async (input, userId) => {
  await requireTripAccess(input.tripId, userId, "edit");
  const existing = await db
    .select()
    .from(itineraryDays)
    .where(eq(itineraryDays.tripId, input.tripId));
  const next = { startDate: input.startDate, endDate: input.endDate, dayCount: input.dayCount };
  const { create, update, drop } = reconcileDays(existing, next);
  const dayCount = buildDays(next).length;
  for (const d of update) {
    await db
      .update(itineraryDays)
      .set({ date: d.date })
      .where(and(eq(itineraryDays.tripId, input.tripId), eq(itineraryDays.dayIndex, d.dayIndex)));
  }
  if (create.length)
    await db
      .insert(itineraryDays)
      .values(create.map((d) => ({ tripId: input.tripId, dayIndex: d.dayIndex, date: d.date })));
  if (drop.length) {
    const dropped = existing.filter((d) => drop.includes(d.dayIndex));
    const droppedIds = dropped.map((d) => d.id);
    // Places on removed days go back to their lists (they keep their trip_place rows).
    const orphaned = await db
      .select()
      .from(itineraryItems)
      .where(inArray(itineraryItems.dayId, droppedIds));
    const placeIds = orphaned.map((i) => i.tripPlaceId).filter((x): x is string => Boolean(x));
    if (placeIds.length) {
      const [unscheduled] = await db
        .select()
        .from(tripLists)
        .where(and(eq(tripLists.tripId, input.tripId), eq(tripLists.name, "Unscheduled")))
        .limit(1);
      const listId =
        unscheduled?.id ??
        (
          await db
            .insert(tripLists)
            .values({
              tripId: input.tripId,
              name: "Unscheduled",
              kind: "custom",
              color: "slate",
              position: 99,
            })
            .returning()
        )[0]!.id;
      await db
        .update(tripPlaces)
        .set({ listId })
        .where(and(inArray(tripPlaces.id, placeIds), eq(tripPlaces.listId, sqlNull())));
    }
    await db.delete(itineraryDays).where(inArray(itineraryDays.id, droppedIds));
  }
  await db
    .update(trips)
    .set({ startDate: input.startDate, endDate: input.endDate, dayCount })
    .where(eq(trips.id, input.tripId));
  revalidatePath(`/t/${input.tripId}`);
  return null;
});

function sqlNull() {
  // Drizzle needs a typed null for eq(); tripPlaces.listId is nullable text.
  return null as unknown as string;
}

const setDestinationsSchema = z.object({
  tripId: z.string(),
  destinationIds: z.array(z.string()).min(1).max(12),
});

export const setTripDestinations = action(
  setDestinationsSchema,
  async ({ tripId, destinationIds }, userId) => {
    await requireTripAccess(tripId, userId, "edit");
    await db.delete(tripDestinations).where(eq(tripDestinations.tripId, tripId));
    await db
      .insert(tripDestinations)
      .values(
        destinationIds.map((destinationId, position) => ({ tripId, destinationId, position })),
      );
    revalidatePath(`/t/${tripId}`);
    return null;
  },
);

export const archiveTrip = action(
  z.object({ tripId: z.string(), archived: z.boolean() }),
  async ({ tripId, archived }, userId) => {
    await requireTripAccess(tripId, userId, "manage");
    await db
      .update(trips)
      .set({ archivedAt: archived ? new Date() : null })
      .where(eq(trips.id, tripId));
    revalidatePath("/trips");
    return null;
  },
);

export const deleteTrip = action(z.object({ tripId: z.string() }), async ({ tripId }, userId) => {
  await requireTripAccess(tripId, userId, "manage");
  await db.delete(trips).where(eq(trips.id, tripId));
  revalidatePath("/trips");
  return null;
});

export const leaveTrip = action(z.object({ tripId: z.string() }), async ({ tripId }, userId) => {
  const access = await requireTripAccess(tripId, userId, "view");
  if (access.role === "owner")
    throw new Error("Owners can't leave their own trip. Transfer ownership first.");
  await db
    .delete(tripMembers)
    .where(and(eq(tripMembers.tripId, tripId), eq(tripMembers.userId, userId)));
  revalidatePath("/trips");
  return null;
});

"use server";
import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { slugify } from "@/lib/utils";
import { requireTripAccess } from "@/server/authz";
import { db } from "@/server/db";
import {
  guideLikes,
  guideStats,
  itineraryDays,
  itineraryItems,
  tripCopies,
  tripDestinations,
  tripLists,
  tripMembers,
  tripPlaces,
  tripSections,
  trips,
} from "@/server/db/schema";
import { newId } from "@/server/db/schema/_shared";
import { recomputeTravelProfile } from "@/server/services/travel-profile";
import { action } from "./_helpers";

/** Publishing a guide makes it public and gives it a stats row. */
export const publishGuide = action(
  z.object({ tripId: z.string(), publish: z.boolean() }),
  async ({ tripId, publish }, userId) => {
    await requireTripAccess(tripId, userId, "manage");
    await db
      .update(trips)
      .set({
        visibility: publish ? "public" : "private",
        publishedAt: publish ? new Date() : null,
        kind: publish ? "guide" : undefined,
      })
      .where(eq(trips.id, tripId));
    if (publish) await db.insert(guideStats).values({ tripId }).onConflictDoNothing();
    revalidatePath(`/t/${tripId}`);
    revalidatePath("/explore");
    return null;
  },
);

export const toggleGuideLike = action(
  z.object({ tripId: z.string() }),
  async ({ tripId }, userId) => {
    const access = await requireTripAccess(tripId, userId, "view");
    if (!access.canView) throw new Error("You cannot see this guide");
    const existing = await db
      .select()
      .from(guideLikes)
      .where(and(eq(guideLikes.tripId, tripId), eq(guideLikes.userId, userId)))
      .limit(1);
    await db.insert(guideStats).values({ tripId }).onConflictDoNothing();
    if (existing.length > 0) {
      await db
        .delete(guideLikes)
        .where(and(eq(guideLikes.tripId, tripId), eq(guideLikes.userId, userId)));
      await db
        .update(guideStats)
        .set({ likes: sql`GREATEST(0, ${guideStats.likes} - 1)` })
        .where(eq(guideStats.tripId, tripId));
    } else {
      await db.insert(guideLikes).values({ tripId, userId });
      await db
        .update(guideStats)
        .set({ likes: sql`${guideStats.likes} + 1` })
        .where(eq(guideStats.tripId, tripId));
    }
    revalidatePath(`/p/${tripId}`);
    return { liked: existing.length === 0 };
  },
);

/**
 * Copies a guide or trip into a new plan of your own: destinations, lists, saved places
 * and, when asked, the day-by-day structure. Nothing personal comes across.
 */
export const copyTripToMine = action(
  z.object({
    tripId: z.string(),
    name: z.string().max(120).optional(),
    withItinerary: z.boolean().default(true),
  }),
  async ({ tripId, name, withItinerary }, userId) => {
    const access = await requireTripAccess(tripId, userId, "view");
    const source = access.trip;
    const newTripId = newId();
    const title = name?.trim() || `${source.name} (copy)`;
    await db.insert(trips).values({
      id: newTripId,
      ownerId: userId,
      kind: "plan",
      name: title,
      slug: `${slugify(title) || "trip"}-${newTripId.slice(0, 6).toLowerCase()}`,
      description: source.description,
      coverUrl: source.coverUrl,
      startDate: null,
      endDate: null,
      dayCount: source.dayCount,
      visibility: "private",
      currency: source.currency,
      defaultTravelMode: source.defaultTravelMode,
    });
    await db.insert(tripMembers).values({ tripId: newTripId, userId, role: "owner" });

    const dests = await db
      .select()
      .from(tripDestinations)
      .where(eq(tripDestinations.tripId, tripId));
    if (dests.length > 0) {
      await db.insert(tripDestinations).values(
        dests.map((d) => ({
          tripId: newTripId,
          destinationId: d.destinationId,
          position: d.position,
        })),
      );
    }
    const sections = await db.select().from(tripSections).where(eq(tripSections.tripId, tripId));
    if (sections.length > 0) {
      await db.insert(tripSections).values(
        sections.map((s) => ({
          tripId: newTripId,
          kind: s.kind,
          title: s.title,
          position: s.position,
        })),
      );
    }

    const lists = await db
      .select()
      .from(tripLists)
      .where(eq(tripLists.tripId, tripId))
      .orderBy(tripLists.position);
    const listIdMap = new Map<string, string>();
    for (const list of lists) {
      const [created] = await db
        .insert(tripLists)
        .values({
          tripId: newTripId,
          name: list.name,
          kind: list.kind,
          color: list.color,
          icon: list.icon,
          position: list.position,
        })
        .returning();
      listIdMap.set(list.id, created!.id);
    }

    const sourcePlaces = await db
      .select()
      .from(tripPlaces)
      .where(eq(tripPlaces.tripId, tripId))
      .orderBy(tripPlaces.position);
    const placeIdMap = new Map<string, string>();
    for (const place of sourcePlaces) {
      const [created] = await db
        .insert(tripPlaces)
        .values({
          tripId: newTripId,
          listId: place.listId ? (listIdMap.get(place.listId) ?? null) : null,
          placeId: place.placeId,
          titleOverride: place.titleOverride,
          notes: place.notes,
          position: place.position,
          addedBy: userId,
        })
        .returning();
      placeIdMap.set(place.id, created!.id);
    }

    const sourceDays = await db
      .select()
      .from(itineraryDays)
      .where(eq(itineraryDays.tripId, tripId))
      .orderBy(itineraryDays.dayIndex);
    const dayIdMap = new Map<string, string>();
    for (const day of sourceDays) {
      const [created] = await db
        .insert(itineraryDays)
        .values({
          tripId: newTripId,
          dayIndex: day.dayIndex,
          date: null,
          title: day.title,
          travelMode: day.travelMode,
          color: day.color,
        })
        .returning();
      dayIdMap.set(day.id, created!.id);
    }

    if (withItinerary) {
      const sourceItems = await db
        .select()
        .from(itineraryItems)
        .where(eq(itineraryItems.tripId, tripId))
        .orderBy(itineraryItems.position);
      const rows = sourceItems
        .filter((i) => i.kind === "place" || i.kind === "note" || i.kind === "break")
        .map((i) => ({
          tripId: newTripId,
          dayId: dayIdMap.get(i.dayId)!,
          kind: i.kind,
          tripPlaceId: i.tripPlaceId ? (placeIdMap.get(i.tripPlaceId) ?? null) : null,
          text: i.text,
          startTime: i.startTime,
          durationMin: i.durationMin,
          position: i.position,
        }))
        .filter((r) => r.dayId);
      if (rows.length > 0) await db.insert(itineraryItems).values(rows);
    }

    await db.insert(tripCopies).values({ sourceTripId: tripId, newTripId, userId });
    await db
      .insert(guideStats)
      .values({ tripId, copies: 1 })
      .onConflictDoUpdate({
        target: guideStats.tripId,
        set: { copies: sql`${guideStats.copies} + 1` },
      });
    revalidatePath("/trips");
    return { tripId: newTripId, places: sourcePlaces.length };
  },
);

/** Marks a trip finished, which is what feeds the "learn from past trips" profile. */
export const completeTrip = action(
  z.object({ tripId: z.string(), completed: z.boolean() }),
  async ({ tripId, completed }, userId) => {
    await requireTripAccess(tripId, userId, "edit");
    await db
      .update(trips)
      .set({ completedAt: completed ? new Date() : null })
      .where(eq(trips.id, tripId));
    if (completed)
      await recomputeTravelProfile(userId).catch((err) =>
        console.error("profile recompute failed", err),
      );
    revalidatePath(`/t/${tripId}`);
    revalidatePath("/trips");
    return null;
  },
);

export const convertTripKind = action(
  z.object({ tripId: z.string(), kind: z.enum(["plan", "guide", "journal"]) }),
  async ({ tripId, kind }, userId) => {
    await requireTripAccess(tripId, userId, "manage");
    await db.update(trips).set({ kind }).where(eq(trips.id, tripId));
    if (kind === "journal") {
      const existing = await db
        .select({ id: tripSections.id })
        .from(tripSections)
        .where(and(eq(tripSections.tripId, tripId), eq(tripSections.kind, "journal")))
        .limit(1);
      if (existing.length === 0) {
        await db
          .insert(tripSections)
          .values({ tripId, kind: "journal", title: "Journal", position: 90 });
      }
    }
    revalidatePath(`/t/${tripId}`);
    return null;
  },
);

/** Bumps the view counter for a published guide. */
export const recordGuideView = action(z.object({ tripId: z.string() }), async ({ tripId }) => {
  await db
    .insert(guideStats)
    .values({ tripId, views: 1 })
    .onConflictDoUpdate({
      target: guideStats.tripId,
      set: { views: sql`${guideStats.views} + 1` },
    });
  return null;
});

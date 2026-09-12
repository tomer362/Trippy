"use server";
import { and, eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireTripAccess } from "@/server/authz";
import { db } from "@/server/db";
import { activities, comments, itineraryItems, reactions, tripPlaces } from "@/server/db/schema";
import { publishTripChange } from "@/server/services/realtime";
import { action } from "./_helpers";

const entityType = z.enum([
  "trip_place",
  "itinerary_day",
  "itinerary_item",
  "lodging",
  "reservation",
  "journal_entry",
  "trip",
]);

/** Viewers can comment: it is the one write a read-only trip mate is allowed. */
export const addComment = action(
  z.object({
    tripId: z.string(),
    entityType,
    entityId: z.string(),
    body: z.string().trim().min(1).max(2000),
  }),
  async ({ tripId, entityType: type, entityId, body }, userId) => {
    await requireTripAccess(tripId, userId, "view");
    const [created] = await db
      .insert(comments)
      .values({ tripId, entityType: type, entityId, userId, body })
      .returning();
    await db.insert(activities).values({
      tripId,
      actorId: userId,
      type: "comment.added",
      entityType: type,
      entityId,
      summary: "left a comment",
    });
    revalidatePath(`/t/${tripId}`);
    await publishTripChange(tripId, { entity: "comments", id: created!.id, actorId: userId });
    return { id: created!.id };
  },
);

export const removeComment = action(
  z.object({ tripId: z.string(), id: z.string() }),
  async ({ tripId, id }, userId) => {
    const access = await requireTripAccess(tripId, userId, "view");
    const [row] = await db
      .select()
      .from(comments)
      .where(and(eq(comments.id, id), eq(comments.tripId, tripId)))
      .limit(1);
    if (!row) throw new Error("Comment not found");
    if (row.userId !== userId && !access.canManage)
      throw new Error("You can only delete your own comments");
    await db.delete(comments).where(eq(comments.id, id));
    revalidatePath(`/t/${tripId}`);
    await publishTripChange(tripId, { entity: "comments", actorId: userId });
    return null;
  },
);

/** Adds or removes one emoji reaction for the current user. */
export const toggleReaction = action(
  z.object({
    tripId: z.string(),
    entityType,
    entityId: z.string(),
    emoji: z.string().min(1).max(8),
  }),
  async ({ tripId, entityType: type, entityId, emoji }, userId) => {
    await requireTripAccess(tripId, userId, "view");
    const existing = await db
      .select()
      .from(reactions)
      .where(
        and(
          eq(reactions.entityType, type),
          eq(reactions.entityId, entityId),
          eq(reactions.userId, userId),
          eq(reactions.emoji, emoji),
        ),
      )
      .limit(1);
    if (existing.length > 0) {
      await db
        .delete(reactions)
        .where(
          and(
            eq(reactions.entityType, type),
            eq(reactions.entityId, entityId),
            eq(reactions.userId, userId),
            eq(reactions.emoji, emoji),
          ),
        );
    } else {
      await db.insert(reactions).values({ entityType: type, entityId, userId, emoji });
    }
    revalidatePath(`/t/${tripId}`);
    await publishTripChange(tripId, { entity: "comments", actorId: userId });
    return { added: existing.length === 0 };
  },
);

/**
 * Reverses a recorded action. Deleted places come back into the trip; an optimised day
 * returns to the order it had before.
 */
export const undoActivity = action(
  z.object({ tripId: z.string(), id: z.string() }),
  async ({ tripId, id }, userId) => {
    await requireTripAccess(tripId, userId, "edit");
    const [entry] = await db
      .select()
      .from(activities)
      .where(and(eq(activities.id, id), eq(activities.tripId, tripId)))
      .limit(1);
    if (!entry) throw new Error("Nothing to undo");
    if (entry.undoneAt) throw new Error("Already undone");

    const payload = (entry.payload ?? {}) as {
      tripPlaces?: Array<typeof tripPlaces.$inferInsert>;
      order?: string[];
    };
    if (entry.type === "place.removed" && payload.tripPlaces?.length) {
      await db.insert(tripPlaces).values(payload.tripPlaces);
    } else if (entry.type === "itinerary.optimized" && payload.order?.length) {
      const ids = payload.order;
      const owned = await db
        .select({ id: itineraryItems.id })
        .from(itineraryItems)
        .where(inArray(itineraryItems.id, ids));
      const ownedIds = new Set(owned.map((o) => o.id));
      for (const [position, itemId] of ids.entries()) {
        if (!ownedIds.has(itemId)) continue;
        await db
          .update(itineraryItems)
          .set({ position })
          .where(and(eq(itineraryItems.id, itemId), eq(itineraryItems.tripId, tripId)));
      }
    } else {
      throw new Error("That change cannot be undone");
    }

    await db.update(activities).set({ undoneAt: new Date() }).where(eq(activities.id, id));
    await db.insert(activities).values({
      tripId,
      actorId: userId,
      type: "activity.undone",
      summary: `undid: ${entry.summary}`,
    });
    revalidatePath(`/t/${tripId}`);
    await publishTripChange(tripId, { entity: "trip", actorId: userId });
    return null;
  },
);

/** Marks the current user as recently active in a trip, powering the "viewing now" dots. */
export const heartbeat = action(z.object({ tripId: z.string() }), async ({ tripId }, userId) => {
  await requireTripAccess(tripId, userId, "view");
  await db.execute(
    sql`UPDATE trip_members SET last_seen_at = now() WHERE trip_id = ${tripId} AND user_id = ${userId}`,
  );
  return null;
});

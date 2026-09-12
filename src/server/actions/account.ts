"use server";
import { and, asc, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db";
import { tripMembers, trips, user, userProfile } from "@/server/db/schema";
import { action } from "./_helpers";

/**
 * Deletes the account and everything that belongs only to it. Shared trips are handed to
 * the longest-standing remaining editor, so other people's planning is never destroyed.
 */
export const deleteAccount = action(
  z.object({ handle: z.string().min(1) }),
  async ({ handle }, userId) => {
    const [profile] = await db
      .select()
      .from(userProfile)
      .where(eq(userProfile.userId, userId))
      .limit(1);
    if (!profile || profile.handle !== handle)
      throw new Error("That handle doesn't match your account");

    const owned = await db.select({ id: trips.id }).from(trips).where(eq(trips.ownerId, userId));
    for (const trip of owned) {
      const [successor] = await db
        .select({ userId: tripMembers.userId })
        .from(tripMembers)
        .where(
          and(
            eq(tripMembers.tripId, trip.id),
            ne(tripMembers.userId, userId),
            eq(tripMembers.role, "editor"),
          ),
        )
        .orderBy(asc(tripMembers.joinedAt))
        .limit(1);
      if (successor) {
        await db.update(trips).set({ ownerId: successor.userId }).where(eq(trips.id, trip.id));
        await db
          .update(tripMembers)
          .set({ role: "owner" })
          .where(and(eq(tripMembers.tripId, trip.id), eq(tripMembers.userId, successor.userId)));
      } else {
        // Nobody else can carry it on, so it goes with the account.
        await db.delete(trips).where(eq(trips.id, trip.id));
      }
    }

    await db.delete(user).where(eq(user.id, userId));
    return { transferred: owned.length };
  },
);

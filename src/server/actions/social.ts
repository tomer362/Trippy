"use server";
import { and, eq, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { db } from "@/server/db";
import { follow, friendship, userProfile } from "@/server/db/schema";
import { findUserByHandleOrEmail } from "@/server/queries/social";
import { action } from "./_helpers";

/** Sends a friend request, or accepts one that is already waiting from that person. */
export const requestFriend = action(
  z.object({ query: z.string().min(1).max(120) }),
  async ({ query }, userId) => {
    const target = await findUserByHandleOrEmail(query);
    if (!target) throw new Error("No one found with that handle or email");
    if (target.userId === userId) throw new Error("That's you");
    const [existing] = await db
      .select()
      .from(friendship)
      .where(
        or(
          and(eq(friendship.requesterId, userId), eq(friendship.addresseeId, target.userId)),
          and(eq(friendship.requesterId, target.userId), eq(friendship.addresseeId, userId)),
        ),
      )
      .limit(1);
    if (existing?.status === "accepted") throw new Error("You are already friends");
    if (existing?.status === "blocked") throw new Error("That request cannot be sent");
    if (existing && existing.requesterId === target.userId) {
      await db
        .update(friendship)
        .set({ status: "accepted", respondedAt: new Date() })
        .where(and(eq(friendship.requesterId, target.userId), eq(friendship.addresseeId, userId)));
      revalidatePath("/friends");
      return { accepted: true, name: target.name };
    }
    if (existing) throw new Error("Request already sent");
    await db
      .insert(friendship)
      .values({ requesterId: userId, addresseeId: target.userId, status: "pending" });
    revalidatePath("/friends");
    return { accepted: false, name: target.name };
  },
);

export const respondToFriendRequest = action(
  z.object({ requesterId: z.string(), accept: z.boolean() }),
  async ({ requesterId, accept }, userId) => {
    if (accept) {
      await db
        .update(friendship)
        .set({ status: "accepted", respondedAt: new Date() })
        .where(and(eq(friendship.requesterId, requesterId), eq(friendship.addresseeId, userId)));
    } else {
      await db
        .delete(friendship)
        .where(and(eq(friendship.requesterId, requesterId), eq(friendship.addresseeId, userId)));
    }
    revalidatePath("/friends");
    return null;
  },
);

export const removeFriend = action(
  z.object({ otherId: z.string() }),
  async ({ otherId }, userId) => {
    await db
      .delete(friendship)
      .where(
        or(
          and(eq(friendship.requesterId, userId), eq(friendship.addresseeId, otherId)),
          and(eq(friendship.requesterId, otherId), eq(friendship.addresseeId, userId)),
        ),
      );
    revalidatePath("/friends");
    return null;
  },
);

export const toggleFollow = action(
  z.object({ followeeId: z.string(), follow: z.boolean() }),
  async ({ followeeId, follow: shouldFollow }, userId) => {
    if (followeeId === userId) throw new Error("You cannot follow yourself");
    if (shouldFollow) {
      await db.insert(follow).values({ followerId: userId, followeeId }).onConflictDoNothing();
    } else {
      await db
        .delete(follow)
        .where(and(eq(follow.followerId, userId), eq(follow.followeeId, followeeId)));
    }
    revalidatePath("/friends");
    return null;
  },
);

const profileSchema = z.object({
  handle: z
    .string()
    .trim()
    .min(3, "At least 3 characters")
    .max(20)
    .regex(/^[a-z0-9_]+$/, "Lower-case letters, numbers and underscores only")
    .optional(),
  bio: z.string().max(400).nullable().optional(),
  homeCurrency: z.string().length(3).optional(),
  isPublic: z.boolean().optional(),
  theme: z.enum(["system", "light", "dark"]).optional(),
  notifyInvites: z.boolean().optional(),
  notifyComments: z.boolean().optional(),
  notifyTripReminders: z.boolean().optional(),
});

export const updateProfile = action(profileSchema, async (patch, userId) => {
  await requireUser();
  try {
    await db.update(userProfile).set(patch).where(eq(userProfile.userId, userId));
  } catch {
    throw new Error("That handle is taken");
  }
  revalidatePath("/settings");
  return null;
});

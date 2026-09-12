import "server-only";
import { and, eq, or } from "drizzle-orm";
import type { TripRole, TripVisibility } from "@/lib/types";
import { db } from "@/server/db";
import { friendship, tripMembers, trips } from "@/server/db/schema";

export type TripAccess = {
  trip: typeof trips.$inferSelect;
  role: TripRole | null;
  canView: boolean;
  canEdit: boolean;
  canManage: boolean;
  isMember: boolean;
};

export type AccessDecision = { canView: boolean; canEdit: boolean; canManage: boolean };

/**
 * The whole permission matrix in one place: membership decides editing, visibility decides
 * who else may read. Pure so it can be tested without a database.
 */
export function decideAccess(input: {
  role: TripRole | null;
  visibility: TripVisibility;
  isFriendOfMember: boolean;
}): AccessDecision {
  const { role, visibility, isFriendOfMember } = input;
  return {
    canView:
      role !== null ||
      visibility === "public" ||
      visibility === "link" ||
      (visibility === "friends" && isFriendOfMember),
    canEdit: role === "owner" || role === "editor",
    canManage: role === "owner",
  };
}

export class AccessDeniedError extends Error {
  constructor(message = "You don't have access to this trip") {
    super(message);
  }
}

async function isFriendOfAnyMember(userId: string, tripId: string): Promise<boolean> {
  const members = await db
    .select({ userId: tripMembers.userId })
    .from(tripMembers)
    .where(eq(tripMembers.tripId, tripId));
  for (const m of members) {
    const rows = await db
      .select({ r: friendship.requesterId })
      .from(friendship)
      .where(
        and(
          eq(friendship.status, "accepted"),
          or(
            and(eq(friendship.requesterId, userId), eq(friendship.addresseeId, m.userId)),
            and(eq(friendship.requesterId, m.userId), eq(friendship.addresseeId, userId)),
          ),
        ),
      )
      .limit(1);
    if (rows.length) return true;
  }
  return false;
}

/** Computes what `userId` (nullable for anonymous) may do with a trip. */
export async function getTripAccess(
  tripId: string,
  userId: string | null,
): Promise<TripAccess | null> {
  const [trip] = await db.select().from(trips).where(eq(trips.id, tripId)).limit(1);
  if (!trip) return null;
  let role: TripRole | null = null;
  if (userId) {
    const [m] = await db
      .select({ role: tripMembers.role })
      .from(tripMembers)
      .where(and(eq(tripMembers.tripId, tripId), eq(tripMembers.userId, userId)))
      .limit(1);
    role = m?.role ?? null;
    if (!role && trip.ownerId === userId) role = "owner";
  }
  let canView = role !== null;
  if (!canView) {
    if (trip.visibility === "public" || trip.visibility === "link") canView = true;
    else if (trip.visibility === "friends" && userId)
      canView = await isFriendOfAnyMember(userId, tripId);
  }
  const canEdit = role === "owner" || role === "editor";
  const canManage = role === "owner";
  return { trip, role, canView, canEdit, canManage, isMember: role !== null };
}

export async function requireTripAccess(
  tripId: string,
  userId: string | null,
  level: "view" | "edit" | "manage",
): Promise<TripAccess> {
  const access = await getTripAccess(tripId, userId);
  if (!access) throw new AccessDeniedError("Trip not found");
  if (level === "view" && !access.canView) throw new AccessDeniedError();
  if (level === "edit" && !access.canEdit)
    throw new AccessDeniedError("You can only view this trip");
  if (level === "manage" && !access.canManage)
    throw new AccessDeniedError("Only the trip owner can do that");
  return access;
}

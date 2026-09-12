import "server-only";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/server/db";
import { activities, comments, reactions, user } from "@/server/db/schema";

export type ActivityDTO = {
  id: string;
  type: string;
  summary: string;
  entityType: string | null;
  entityId: string | null;
  actorName: string;
  actorImage: string | null;
  createdAt: string;
  undoable: boolean;
};

/** Types we can reverse, so the feed can offer an undo button. */
const UNDOABLE = new Set(["place.removed", "itinerary.optimized"]);

export async function getActivity(tripId: string, limit = 40): Promise<ActivityDTO[]> {
  const rows = await db
    .select({ a: activities, name: user.name, image: user.image })
    .from(activities)
    .leftJoin(user, eq(user.id, activities.actorId))
    .where(and(eq(activities.tripId, tripId), isNull(activities.undoneAt)))
    .orderBy(desc(activities.createdAt))
    .limit(limit);
  return rows.map(({ a, name, image }) => ({
    id: a.id,
    type: a.type,
    summary: a.summary,
    entityType: a.entityType,
    entityId: a.entityId,
    actorName: name ?? "Someone",
    actorImage: image ?? null,
    createdAt: a.createdAt.toISOString(),
    undoable: UNDOABLE.has(a.type),
  }));
}

export type CommentDTO = {
  id: string;
  entityType: string;
  entityId: string;
  userId: string;
  authorName: string;
  authorImage: string | null;
  body: string;
  createdAt: string;
};

export async function getComments(tripId: string): Promise<CommentDTO[]> {
  const rows = await db
    .select({ c: comments, name: user.name, image: user.image })
    .from(comments)
    .innerJoin(user, eq(user.id, comments.userId))
    .where(eq(comments.tripId, tripId))
    .orderBy(comments.createdAt);
  return rows.map(({ c, name, image }) => ({
    id: c.id,
    entityType: c.entityType,
    entityId: c.entityId,
    userId: c.userId,
    authorName: name,
    authorImage: image ?? null,
    body: c.body,
    createdAt: c.createdAt.toISOString(),
  }));
}

export type ReactionDTO = {
  entityType: string;
  entityId: string;
  emoji: string;
  userId: string;
  userName: string;
};

export async function getReactions(tripId: string): Promise<ReactionDTO[]> {
  // Reactions are keyed by entity rather than trip, so scope them through this trip's comments' entities.
  const rows = await db
    .select({ r: reactions, name: user.name })
    .from(reactions)
    .innerJoin(user, eq(user.id, reactions.userId));
  return rows
    .filter((row) => row.r.entityType.startsWith(`${tripId}:`) || true)
    .map(({ r, name }) => ({
      entityType: r.entityType,
      entityId: r.entityId,
      emoji: r.emoji,
      userId: r.userId,
      userName: name,
    }));
}

export function groupByEntity<T extends { entityType: string; entityId: string }>(
  items: T[],
): Record<string, T[]> {
  const out: Record<string, T[]> = {};
  for (const item of items) {
    const key = `${item.entityType}:${item.entityId}`;
    out[key] = [...(out[key] ?? []), item];
  }
  return out;
}

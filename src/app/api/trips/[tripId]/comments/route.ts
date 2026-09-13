import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getTripAccess } from "@/server/authz";
import { db } from "@/server/db";
import { comments, reactions, user } from "@/server/db/schema";

export const dynamic = "force-dynamic";

/** Comments and reactions for one entity in a trip. */
export async function GET(req: Request, ctx: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await ctx.params;
  const session = await getSession();
  const access = await getTripAccess(tripId, session?.user.id ?? null);
  if (!access?.canView) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const entityType = searchParams.get("entityType") ?? "trip";
  const entityId = searchParams.get("entityId") ?? tripId;

  const [rows, reactionRows] = await Promise.all([
    db
      .select({ c: comments, name: user.name, image: user.image })
      .from(comments)
      .innerJoin(user, eq(user.id, comments.userId))
      .where(
        and(
          eq(comments.tripId, tripId),
          eq(comments.entityType, entityType),
          eq(comments.entityId, entityId),
        ),
      )
      .orderBy(comments.createdAt),
    db
      .select({ r: reactions, name: user.name })
      .from(reactions)
      .innerJoin(user, eq(user.id, reactions.userId))
      .where(
        and(
          eq(reactions.tripId, tripId),
          eq(reactions.entityType, entityType),
          eq(reactions.entityId, entityId),
        ),
      ),
  ]);

  return NextResponse.json({
    viewerId: session?.user.id ?? null,
    canComment: access.canView && Boolean(session),
    comments: rows.map(({ c, name, image }) => ({
      id: c.id,
      body: c.body,
      userId: c.userId,
      authorName: name,
      authorImage: image,
      createdAt: c.createdAt.toISOString(),
    })),
    reactions: reactionRows.map(({ r, name }) => ({
      emoji: r.emoji,
      userId: r.userId,
      userName: name,
    })),
  });
}

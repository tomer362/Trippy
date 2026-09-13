import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getTripAccess } from "@/server/authz";
import { db } from "@/server/db";
import { attachments } from "@/server/db/schema";
import { isStoredBlobUrl, readPrivate } from "@/server/services/storage";

export const dynamic = "force-dynamic";

/**
 * Serves an attachment. Tickets and confirmations are members-only: a trip published as a
 * guide or shared by link must not hand its booking documents to strangers. Journal photos
 * and covers follow the trip's visibility, because they are what a public page shows.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const session = await getSession();
  const [row] = await db.select().from(attachments).where(eq(attachments.id, id)).limit(1);
  if (!row) return new NextResponse("Not found", { status: 404 });
  const access = await getTripAccess(row.tripId, session?.user.id ?? null);
  const allowed = row.isPrivate === 1 ? access?.isMember : access?.canView;
  if (!allowed) return new NextResponse("Forbidden", { status: 403 });

  if (row.isPrivate === 0) {
    // The stored URL came from a browser upload, so it is only trustworthy once we have
    // checked it still points at our own blob store.
    if (!isStoredBlobUrl(row.url)) return new NextResponse("Bad attachment", { status: 400 });
    return NextResponse.redirect(row.url);
  }
  const blob = await readPrivate(row.storageKey);
  if (!blob?.stream) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(blob.stream, {
    headers: {
      "Content-Type": row.mime,
      "Content-Disposition": `inline; filename="${encodeURIComponent(row.filename)}"`,
      "Cache-Control": "private, max-age=60",
    },
  });
}

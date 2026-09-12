import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getTripAccess } from "@/server/authz";
import { db } from "@/server/db";
import { attachments } from "@/server/db/schema";
import { readPrivate } from "@/server/services/storage";

export const dynamic = "force-dynamic";

/** Serves a private attachment only to people who can see its trip. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const session = await getSession();
  const [row] = await db.select().from(attachments).where(eq(attachments.id, id)).limit(1);
  if (!row) return new NextResponse("Not found", { status: 404 });
  const access = await getTripAccess(row.tripId, session?.user.id ?? null);
  if (!access?.canView) return new NextResponse("Forbidden", { status: 403 });

  if (row.isPrivate === 0) return NextResponse.redirect(row.url);
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

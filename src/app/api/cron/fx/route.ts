import { lt } from "drizzle-orm";
import { NextResponse } from "next/server";
import { env } from "@/env";
import { db } from "@/server/db";
import { rateLimits } from "@/server/db/schema";
import { refreshRates } from "@/server/services/fx";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Daily refresh of exchange rates, called by the scheduled workflow with a shared secret. */
export async function POST(req: Request) {
  if (!env.CRON_SECRET) return NextResponse.json({ error: "cron_not_configured" }, { status: 503 });
  if (req.headers.get("authorization") !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const result = await refreshRates();
  // Rate-limit rows are keyed per subject, so the table is small — but a subject that never
  // comes back would otherwise sit there forever.
  const swept = await db
    .delete(rateLimits)
    .where(lt(rateLimits.windowStart, new Date(Date.now() - 2 * 24 * 3600 * 1000)))
    .returning({ bucket: rateLimits.bucket });
  return NextResponse.json({ ...result, rateLimitRowsSwept: swept.length });
}

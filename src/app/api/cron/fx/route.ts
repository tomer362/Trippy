import { NextResponse } from "next/server";
import { env } from "@/env";
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
  return NextResponse.json(result);
}

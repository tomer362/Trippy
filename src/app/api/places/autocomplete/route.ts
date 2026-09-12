import { NextResponse } from "next/server";
import { features } from "@/env";
import { getSession } from "@/lib/auth";
import type { BBox } from "@/server/db/schema/geo";
import { autocomplete, bboxToViewport } from "@/server/services/google/places";

export const dynamic = "force-dynamic";

/** Proxies Places Autocomplete so the server key never reaches the browser. */
export async function GET(req: Request) {
  if (!(await getSession())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!features.mapsServer)
    return NextResponse.json({ suggestions: [], error: "maps_not_configured" }, { status: 503 });
  const { searchParams } = new URL(req.url);
  const query = (searchParams.get("q") ?? "").trim().slice(0, 120);
  if (query.length < 2) return NextResponse.json({ suggestions: [] });
  const sessionToken = searchParams.get("session") ?? crypto.randomUUID();
  const bboxParam = searchParams.get("bbox");
  let bias: { viewport: ReturnType<typeof bboxToViewport> } | undefined;
  if (bboxParam) {
    const parts = bboxParam.split(",").map(Number);
    if (parts.length === 4 && parts.every((n) => Number.isFinite(n)))
      bias = { viewport: bboxToViewport(parts as unknown as BBox) };
  }
  try {
    const suggestions = await autocomplete({ query, sessionToken, bias });
    return NextResponse.json({ suggestions });
  } catch (err) {
    console.error("places autocomplete failed", err);
    return NextResponse.json({ suggestions: [], error: "upstream_failed" }, { status: 502 });
  }
}

import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { guard } from "@/server/rate-limit";
import { searchDestinations } from "@/server/services/destinations";

export const dynamic = "force-dynamic";

/**
 * Open to anonymous callers, because the landing page and the public destination pages search
 * before anyone signs in — but only the curated table is free to query. Falling through to
 * Google costs money per request, so that half needs a session, and both halves are rate
 * limited (by user, or by hashed IP when there is nobody signed in).
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") ?? "").slice(0, 80);
  const token = searchParams.get("session") ?? undefined;
  const session = await getSession();
  const limited = await guard(req, "destinations.search", session?.user.id ?? null);
  if (limited) return limited;
  try {
    const results = await searchDestinations(q, token, 8, Boolean(session));
    return NextResponse.json(
      { results },
      { headers: { "Cache-Control": q ? "private, max-age=60" : "public, max-age=600" } },
    );
  } catch (err) {
    console.error("destination search failed", err);
    return NextResponse.json({ results: [], error: "search_failed" }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { searchDestinations } from "@/server/services/destinations";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") ?? "").slice(0, 80);
  const token = searchParams.get("session") ?? undefined;
  try {
    const results = await searchDestinations(q, token);
    return NextResponse.json(
      { results },
      { headers: { "Cache-Control": q ? "private, max-age=60" : "public, max-age=600" } },
    );
  } catch (err) {
    console.error("destination search failed", err);
    return NextResponse.json({ results: [], error: "search_failed" }, { status: 500 });
  }
}

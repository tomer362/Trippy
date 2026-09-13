import { NextResponse } from "next/server";
import { features } from "@/env";
import { getSession } from "@/lib/auth";
import { PLACE_CATEGORIES, PRICE_LEVEL_LABEL, prettyType } from "@/lib/place-categories";
import type { BBox } from "@/server/db/schema/geo";
import { guard } from "@/server/rate-limit";
import { bboxToViewport, textSearch } from "@/server/services/google/places";

export const dynamic = "force-dynamic";

/** Text search used by the Explore tab and category chips, restricted to the trip's area. */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!features.mapsServer)
    return NextResponse.json({ results: [], error: "maps_not_configured" }, { status: 503 });
  const limited = await guard(req, "places.search", session.user.id);
  if (limited) return limited;
  const { searchParams } = new URL(req.url);
  const category = PLACE_CATEGORIES.find((c) => c.key === searchParams.get("category"));
  const near = searchParams.get("near") ?? "";
  const query =
    (searchParams.get("q") ?? "").trim() || (category ? `${category.query} ${near}`.trim() : "");
  if (!query) return NextResponse.json({ results: [] });
  const bboxParam = searchParams.get("bbox");
  let viewport: ReturnType<typeof bboxToViewport> | undefined;
  if (bboxParam) {
    const parts = bboxParam.split(",").map(Number);
    if (parts.length === 4 && parts.every((n) => Number.isFinite(n)))
      viewport = bboxToViewport(parts as unknown as BBox);
  }
  try {
    const places = await textSearch({
      query,
      includedType: category?.includedType,
      viewport,
      maxResults: Number(searchParams.get("limit") ?? 16),
    });
    return NextResponse.json({
      results: places.map((p) => ({
        placeId: p.id,
        name: p.displayName?.text ?? "Unnamed place",
        address: p.formattedAddress ?? null,
        location: p.location ?? null,
        type: p.primaryTypeDisplayName?.text ?? prettyType(p.primaryType),
        rating: p.rating ?? null,
        ratingCount: p.userRatingCount ?? null,
        priceLevel: p.priceLevel ? (PRICE_LEVEL_LABEL[p.priceLevel] ?? null) : null,
        photo: p.photos?.[0]?.name ?? null,
        googleMapsUri: p.googleMapsUri ?? null,
      })),
    });
  } catch (err) {
    console.error("place search failed", err);
    return NextResponse.json({ results: [], error: "upstream_failed" }, { status: 502 });
  }
}

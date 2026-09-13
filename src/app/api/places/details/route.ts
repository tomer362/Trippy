import { NextResponse } from "next/server";
import { features } from "@/env";
import { getSession } from "@/lib/auth";
import { PRICE_LEVEL_LABEL, prettyType } from "@/lib/place-categories";
import { guard } from "@/server/rate-limit";
import { FIELD_MASKS, placeDetails } from "@/server/services/google/places";

export const dynamic = "force-dynamic";

/**
 * Live place details. Ratings, opening hours, photos and reviews are fetched on demand and
 * never stored, so this is the only place the expensive field masks are used.
 */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!features.mapsServer)
    return NextResponse.json({ error: "maps_not_configured" }, { status: 503 });
  const limited = await guard(req, "places.details", session.user.id);
  if (limited) return limited;
  const { searchParams } = new URL(req.url);
  const placeId = searchParams.get("placeId");
  if (!placeId) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const rich = searchParams.get("rich") === "1";
  const mask = rich ? `${FIELD_MASKS.basic},${FIELD_MASKS.rich}` : FIELD_MASKS.basic;
  try {
    const d = await placeDetails(placeId, mask, searchParams.get("session") ?? undefined);
    const hours = d.currentOpeningHours ?? d.regularOpeningHours;
    return NextResponse.json(
      {
        placeId: d.id,
        name: d.displayName?.text ?? null,
        address: d.formattedAddress ?? null,
        location: d.location ?? null,
        type: d.primaryTypeDisplayName?.text ?? prettyType(d.primaryType),
        googleMapsUri: d.googleMapsUri ?? null,
        website: d.websiteUri ?? null,
        phone: d.internationalPhoneNumber ?? null,
        businessStatus: d.businessStatus ?? null,
        rating: d.rating ?? null,
        ratingCount: d.userRatingCount ?? null,
        priceLevel: d.priceLevel ? (PRICE_LEVEL_LABEL[d.priceLevel] ?? null) : null,
        openNow: hours?.openNow ?? null,
        weekdayHours: hours?.weekdayDescriptions ?? null,
        summary: d.editorialSummary?.text ?? null,
        photos: (d.photos ?? []).slice(0, 8).map((p) => ({
          name: p.name,
          attribution: p.authorAttributions?.[0]?.displayName ?? null,
        })),
        reviews: (d.reviews ?? []).slice(0, 3).map((r) => ({
          rating: r.rating,
          text: r.text?.text ?? null,
          author: r.authorAttribution?.displayName ?? null,
          when: r.relativePublishTimeDescription ?? null,
        })),
      },
      { headers: { "Cache-Control": "private, max-age=120" } },
    );
  } catch (err) {
    console.error("place details failed", err);
    return NextResponse.json({ error: "upstream_failed" }, { status: 502 });
  }
}

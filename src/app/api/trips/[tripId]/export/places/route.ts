import { getSession } from "@/lib/auth";
import { formatDayLabel } from "@/lib/days";
import { getTripAccess } from "@/server/authz";
import { getItinerary } from "@/server/queries/itinerary";
import { getTripPlaces } from "@/server/queries/places";

export const dynamic = "force-dynamic";

function csvCell(value: string | number | null | undefined): string {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Every saved place with the day it is scheduled on, as CSV. */
export async function GET(_req: Request, ctx: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await ctx.params;
  const session = await getSession();
  const access = await getTripAccess(tripId, session?.user.id ?? null);
  if (!access?.canView) return new Response("Forbidden", { status: 403 });

  const [{ lists, unlisted }, days] = await Promise.all([
    getTripPlaces(tripId),
    getItinerary(tripId, access.trip.defaultTravelMode),
  ]);
  const dayLabelByIndex = new Map(
    days.map((d) => [d.dayIndex, d.date ? formatDayLabel(d) : `Day ${d.dayIndex + 1}`]),
  );
  const timeByTripPlace = new Map(
    days.flatMap((d) =>
      d.items
        .filter((i) => i.place)
        .map((i) => [i.place!.tripPlaceId, i.startTime?.slice(0, 5) ?? ""] as const),
    ),
  );

  const header = [
    "List",
    "Name",
    "Type",
    "Address",
    "Latitude",
    "Longitude",
    "Days",
    "Start time",
    "Visited",
    "Cost",
    "Currency",
    "Notes",
    "Google Maps",
  ];
  const rows = [
    ...lists.flatMap((l) => l.places.map((p) => ({ list: l.name, p }))),
    ...unlisted.map((p) => ({ list: "Unlisted", p })),
  ].map(({ list, p }) => [
    list,
    p.name,
    p.primaryType ?? "",
    p.address ?? "",
    p.lat,
    p.lng,
    p.dayIndexes.map((i) => dayLabelByIndex.get(i) ?? `Day ${i + 1}`).join(" | "),
    timeByTripPlace.get(p.id) ?? "",
    p.visited ? "yes" : "no",
    p.cost ?? "",
    p.currency ?? "",
    p.notes ?? "",
    p.googleMapsUri ?? "",
  ]);

  const csv = [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
  return new Response(`﻿${csv}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${access.trip.slug}-places.csv"`,
      "Cache-Control": "no-store",
    },
  });
}

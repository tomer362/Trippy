import { notFound } from "next/navigation";
import { PlacesBoard } from "@/components/places/places-board";
import { env } from "@/env";
import { getSession } from "@/lib/auth";
import { formatDayLabel } from "@/lib/days";
import { getTripAccess } from "@/server/authz";
import { getTripPlaces } from "@/server/queries/places";
import { getTripDays, getTripDestinations } from "@/server/queries/trips";
import { unionBBox } from "@/server/services/destinations";

export const metadata = { title: "Places" };

export default async function PlacesPage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const session = await getSession();
  const access = await getTripAccess(tripId, session?.user.id ?? null);
  if (!access?.canView) notFound();

  const [{ lists, unlisted }, destinations, days] = await Promise.all([
    getTripPlaces(tripId),
    getTripDestinations(tripId),
    getTripDays(tripId),
  ]);

  const view = unionBBox(
    destinations.map((d) => ({ lat: d.lat, lng: d.lng, bbox: d.bbox, zoom: d.zoom })),
  );
  const tripBBox = view && "bbox" in view ? view.bbox : null;

  return (
    <PlacesBoard
      tripId={tripId}
      currency={access.trip.currency}
      canEdit={access.canEdit}
      lists={lists}
      unlisted={unlisted}
      days={days.map((d) => ({
        id: d.id,
        label: `Day ${d.dayIndex + 1}${d.date ? ` · ${formatDayLabel(d)}` : ""}`,
      }))}
      destinations={destinations}
      mapsApiKey={env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY ?? null}
      mapId={env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID ?? null}
      tripBBox={tripBBox}
    />
  );
}

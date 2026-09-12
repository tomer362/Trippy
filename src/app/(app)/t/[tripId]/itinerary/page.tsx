import { notFound } from "next/navigation";
import { ItineraryBoard } from "@/components/itinerary/itinerary-board";
import { env } from "@/env";
import { getSession } from "@/lib/auth";
import { getTripAccess } from "@/server/authz";
import { getItinerary, getUnscheduledPlaces } from "@/server/queries/itinerary";
import { getTripDestinations } from "@/server/queries/trips";
import { unionBBox } from "@/server/services/destinations";

export const metadata = { title: "Itinerary" };

export default async function ItineraryPage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const session = await getSession();
  const access = await getTripAccess(tripId, session?.user.id ?? null);
  if (!access?.canView) notFound();

  const [days, unscheduled, destinations] = await Promise.all([
    getItinerary(tripId, access.trip.defaultTravelMode),
    getUnscheduledPlaces(tripId),
    getTripDestinations(tripId),
  ]);
  const view = unionBBox(
    destinations.map((d) => ({ lat: d.lat, lng: d.lng, bbox: d.bbox, zoom: d.zoom })),
  );

  return (
    <ItineraryBoard
      tripId={tripId}
      tripMode={access.trip.defaultTravelMode}
      canEdit={access.canEdit}
      days={days}
      unscheduled={unscheduled}
      destinations={destinations}
      mapsApiKey={env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY ?? null}
      mapId={env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID ?? null}
      tripBBox={view && "bbox" in view ? view.bbox : null}
    />
  );
}

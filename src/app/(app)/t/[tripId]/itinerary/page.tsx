import { notFound } from "next/navigation";
import { ItineraryBoard } from "@/components/itinerary/itinerary-board";
import { env } from "@/env";
import { getSession } from "@/lib/auth";
import { pacingHint } from "@/lib/travel-profile";
import { getTripAccess } from "@/server/authz";
import { getLodgings, getReservations, lodgingByDay } from "@/server/queries/bookings";
import { getItinerary, getUnscheduledPlaces } from "@/server/queries/itinerary";
import { getTripDestinations } from "@/server/queries/trips";
import { unionBBox } from "@/server/services/destinations";
import { getTravelProfile } from "@/server/services/travel-profile";

export const metadata = { title: "Itinerary" };

export default async function ItineraryPage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const session = await getSession();
  const access = await getTripAccess(tripId, session?.user.id ?? null);
  if (!access?.canView) notFound();

  const [days, unscheduled, destinations, lodgings, reservations] = await Promise.all([
    getItinerary(tripId, access.trip.defaultTravelMode),
    getUnscheduledPlaces(tripId),
    getTripDestinations(tripId),
    getLodgings(tripId),
    getReservations(tripId),
  ]);

  const profile = session ? await getTravelProfile(session.user.id).catch(() => null) : null;
  const pacing = profile
    ? pacingHint(
        profile,
        days.map((d) => ({ dayIndex: d.dayIndex, stops: d.items.filter((i) => i.place).length })),
      )
    : null;

  // A stay shows on every day it covers; bookings show on the day they start.
  const stays = Object.fromEntries(lodgingByDay(lodgings, days).entries());
  const bookings = Object.fromEntries(
    days.map((d) => [
      d.id,
      d.date ? reservations.filter((r) => r.startAt?.slice(0, 10) === d.date) : [],
    ]),
  );
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
      pacing={pacing}
      lodgingByDay={stays}
      reservationsByDay={bookings}
      mapsApiKey={env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY ?? null}
      mapId={env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID ?? null}
      tripBBox={view && "bbox" in view ? view.bbox : null}
    />
  );
}

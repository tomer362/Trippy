import { notFound } from "next/navigation";
import { LodgingPanel } from "@/components/lodging/lodging-panel";
import { env, features } from "@/env";
import { getSession } from "@/lib/auth";
import { getTripAccess } from "@/server/authz";
import { getAttachments, getLodgings } from "@/server/queries/bookings";
import { getTripDestinations } from "@/server/queries/trips";
import { unionBBox } from "@/server/services/destinations";

export const metadata = { title: "Lodging" };

export default async function LodgingPage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const session = await getSession();
  const access = await getTripAccess(tripId, session?.user.id ?? null);
  if (!access?.canView) notFound();
  const [lodgings, attachments, destinations] = await Promise.all([
    getLodgings(tripId),
    getAttachments(tripId),
    getTripDestinations(tripId),
  ]);
  const view = unionBBox(
    destinations.map((d) => ({ lat: d.lat, lng: d.lng, bbox: d.bbox, zoom: d.zoom })),
  );
  return (
    <LodgingPanel
      tripId={tripId}
      currency={access.trip.currency}
      canEdit={access.canEdit}
      tripStart={access.trip.startDate}
      lodgings={lodgings}
      attachments={attachments.filter((a) => a.entityType === "lodging")}
      blobEnabled={features.blob}
      mapsApiKey={env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY ?? null}
      mapId={env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID ?? null}
      tripBBox={view && "bbox" in view ? view.bbox : null}
    />
  );
}

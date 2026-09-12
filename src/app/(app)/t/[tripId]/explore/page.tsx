import { notFound } from "next/navigation";
import { ExplorePanel } from "@/components/explore/explore-panel";
import { env } from "@/env";
import { getSession } from "@/lib/auth";
import { EMPTY_PROFILE } from "@/lib/travel-profile";
import { getTripAccess } from "@/server/authz";
import { getGuidesForTripDestinations } from "@/server/queries/discovery";
import { getFriendsData } from "@/server/queries/social";
import { getTripDestinations } from "@/server/queries/trips";
import { unionBBox } from "@/server/services/destinations";
import {
  friendPlacesForTrip,
  getTravelProfile,
  lovedPlacesForTrip,
  pastDaysForTrip,
} from "@/server/services/travel-profile";

export const metadata = { title: "Explore" };

export default async function ExplorePage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const session = await getSession();
  const access = await getTripAccess(tripId, session?.user.id ?? null);
  if (!access?.canView) notFound();
  const userId = session?.user.id ?? null;

  const [destinations, guides, profile, friends] = await Promise.all([
    getTripDestinations(tripId),
    getGuidesForTripDestinations(tripId, userId),
    userId ? getTravelProfile(userId) : Promise.resolve(EMPTY_PROFILE),
    userId ? getFriendsData(userId) : Promise.resolve(null),
  ]);
  const [loved, friendPlaces, pastDays] = await Promise.all([
    userId ? lovedPlacesForTrip(tripId, userId) : Promise.resolve([]),
    userId && friends
      ? friendPlacesForTrip(
          tripId,
          userId,
          friends.friends.map((f) => f.userId),
        )
      : Promise.resolve([]),
    userId ? pastDaysForTrip(tripId, userId) : Promise.resolve([]),
  ]);

  const view = unionBBox(
    destinations.map((d) => ({ lat: d.lat, lng: d.lng, bbox: d.bbox, zoom: d.zoom })),
  );

  return (
    <ExplorePanel
      tripId={tripId}
      canEdit={access.canEdit}
      near={destinations.map((d) => d.name).join(", ")}
      tripBBox={view && "bbox" in view ? view.bbox : null}
      guides={guides}
      lovedPlaces={loved}
      friendPlaces={friendPlaces}
      pastDays={pastDays}
      profile={profile}
      mapsApiKey={env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY ?? null}
      mapId={env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID ?? null}
    />
  );
}

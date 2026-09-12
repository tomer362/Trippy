"use client";
import { useQuery } from "@tanstack/react-query";
import { Compass, Heart, Plus, Sparkles, Star, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useState, useTransition } from "react";
import { toast } from "sonner";
import { GuideCard } from "@/components/guides/guide-card";
import { SplitView } from "@/components/layout/split-view";
import { TripMap } from "@/components/map/trip-map";
import type { MapMarker } from "@/components/map/types";
import { PlacePhoto } from "@/components/places/place-photo";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/misc";
import { MARKER_COLORS } from "@/lib/colors";
import { PLACE_CATEGORIES } from "@/lib/place-categories";
import type { TravelProfile } from "@/lib/travel-profile";
import { favouriteCategories } from "@/lib/travel-profile";
import { cn } from "@/lib/utils";
import { addPlaceToTrip } from "@/server/actions/places";
import type { BBox } from "@/server/db/schema/geo";
import type { GuideCardDTO } from "@/server/queries/discovery";
import type { FriendPlace, LovedPlace } from "@/server/services/travel-profile";

type SearchResult = {
  placeId: string;
  name: string;
  address: string | null;
  type: string | null;
  rating: number | null;
  ratingCount: number | null;
  priceLevel: string | null;
  photo: string | null;
};

const CATEGORY_FOR_TASTE: Record<string, string> = {
  food: "restaurants",
  culture: "museums",
  outdoors: "nature",
  shopping: "shopping",
  nightlife: "nightlife",
  fun: "sights",
  wellness: "sights",
};

export function ExplorePanel({
  tripId,
  canEdit,
  near,
  tripBBox,
  guides,
  lovedPlaces,
  friendPlaces,
  pastDays,
  profile,
  mapsApiKey,
  mapId,
}: {
  tripId: string;
  canEdit: boolean;
  near: string;
  tripBBox: BBox | null;
  guides: GuideCardDTO[];
  lovedPlaces: LovedPlace[];
  friendPlaces: FriendPlace[];
  pastDays: Array<{
    dayId: string;
    tripName: string;
    dayIndex: number;
    title: string | null;
    stops: number;
  }>;
  profile: TravelProfile;
  mapsApiKey: string | null;
  mapId: string | null;
}) {
  const router = useRouter();
  const [, start] = useTransition();
  const refresh = useCallback(() => start(() => router.refresh()), [router]);
  const suggested = favouriteCategories(profile)
    .map((c) => CATEGORY_FOR_TASTE[c])
    .filter(Boolean);
  const [category, setCategory] = useState<string>(suggested[0] ?? "sights");
  const [added, setAdded] = useState<Set<string>>(new Set());

  const { data, isLoading } = useQuery({
    queryKey: ["explore", tripId, category],
    queryFn: async (): Promise<SearchResult[]> => {
      const res = await fetch(
        `/api/places/search?category=${category}&bbox=${tripBBox ? tripBBox.join(",") : ""}&near=${encodeURIComponent(near)}`,
      );
      if (!res.ok) return [];
      return ((await res.json()) as { results: SearchResult[] }).results;
    },
    staleTime: 300_000,
  });

  // Search results have no coordinates in the list payload, so the map shows the
  // places we already know about: your past favourites and your friends' picks.
  const markers: MapMarker[] = [
    ...lovedPlaces.map((p) => ({
      id: p.placeId,
      lat: p.lat,
      lng: p.lng,
      title: p.name,
      colorHex: MARKER_COLORS.violet,
      variant: "place" as const,
    })),
    ...friendPlaces.map((p) => ({
      id: `f-${p.placeId}`,
      lat: p.lat,
      lng: p.lng,
      title: p.name,
      colorHex: MARKER_COLORS.sky,
      variant: "suggestion" as const,
    })),
  ];

  function save(googlePlaceId: string, name: string) {
    start(async () => {
      const res = await addPlaceToTrip({ tripId, googlePlaceId });
      if (!res.ok) toast.error(res.error);
      else {
        setAdded((prev) => new Set(prev).add(googlePlaceId));
        toast.success(`Saved ${name}`);
        refresh();
      }
    });
  }

  const listPane = (
    <div className="space-y-6 p-3 pb-32 lg:pb-6">
      {profile.tripsAnalyzed > 0 && (
        <p className="flex items-start gap-2 rounded-2xl bg-muted p-3 text-sm">
          <Sparkles className="mt-0.5 size-4 shrink-0 text-primary" />
          <span>
            Based on {profile.tripsAnalyzed} finished trip{profile.tripsAnalyzed === 1 ? "" : "s"},
            you plan about {profile.avgStopsPerDay} stops a day
            {profile.typicalStartTime && ` and usually start around ${profile.typicalStartTime}`}.
          </span>
        </p>
      )}

      <section>
        <div className="scrollbar-none mb-3 flex gap-2 overflow-x-auto">
          {PLACE_CATEGORIES.filter((c) => c.key !== "hotels").map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() => setCategory(c.key)}
              className={cn(
                "whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-semibold",
                category === c.key ? "bg-foreground text-background" : "bg-muted hover:bg-muted/70",
                suggested.includes(c.key) && category !== c.key && "ring-1 ring-primary",
              )}
            >
              {c.label}
            </button>
          ))}
        </div>
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        ) : (data?.length ?? 0) === 0 ? (
          <p className="rounded-3xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            Nothing to suggest here yet. Add a Maps server key to see recommendations.
          </p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {data!.map((r) => (
              <li key={r.placeId} className="flex gap-3 rounded-2xl border border-border p-2">
                <PlacePhoto
                  name={r.photo}
                  alt=""
                  className="size-20 shrink-0 rounded-xl"
                  width={200}
                />
                <div className="flex min-w-0 flex-1 flex-col">
                  <p className="truncate font-semibold">{r.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{r.type ?? r.address}</p>
                  <p className="mt-auto flex items-center gap-2 text-xs text-muted-foreground">
                    {r.rating && (
                      <span className="inline-flex items-center gap-1">
                        <Star className="size-3 fill-amber-400 text-amber-400" />{" "}
                        {r.rating.toFixed(1)}
                      </span>
                    )}
                    {r.priceLevel}
                  </p>
                </div>
                {canEdit && (
                  <button
                    type="button"
                    disabled={added.has(r.placeId)}
                    onClick={() => save(r.placeId, r.name)}
                    className="self-center rounded-full bg-primary p-2 text-primary-foreground disabled:opacity-50"
                    aria-label={`Save ${r.name}`}
                  >
                    <Plus className="size-4" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {lovedPlaces.length > 0 && (
        <section>
          <h3 className="mb-2 flex items-center gap-2 font-bold">
            <Heart className="size-4 text-primary" /> Places you loved here before
          </h3>
          <ul className="space-y-1">
            {lovedPlaces.map((p) => (
              <li
                key={p.placeId}
                className="flex items-center gap-2 rounded-2xl border border-border px-3 py-2"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{p.name}</span>
                  {p.primaryType && (
                    <span className="block truncate text-xs capitalize text-muted-foreground">
                      {p.primaryType.replace(/_/g, " ")}
                    </span>
                  )}
                </span>
                {canEdit && p.googlePlaceId && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => save(p.googlePlaceId!, p.name)}
                  >
                    Add again
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {friendPlaces.length > 0 && (
        <section>
          <h3 className="mb-2 flex items-center gap-2 font-bold">
            <Users className="size-4 text-primary" /> Your friends went here
          </h3>
          <ul className="space-y-1">
            {friendPlaces.map((p) => (
              <li
                key={p.placeId}
                className="flex items-center gap-2 rounded-2xl border border-border px-3 py-2"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{p.name}</span>
                  <span className="block text-xs text-muted-foreground">
                    {p.friendNames.length} friend{p.friendNames.length === 1 ? "" : "s"} saved this
                  </span>
                </span>
                {canEdit && p.googlePlaceId && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => save(p.googlePlaceId!, p.name)}
                  >
                    Save
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {pastDays.length > 0 && (
        <section>
          <h3 className="mb-2 font-bold">Days from your past trips here</h3>
          <ul className="space-y-1">
            {pastDays.map((d) => (
              <li key={d.dayId} className="rounded-2xl border border-border px-3 py-2 text-sm">
                <span className="font-medium">{d.title ?? `Day ${d.dayIndex + 1}`}</span>
                <span className="text-muted-foreground">
                  {" "}
                  · {d.tripName} · {d.stops} stops
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {guides.length > 0 && (
        <section>
          <h3 className="mb-2 flex items-center gap-2 font-bold">
            <Compass className="size-4 text-primary" /> Guides for where you're going
          </h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {guides.map((g) => (
              <GuideCard key={g.tripId} guide={g} canInteract />
            ))}
          </div>
        </section>
      )}
    </div>
  );

  return (
    <SplitView
      list={listPane}
      map={
        <TripMap
          apiKey={mapsApiKey}
          mapId={mapId}
          markers={markers}
          view={{ bbox: tripBBox }}
          fitKey={`explore:${markers.length}`}
          className="size-full"
        />
      }
    />
  );
}

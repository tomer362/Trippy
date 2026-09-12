"use client";
import { TripMap } from "@/components/map/trip-map";
import type { MapMarker } from "@/components/map/types";
import type { BBox } from "@/server/db/schema/geo";

/** Read-only map for a shared trip page. */
export function PublicTripMap({
  apiKey,
  mapId,
  markers,
  bbox,
}: {
  apiKey: string | null;
  mapId: string | null;
  markers: MapMarker[];
  bbox: BBox | null;
}) {
  return (
    <div className="h-72 overflow-hidden rounded-3xl border border-border">
      <TripMap
        apiKey={apiKey}
        mapId={mapId}
        markers={markers}
        view={{ bbox }}
        fitKey={`public:${markers.length}`}
        className="size-full"
      />
    </div>
  );
}

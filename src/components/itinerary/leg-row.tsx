"use client";
import { Bike, Bus, Car, CornerDownRight, Footprints, Navigation } from "lucide-react";
import { directionsUrl, formatDistance, formatDuration } from "@/lib/geo";
import type { TravelMode } from "@/lib/types";
import { cn } from "@/lib/utils";
import type { ItineraryLegDTO } from "@/server/queries/itinerary";

export const MODE_ICON: Record<TravelMode, React.ComponentType<{ className?: string }>> = {
  drive: Car,
  walk: Footprints,
  transit: Bus,
  bicycle: Bike,
};

export const MODE_LABEL: Record<TravelMode, string> = {
  drive: "Driving",
  walk: "Walking",
  transit: "Transit",
  bicycle: "Cycling",
};

/**
 * The row between two consecutive stops. Shows distance and travel time for the day's mode,
 * and says so plainly when the routing service has no answer (transit gaps, ferries, some
 * regions where Google returns nothing).
 */
export function LegRow({
  leg,
  mode,
  from,
  to,
  loading,
  onChangeMode,
}: {
  leg: ItineraryLegDTO["leg"];
  mode: TravelMode;
  from: { lat: number; lng: number; googlePlaceId: string | null };
  to: { lat: number; lng: number; googlePlaceId: string | null };
  loading?: boolean;
  onChangeMode?: () => void;
}) {
  const Icon = MODE_ICON[mode];
  const href = directionsUrl(
    [
      { lat: from.lat, lng: from.lng, placeId: from.googlePlaceId },
      { lat: to.lat, lng: to.lng, placeId: to.googlePlaceId },
    ],
    mode,
  );
  const unavailable = leg?.unavailable || (!leg && !loading);
  return (
    <div className="flex items-center gap-2 py-1 pl-8 text-xs text-muted-foreground">
      <CornerDownRight className="size-3.5 shrink-0" />
      <button
        type="button"
        onClick={onChangeMode}
        disabled={!onChangeMode}
        className={cn(
          "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5",
          onChangeMode && "hover:bg-muted",
        )}
        title={onChangeMode ? "Change travel mode for this day" : MODE_LABEL[mode]}
      >
        <Icon className="size-3.5" />
      </button>
      {loading ? (
        <span className="animate-pulse">Measuring…</span>
      ) : unavailable ? (
        <span>No estimate</span>
      ) : (
        <span>
          {formatDuration(leg?.durationS)} · {formatDistance(leg?.distanceM)}
          {leg?.estimated && <span className="ml-1 opacity-70">(straight line)</span>}
        </span>
      )}
      {href && (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="ml-auto inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 hover:bg-muted hover:text-foreground"
        >
          <Navigation className="size-3" /> Directions
        </a>
      )}
    </div>
  );
}

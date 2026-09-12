import type { BBox } from "@/server/db/schema/geo";

export type LatLng = { lat: number; lng: number };

const EARTH_RADIUS_M = 6_371_000;

export function haversineMeters(a: LatLng, b: LatLng): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function boundsOf(points: LatLng[]): BBox | null {
  if (points.length === 0) return null;
  let minLng = 180;
  let minLat = 90;
  let maxLng = -180;
  let maxLat = -90;
  for (const p of points) {
    minLng = Math.min(minLng, p.lng);
    minLat = Math.min(minLat, p.lat);
    maxLng = Math.max(maxLng, p.lng);
    maxLat = Math.max(maxLat, p.lat);
  }
  return [minLng, minLat, maxLng, maxLat];
}

export function bboxCenter(b: BBox): LatLng {
  return { lat: (b[1] + b[3]) / 2, lng: (b[0] + b[2]) / 2 };
}

export function padBBox(b: BBox, factor = 0.15): BBox {
  const dLng = Math.max(0.01, (b[2] - b[0]) * factor);
  const dLat = Math.max(0.01, (b[3] - b[1]) * factor);
  return [b[0] - dLng, b[1] - dLat, b[2] + dLng, b[3] + dLat];
}

export function formatDistance(
  meters: number | null | undefined,
  unit: "metric" | "imperial" = "metric",
): string {
  if (meters === null || meters === undefined) return "—";
  if (unit === "imperial") {
    const miles = meters / 1609.34;
    return miles < 0.2
      ? `${Math.round(meters * 3.28084)} ft`
      : `${miles < 10 ? miles.toFixed(1) : Math.round(miles)} mi`;
  }
  return meters < 1000
    ? `${Math.round(meters)} m`
    : `${meters < 10000 ? (meters / 1000).toFixed(1) : Math.round(meters / 1000)} km`;
}

export function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return "—";
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins} min`;
  const hours = Math.floor(mins / 60);
  const rest = mins % 60;
  return rest === 0 ? `${hours} hr` : `${hours} hr ${rest} min`;
}

/** Google Maps deep link for turn-by-turn directions between stops. */
export function directionsUrl(
  stops: Array<LatLng & { placeId?: string | null }>,
  mode: string,
): string | null {
  if (stops.length < 2) return null;
  const travelmode =
    mode === "walk"
      ? "walking"
      : mode === "transit"
        ? "transit"
        : mode === "bicycle"
          ? "bicycling"
          : "driving";
  const point = (s: (typeof stops)[number]) => `${s.lat},${s.lng}`;
  const origin = stops[0]!;
  const destination = stops.at(-1)!;
  const waypoints = stops.slice(1, -1);
  const params = new URLSearchParams({
    api: "1",
    origin: point(origin),
    destination: point(destination),
    travelmode,
  });
  if (origin.placeId) params.set("origin_place_id", origin.placeId);
  if (destination.placeId) params.set("destination_place_id", destination.placeId);
  if (waypoints.length) params.set("waypoints", waypoints.map(point).join("|"));
  return `https://www.google.com/maps/dir/?${params}`;
}

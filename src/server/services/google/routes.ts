import "server-only";
import { env } from "@/env";
import type { TravelMode } from "@/lib/types";

const BASE = "https://routes.googleapis.com";

export class RoutesError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export const GOOGLE_TRAVEL_MODE: Record<TravelMode, string> = {
  drive: "DRIVE",
  walk: "WALK",
  transit: "TRANSIT",
  bicycle: "BICYCLE",
};

type LatLng = { lat: number; lng: number };

function waypoint(p: LatLng) {
  return { location: { latLng: { latitude: p.lat, longitude: p.lng } } };
}

function requireKey() {
  const key = env.GOOGLE_MAPS_SERVER_KEY;
  if (!key) throw new RoutesError("GOOGLE_MAPS_SERVER_KEY is not configured", 503);
  return key;
}

async function post<T>(path: string, body: unknown, fieldMask: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": requireKey(),
      "X-Goog-FieldMask": fieldMask,
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new RoutesError(`Routes API ${res.status}: ${text.slice(0, 300)}`, res.status);
  }
  return (await res.json()) as T;
}

export type ComputedRoute = {
  distanceM: number | null;
  durationS: number | null;
  polyline: string | null;
};

/** Single origin/destination route. Stays in the Essentials SKU by avoiding traffic options. */
export async function computeRoute(
  origin: LatLng,
  destination: LatLng,
  mode: TravelMode,
): Promise<ComputedRoute | null> {
  const body: Record<string, unknown> = {
    origin: waypoint(origin),
    destination: waypoint(destination),
    travelMode: GOOGLE_TRAVEL_MODE[mode],
    computeAlternativeRoutes: false,
    units: "METRIC",
    languageCode: "en",
  };
  if (mode === "drive") body.routingPreference = "TRAFFIC_UNAWARE";
  const data = await post<{
    routes?: Array<{
      distanceMeters?: number;
      duration?: string;
      polyline?: { encodedPolyline?: string };
    }>;
  }>(
    "/directions/v2:computeRoutes",
    body,
    "routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline",
  );
  const route = data.routes?.[0];
  if (!route) return null;
  return {
    distanceM: route.distanceMeters ?? null,
    durationS: route.duration ? Number.parseInt(route.duration.replace("s", ""), 10) : null,
    polyline: route.polyline?.encodedPolyline ?? null,
  };
}

export type MatrixCell = {
  originIndex: number;
  destinationIndex: number;
  distanceM: number | null;
  durationS: number | null;
  ok: boolean;
};

/**
 * All-pairs travel times for one day's stops. Billed per element, so callers cap the
 * number of stops before asking.
 */
export async function computeRouteMatrix(
  points: LatLng[],
  mode: TravelMode,
): Promise<MatrixCell[]> {
  const body: Record<string, unknown> = {
    origins: points.map((p) => ({ waypoint: waypoint(p) })),
    destinations: points.map((p) => ({ waypoint: waypoint(p) })),
    travelMode: GOOGLE_TRAVEL_MODE[mode],
  };
  if (mode === "drive") body.routingPreference = "TRAFFIC_UNAWARE";
  const rows = await post<
    Array<{
      originIndex?: number;
      destinationIndex?: number;
      distanceMeters?: number;
      duration?: string;
      condition?: string;
    }>
  >(
    "/distanceMatrix/v2:computeRouteMatrix",
    body,
    "originIndex,destinationIndex,distanceMeters,duration,condition",
  );
  return rows.map((r) => ({
    originIndex: r.originIndex ?? 0,
    destinationIndex: r.destinationIndex ?? 0,
    distanceM: r.distanceMeters ?? null,
    durationS: r.duration ? Number.parseInt(r.duration.replace("s", ""), 10) : null,
    ok: r.condition !== "ROUTE_NOT_FOUND",
  }));
}

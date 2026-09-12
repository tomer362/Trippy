import "server-only";
import { and, eq, inArray, or, sql } from "drizzle-orm";
import { features } from "@/env";
import { haversineMeters } from "@/lib/geo";
import { type CostMatrix, haversineMatrix } from "@/lib/optimize";
import type { TravelMode } from "@/lib/types";
import { db } from "@/server/db";
import { places, routeLegs } from "@/server/db/schema";
import { computeRoute, computeRouteMatrix } from "./google/routes";

/** Legs are cached for 30 days, the longest Google allows us to keep derived coordinates. */
const LEG_TTL_MS = 30 * 24 * 3600 * 1000;
/** Guard rail so one page view can never trigger an unbounded number of billed calls. */
const MAX_NEW_LEGS_PER_CALL = 14;
export const MAX_OPTIMIZE_STOPS = 12;

export type Leg = {
  fromPlaceId: string;
  toPlaceId: string;
  mode: TravelMode;
  distanceM: number | null;
  durationS: number | null;
  polyline: string | null;
  unavailable: boolean;
  estimated: boolean;
};

function key(from: string, to: string, mode: string) {
  return `${from}>${to}:${mode}`;
}

async function cachedLegs(
  pairs: Array<[string, string]>,
  mode: TravelMode,
): Promise<Map<string, Leg>> {
  if (pairs.length === 0) return new Map();
  const ids = [...new Set(pairs.flat())];
  const rows = await db
    .select()
    .from(routeLegs)
    .where(
      and(
        eq(routeLegs.mode, mode),
        inArray(routeLegs.fromPlaceId, ids),
        inArray(routeLegs.toPlaceId, ids),
      ),
    );
  const map = new Map<string, Leg>();
  for (const r of rows) {
    if (Date.now() - r.computedAt.getTime() > LEG_TTL_MS) continue;
    map.set(key(r.fromPlaceId, r.toPlaceId, r.mode), {
      fromPlaceId: r.fromPlaceId,
      toPlaceId: r.toPlaceId,
      mode: r.mode,
      distanceM: r.distanceM,
      durationS: r.durationS,
      polyline: r.polyline,
      unavailable: r.unavailable,
      estimated: false,
    });
  }
  return map;
}

/** Reads cached legs for a stop sequence without calling Google. */
export async function getCachedSequenceLegs(
  placeIds: string[],
  mode: TravelMode,
): Promise<Array<Leg | null>> {
  const pairs = placeIds
    .slice(0, -1)
    .map((from, i) => [from, placeIds[i + 1]!] as [string, string]);
  const cache = await cachedLegs(pairs, mode);
  return pairs.map(([from, to]) => cache.get(key(from, to, mode)) ?? null);
}

/**
 * Fills in the legs of a stop sequence, computing the missing ones through the Routes API
 * and storing them. Falls back to straight-line estimates when no key is configured.
 */
export async function ensureSequenceLegs(
  placeIds: string[],
  mode: TravelMode,
): Promise<Array<Leg | null>> {
  const pairs = placeIds
    .slice(0, -1)
    .map((from, i) => [from, placeIds[i + 1]!] as [string, string]);
  if (pairs.length === 0) return [];
  const cache = await cachedLegs(pairs, mode);
  const missing = pairs
    .filter(([from, to]) => !cache.has(key(from, to, mode)))
    .slice(0, MAX_NEW_LEGS_PER_CALL);
  if (missing.length > 0) {
    const coords = await placeCoords([...new Set(missing.flat())]);
    for (const [from, to] of missing) {
      const a = coords.get(from);
      const b = coords.get(to);
      if (!a || !b) continue;
      let leg: Leg;
      if (features.mapsServer) {
        try {
          const route = await computeRoute(a, b, mode);
          leg = {
            fromPlaceId: from,
            toPlaceId: to,
            mode,
            distanceM: route?.distanceM ?? null,
            durationS: route?.durationS ?? null,
            polyline: route?.polyline ?? null,
            unavailable: !route,
            estimated: false,
          };
        } catch (err) {
          console.error("route leg failed", err);
          leg = {
            fromPlaceId: from,
            toPlaceId: to,
            mode,
            distanceM: null,
            durationS: null,
            polyline: null,
            unavailable: true,
            estimated: false,
          };
        }
      } else {
        leg = {
          fromPlaceId: from,
          toPlaceId: to,
          mode,
          distanceM: Math.round(haversineMeters(a, b)),
          durationS: null,
          polyline: null,
          unavailable: false,
          estimated: true,
        };
      }
      cache.set(key(from, to, mode), leg);
      if (!leg.estimated) await saveLeg(leg);
    }
  }
  return pairs.map(([from, to]) => cache.get(key(from, to, mode)) ?? null);
}

async function saveLeg(leg: Leg) {
  await db
    .insert(routeLegs)
    .values({
      fromPlaceId: leg.fromPlaceId,
      toPlaceId: leg.toPlaceId,
      mode: leg.mode,
      distanceM: leg.distanceM,
      durationS: leg.durationS,
      polyline: leg.polyline,
      unavailable: leg.unavailable,
      computedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [routeLegs.fromPlaceId, routeLegs.toPlaceId, routeLegs.mode],
      set: {
        distanceM: sql`excluded.distance_m`,
        durationS: sql`excluded.duration_s`,
        polyline: sql`excluded.polyline`,
        unavailable: sql`excluded.unavailable`,
        computedAt: new Date(),
      },
    });
}

async function placeCoords(ids: string[]): Promise<Map<string, { lat: number; lng: number }>> {
  if (ids.length === 0) return new Map();
  const rows = await db
    .select({ id: places.id, lat: places.lat, lng: places.lng })
    .from(places)
    .where(inArray(places.id, ids));
  return new Map(rows.map((r) => [r.id, { lat: r.lat, lng: r.lng }]));
}

/**
 * Builds a duration matrix for one day's stops, using the Routes matrix endpoint when
 * available and straight-line distance otherwise.
 */
export async function buildDayMatrix(
  coords: Array<{ lat: number; lng: number }>,
  mode: TravelMode,
): Promise<{ matrix: CostMatrix; estimated: boolean }> {
  if (!features.mapsServer || coords.length > MAX_OPTIMIZE_STOPS)
    return { matrix: haversineMatrix(coords), estimated: true };
  try {
    const cells = await computeRouteMatrix(coords, mode);
    const matrix: CostMatrix = coords.map(() => coords.map(() => Number.NaN));
    for (const c of cells) {
      const row = matrix[c.originIndex];
      if (!row) continue;
      row[c.destinationIndex] = c.ok && c.durationS !== null ? c.durationS : Number.NaN;
    }
    for (let i = 0; i < coords.length; i++) matrix[i]![i] = 0;
    const usable = matrix.flat().filter((v) => Number.isFinite(v)).length;
    if (usable < coords.length) return { matrix: haversineMatrix(coords), estimated: true };
    return { matrix, estimated: false };
  } catch (err) {
    console.error("route matrix failed", err);
    return { matrix: haversineMatrix(coords), estimated: true };
  }
}

/** Removes cached legs that reference a place, used when a place leaves the trip. */
export async function invalidateLegsFor(placeId: string) {
  await db
    .delete(routeLegs)
    .where(or(eq(routeLegs.fromPlaceId, placeId), eq(routeLegs.toPlaceId, placeId)));
}

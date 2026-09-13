import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { places } from "@/server/db/schema";
import { FIELD_MASKS, type PlaceDetails, placeDetails, viewportToBBox } from "./google/places";

/**
 * Google Maps Platform terms let us keep a place ID forever but not its content:
 * coordinates and names are refreshed on this cadence, and ratings, opening hours
 * and photos are never stored at all.
 */
const COORD_TTL_MS = 30 * 24 * 3600 * 1000;

export type CachedPlace = typeof places.$inferSelect;

function valuesFromDetails(d: PlaceDetails) {
  return {
    name: d.displayName?.text ?? "Unnamed place",
    formattedAddress: d.formattedAddress ?? null,
    lat: d.location?.latitude ?? 0,
    lng: d.location?.longitude ?? 0,
    coordsCachedAt: new Date(),
    types: d.types ?? [],
    primaryType: d.primaryType ?? d.types?.[0] ?? null,
    viewport: viewportToBBox(d.viewport) ?? undefined,
    googleMapsUri: d.googleMapsUri ?? null,
    website: d.websiteUri ?? null,
    phone: d.internationalPhoneNumber ?? null,
    timezone: d.utcOffsetMinutes !== undefined ? String(d.utcOffsetMinutes) : null,
  };
}

/**
 * Returns our cached row for a Google place, fetching or refreshing it when needed.
 *
 * Pass the autocomplete session token that produced this place id. Google bills a session as
 * one Details call rather than one call per keystroke, but only if the Details request that
 * ends the session carries the token — without it every keystroke is billed separately.
 */
export async function ensurePlace(
  googlePlaceId: string,
  sessionToken?: string,
): Promise<CachedPlace> {
  const [existing] = await db
    .select()
    .from(places)
    .where(eq(places.googlePlaceId, googlePlaceId))
    .limit(1);
  if (existing && Date.now() - existing.coordsCachedAt.getTime() < COORD_TTL_MS) return existing;
  const details = await placeDetails(googlePlaceId, FIELD_MASKS.basic, sessionToken);
  const values = valuesFromDetails(details);
  if (existing) {
    const [updated] = await db
      .update(places)
      .set(values)
      .where(eq(places.id, existing.id))
      .returning();
    return updated!;
  }
  const [created] = await db
    .insert(places)
    .values({ source: "google", googlePlaceId, ...values })
    .onConflictDoUpdate({ target: places.googlePlaceId, set: values })
    .returning();
  return created!;
}

export async function createManualPlace(input: {
  name: string;
  lat: number;
  lng: number;
  address?: string | null;
}): Promise<CachedPlace> {
  const [created] = await db
    .insert(places)
    .values({
      source: "manual",
      name: input.name,
      formattedAddress: input.address ?? null,
      lat: input.lat,
      lng: input.lng,
      types: [],
      primaryType: "custom",
    })
    .returning();
  return created!;
}

export async function getPlace(id: string): Promise<CachedPlace | null> {
  const [row] = await db.select().from(places).where(eq(places.id, id)).limit(1);
  return row ?? null;
}

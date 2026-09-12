import "server-only";
import { desc, eq, sql } from "drizzle-orm";
import { env, features } from "@/env";
import { type DestinationDTO, type DestinationKind, KIND_ZOOM } from "@/lib/types";
import { slugify } from "@/lib/utils";
import { db } from "@/server/db";
import { type BBox, destinations } from "@/server/db/schema";
import { autocomplete, FIELD_MASKS, placeDetails, viewportToBBox } from "./google/places";
import { commonsFileNameFromUrl, commonsThumb, fetchImageCredit, fetchWikiSummary } from "./wiki";

type Row = typeof destinations.$inferSelect;

export function buildSearchText(name: string, altNames: string[], ancestorNames: string[]): string {
  return [name, ...altNames, ...ancestorNames].join(" ").toLowerCase();
}

export function toDTO(row: Row, extra?: Partial<DestinationDTO>): DestinationDTO {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    kind: row.kind,
    subtitle: row.ancestorNames.join(", "),
    countryCode: row.countryCode,
    lat: row.lat,
    lng: row.lng,
    bbox: row.bbox ?? null,
    zoom: KIND_ZOOM[row.kind],
    heroUrl: row.heroUrl ?? null,
    heroCredit: row.heroCredit ?? null,
    googlePlaceId: row.googlePlaceId ?? null,
    ...extra,
  };
}

const KIND_BOOST: Record<DestinationKind, number> = {
  country: 1.15,
  region: 1.1,
  island: 1.05,
  city: 1.0,
  park: 0.95,
  neighborhood: 0.8,
};

export async function popularDestinations(limit = 8): Promise<DestinationDTO[]> {
  const rows = await db
    .select()
    .from(destinations)
    .orderBy(desc(destinations.popularity))
    .limit(limit);
  return rows.map((r) => toDTO(r));
}

/**
 * Local ranked search. Prefix > alt-name > substring > fuzzy > ancestor match, scaled by
 * popularity and kind. Children of a matched region surface beneath the region itself.
 */
export async function searchLocal(query: string, limit = 8): Promise<DestinationDTO[]> {
  const q = query.trim().toLowerCase();
  if (q.length < 1) return popularDestinations(limit);
  const prefix = `${q}%`;
  const contains = `%${q}%`;
  const boostCase = sql`CASE ${destinations.kind}
      WHEN 'country' THEN ${KIND_BOOST.country}
      WHEN 'region' THEN ${KIND_BOOST.region}
      WHEN 'island' THEN ${KIND_BOOST.island}
      WHEN 'city' THEN ${KIND_BOOST.city}
      WHEN 'park' THEN ${KIND_BOOST.park}
      ELSE ${KIND_BOOST.neighborhood} END`;
  const score = sql<number>`GREATEST(
      CASE WHEN lower(${destinations.name}) LIKE ${prefix} THEN 1.0 ELSE 0 END,
      CASE WHEN EXISTS (SELECT 1 FROM unnest(${destinations.altNames}) a WHERE lower(a) LIKE ${prefix}) THEN 0.9 ELSE 0 END,
      CASE WHEN lower(${destinations.name}) LIKE ${contains} THEN 0.7 ELSE 0 END,
      similarity(lower(${destinations.name}), ${q}) * 0.8,
      CASE WHEN EXISTS (SELECT 1 FROM unnest(${destinations.ancestorNames}) a WHERE lower(a) LIKE ${prefix}) THEN 0.35 ELSE 0 END
    ) * (0.4 + 0.6 * ${destinations.popularity}) * ${boostCase}`;
  const rows = await db
    .select({ row: destinations, score })
    .from(destinations)
    .where(
      sql`${destinations.searchText} LIKE ${contains} OR similarity(lower(${destinations.name}), ${q}) > 0.3`,
    )
    .orderBy(desc(score), desc(destinations.popularity))
    .limit(limit);
  return rows.map(({ row }) => toDTO(row));
}

/** Local search, topped up with Google Autocomplete (regions) when results are thin. */
export async function searchDestinations(
  query: string,
  sessionToken?: string,
  limit = 8,
): Promise<DestinationDTO[]> {
  const local = await searchLocal(query, limit);
  if (local.length >= 4 || !features.mapsServer || query.trim().length < 3) return local;
  try {
    const remote = await autocomplete({
      query,
      sessionToken: sessionToken ?? crypto.randomUUID(),
      regionsOnly: true,
    });
    const seen = new Set(local.map((d) => `${d.name.toLowerCase()}|${d.countryCode}`));
    const extras: DestinationDTO[] = [];
    for (const s of remote) {
      const kind = kindFromTypes(s.types, s.mainText);
      const key = `${s.mainText.toLowerCase()}|`;
      if ([...seen].some((k) => k.startsWith(key))) continue;
      extras.push({
        id: null,
        slug: null,
        name: s.mainText,
        kind,
        subtitle: s.secondaryText,
        countryCode: "",
        lat: 0,
        lng: 0,
        bbox: null,
        zoom: KIND_ZOOM[kind],
        heroUrl: null,
        heroCredit: null,
        provisional: true,
        googlePlaceId: s.placeId,
      });
    }
    return [...local, ...extras].slice(0, limit + 4);
  } catch {
    return local;
  }
}

export function kindFromTypes(types: string[], name = ""): DestinationKind {
  const t = new Set(types);
  if (t.has("country")) return "country";
  if (t.has("archipelago") || /\bisland(s)?\b/i.test(name)) return "island";
  if (t.has("national_park") || t.has("park")) return "park";
  if (
    t.has("administrative_area_level_1") ||
    t.has("administrative_area_level_2") ||
    t.has("colloquial_area") ||
    t.has("natural_feature")
  )
    return "region";
  if (t.has("locality") || t.has("postal_town") || t.has("administrative_area_level_3"))
    return "city";
  if (t.has("sublocality") || t.has("neighborhood")) return "neighborhood";
  return "city";
}

async function uniqueSlug(base: string): Promise<string> {
  let slug = base || "place";
  for (let i = 0; i < 20; i++) {
    const existing = await db
      .select({ id: destinations.id })
      .from(destinations)
      .where(eq(destinations.slug, slug))
      .limit(1);
    if (existing.length === 0) return slug;
    slug = `${base}-${Math.random().toString(36).slice(2, 6)}`;
  }
  throw new Error("Could not allocate slug");
}

/** Turns a provisional Google suggestion into a permanent destination row. */
export async function promoteFromGoogle(
  placeId: string,
  sessionToken?: string,
): Promise<DestinationDTO> {
  const existing = await db
    .select()
    .from(destinations)
    .where(eq(destinations.googlePlaceId, placeId))
    .limit(1);
  if (existing[0]) return toDTO(existing[0]);
  const d = await placeDetails(placeId, FIELD_MASKS.identity, sessionToken);
  const name = d.displayName?.text ?? "Unknown";
  const kind = kindFromTypes(d.types ?? [], name);
  const components = d.addressComponents ?? [];
  const country = components.find((c) => c.types.includes("country"));
  const ancestorNames = components
    .filter((c) => !c.types.some((t) => (d.types ?? []).includes(t)) && c.longText !== name)
    .filter((c) =>
      c.types.some((t) => ["administrative_area_level_1", "country", "locality"].includes(t)),
    )
    .map((c) => c.longText);
  const bbox = viewportToBBox(d.viewport);
  const slug = await uniqueSlug(slugify(`${name} ${country?.shortText ?? ""}`));
  const [row] = await db
    .insert(destinations)
    .values({
      slug,
      name,
      kind,
      countryCode: country?.shortText ?? "",
      lat: d.location?.latitude ?? 0,
      lng: d.location?.longitude ?? 0,
      bbox: bbox ?? undefined,
      popularity: 0.2,
      googlePlaceId: placeId,
      wikipediaTitle: name,
      altNames: [],
      ancestorNames,
      searchText: buildSearchText(name, [], ancestorNames),
    })
    .returning();
  return toDTO(row!);
}

export async function getDestination(id: string): Promise<DestinationDTO | null> {
  const [row] = await db.select().from(destinations).where(eq(destinations.id, id)).limit(1);
  return row ? toDTO(row) : null;
}

export async function getDestinationBySlug(slug: string): Promise<DestinationDTO | null> {
  const [row] = await db.select().from(destinations).where(eq(destinations.slug, slug)).limit(1);
  return row ? toDTO(row) : null;
}

const HERO_RETRY_MS = 7 * 24 * 3600 * 1000;

/** Resolves (and caches) a hero photo from Wikipedia/Commons for a destination. */
export async function resolveHero(
  id: string,
): Promise<{ url: string | null; credit: string | null }> {
  const [row] = await db.select().from(destinations).where(eq(destinations.id, id)).limit(1);
  if (!row) return { url: null, credit: null };
  if (row.heroUrl) return { url: row.heroUrl, credit: row.heroCredit };
  if (row.heroResolvedAt && Date.now() - row.heroResolvedAt.getTime() < HERO_RETRY_MS)
    return { url: null, credit: null };
  let url: string | null = null;
  let credit: string | null = null;
  let license: string | null = null;
  try {
    const summary = await fetchWikiSummary(row.wikipediaTitle ?? row.name);
    const original = summary?.originalimage?.source ?? summary?.thumbnail?.source ?? null;
    if (original) {
      url = commonsThumb(original, 1600);
      const file = commonsFileNameFromUrl(original);
      if (file) {
        const c = await fetchImageCredit(file);
        if (c) {
          credit = [c.artist, c.license].filter(Boolean).join(" · ") || null;
          license = c.license ?? null;
        }
      }
    }
  } catch {
    // network blocked or page missing — fall through and retry later
  }
  await db
    .update(destinations)
    .set({ heroUrl: url, heroCredit: credit, heroLicense: license, heroResolvedAt: new Date() })
    .where(eq(destinations.id, id));
  return { url, credit };
}

export function unionBBox(
  items: Array<{ lat: number; lng: number; bbox: BBox | null; zoom: number }>,
): { bbox: BBox } | { center: { lat: number; lng: number }; zoom: number } | null {
  if (items.length === 0) return null;
  if (items.length === 1 && !items[0]!.bbox)
    return { center: { lat: items[0]!.lat, lng: items[0]!.lng }, zoom: items[0]!.zoom };
  let minLng = 180;
  let minLat = 90;
  let maxLng = -180;
  let maxLat = -90;
  for (const it of items) {
    const b = it.bbox ?? [it.lng - 0.3, it.lat - 0.3, it.lng + 0.3, it.lat + 0.3];
    minLng = Math.min(minLng, b[0]);
    minLat = Math.min(minLat, b[1]);
    maxLng = Math.max(maxLng, b[2]);
    maxLat = Math.max(maxLat, b[3]);
  }
  return { bbox: [minLng, minLat, maxLng, maxLat] };
}

export const hasMapsServerKey = () => Boolean(env.GOOGLE_MAPS_SERVER_KEY);

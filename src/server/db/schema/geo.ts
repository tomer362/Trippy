import { sql } from "drizzle-orm";
import {
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { id, timestamps } from "./_shared";

export const destinationKind = pgEnum("destination_kind", [
  "country",
  "region",
  "city",
  "island",
  "neighborhood",
  "park",
]);

export type BBox = [minLng: number, minLat: number, maxLng: number, maxLat: number];

/**
 * One polymorphic geo table: countries, administrative regions, colloquial tourist regions,
 * islands and cities all live here so a trip can target any level.
 */
export const destinations = pgTable(
  "destinations",
  {
    id: id(),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    kind: destinationKind("kind").notNull(),
    parentId: text("parent_id"),
    countryCode: text("country_code").notNull(),
    lat: doublePrecision("lat").notNull(),
    lng: doublePrecision("lng").notNull(),
    bbox: jsonb("bbox").$type<BBox>(),
    population: integer("population"),
    popularity: real("popularity").notNull().default(0),
    wikidataQid: text("wikidata_qid"),
    wikipediaTitle: text("wikipedia_title"),
    geonamesId: integer("geonames_id"),
    googlePlaceId: text("google_place_id"),
    heroUrl: text("hero_url"),
    heroCredit: text("hero_credit"),
    heroLicense: text("hero_license"),
    heroResolvedAt: timestamp("hero_resolved_at", { withTimezone: true }),
    altNames: text("alt_names").array().notNull().default(sql`'{}'::text[]`),
    ancestorNames: text("ancestor_names").array().notNull().default(sql`'{}'::text[]`),
    searchText: text("search_text").notNull().default(""),
    ...timestamps,
  },
  (t) => [
    index("destinations_search_trgm_idx").using("gin", sql`${t.searchText} gin_trgm_ops`),
    index("destinations_popularity_idx").on(t.popularity),
    index("destinations_google_place_idx").on(t.googlePlaceId),
    index("destinations_parent_idx").on(t.parentId),
  ],
);

export const placeSource = pgEnum("place_source", ["google", "manual"]);

/**
 * Cached place identity. Per Google Maps Platform terms, only the place ID is stored
 * indefinitely; coordinates are refreshed after 30 days and ratings/hours/photos are
 * always fetched live.
 */
export const places = pgTable(
  "places",
  {
    id: id(),
    source: placeSource("source").notNull().default("google"),
    googlePlaceId: text("google_place_id").unique(),
    name: text("name").notNull(),
    formattedAddress: text("formatted_address"),
    lat: doublePrecision("lat").notNull(),
    lng: doublePrecision("lng").notNull(),
    coordsCachedAt: timestamp("coords_cached_at", { withTimezone: true }).notNull().defaultNow(),
    types: text("types").array().notNull().default(sql`'{}'::text[]`),
    primaryType: text("primary_type"),
    viewport: jsonb("viewport").$type<BBox>(),
    googleMapsUri: text("google_maps_uri"),
    website: text("website"),
    phone: text("phone"),
    timezone: text("timezone"),
    ...timestamps,
  },
  (t) => [index("places_google_place_id_idx").on(t.googlePlaceId)],
);

import {
  boolean,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  time,
  timestamp,
  unique,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { id, timestamps } from "./_shared";
import { user } from "./auth";
import { places } from "./geo";
import { travelMode, trips } from "./trips";

export const listKind = pgEnum("list_kind", ["places", "restaurants", "hotels", "custom"]);

export const tripLists = pgTable(
  "trip_lists",
  {
    id: id(),
    tripId: text("trip_id")
      .notNull()
      .references(() => trips.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    kind: listKind("kind").notNull().default("places"),
    color: text("color").notNull().default("coral"),
    icon: text("icon").notNull().default("map-pin"),
    position: integer("position").notNull().default(0),
    hiddenOnMap: boolean("hidden_on_map").notNull().default(false),
    version: integer("version").notNull().default(1),
    ...timestamps,
  },
  (t) => [
    index("trip_lists_trip_idx").on(t.tripId),
    unique("trip_lists_id_trip_uk").on(t.id, t.tripId),
  ],
);

export const tripPlaces = pgTable(
  "trip_places",
  {
    id: id(),
    tripId: text("trip_id")
      .notNull()
      .references(() => trips.id, { onDelete: "cascade" }),
    listId: text("list_id").references(() => tripLists.id, { onDelete: "set null" }),
    placeId: text("place_id")
      .notNull()
      .references(() => places.id, { onDelete: "restrict" }),
    titleOverride: text("title_override"),
    notes: text("notes"),
    cost: numeric("cost", { precision: 12, scale: 2 }),
    currency: text("currency"),
    visited: boolean("visited").notNull().default(false),
    color: text("color"),
    position: integer("position").notNull().default(0),
    addedBy: text("added_by").references(() => user.id, { onDelete: "set null" }),
    version: integer("version").notNull().default(1),
    ...timestamps,
  },
  (t) => [
    index("trip_places_trip_idx").on(t.tripId),
    index("trip_places_list_idx").on(t.listId),
    index("trip_places_place_idx").on(t.placeId),
    unique("trip_places_id_trip_uk").on(t.id, t.tripId),
    // A place can only be filed in a list belonging to the same trip. The plain list_id FK
    // above still owns the set-null behaviour; this one only constrains the pairing.
    foreignKey({
      columns: [t.listId, t.tripId],
      foreignColumns: [tripLists.id, tripLists.tripId],
      name: "trip_places_list_in_trip_fk",
    }),
  ],
);

export const itineraryDays = pgTable(
  "itinerary_days",
  {
    id: id(),
    tripId: text("trip_id")
      .notNull()
      .references(() => trips.id, { onDelete: "cascade" }),
    dayIndex: integer("day_index").notNull(),
    date: date("date"),
    title: text("title"),
    notes: jsonb("notes"),
    travelMode: travelMode("travel_mode"),
    color: text("color"),
    startPlaceId: text("start_place_id").references(() => places.id, { onDelete: "set null" }),
    endPlaceId: text("end_place_id").references(() => places.id, { onDelete: "set null" }),
    collapsed: boolean("collapsed").notNull().default(false),
    version: integer("version").notNull().default(1),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("itinerary_days_trip_day_idx").on(t.tripId, t.dayIndex),
    unique("itinerary_days_id_trip_uk").on(t.id, t.tripId),
  ],
);

export const itemKind = pgEnum("item_kind", [
  "place",
  "note",
  "checklist",
  "lodging",
  "reservation",
  "expense",
  "break",
]);

export const itineraryItems = pgTable(
  "itinerary_items",
  {
    id: id(),
    tripId: text("trip_id")
      .notNull()
      .references(() => trips.id, { onDelete: "cascade" }),
    dayId: text("day_id")
      .notNull()
      .references(() => itineraryDays.id, { onDelete: "cascade" }),
    kind: itemKind("kind").notNull(),
    tripPlaceId: text("trip_place_id").references(() => tripPlaces.id, { onDelete: "cascade" }),
    refId: text("ref_id"),
    text: text("text"),
    startTime: time("start_time"),
    endTime: time("end_time"),
    durationMin: integer("duration_min"),
    position: integer("position").notNull().default(0),
    travelModeOverride: travelMode("travel_mode_override"),
    done: boolean("done").notNull().default(false),
    version: integer("version").notNull().default(1),
    ...timestamps,
  },
  (t) => [
    index("itinerary_items_day_idx").on(t.dayId),
    index("itinerary_items_trip_idx").on(t.tripId),
    index("itinerary_items_trip_place_idx").on(t.tripPlaceId),
    // An item's day and place must belong to the item's own trip. Without these a forged
    // dayId lands a row in one trip that points at another's day.
    foreignKey({
      columns: [t.dayId, t.tripId],
      foreignColumns: [itineraryDays.id, itineraryDays.tripId],
      name: "itinerary_items_day_in_trip_fk",
    }),
    foreignKey({
      columns: [t.tripPlaceId, t.tripId],
      foreignColumns: [tripPlaces.id, tripPlaces.tripId],
      name: "itinerary_items_place_in_trip_fk",
    }),
  ],
);

export const routeLegs = pgTable(
  "route_legs",
  {
    id: id(),
    fromPlaceId: text("from_place_id")
      .notNull()
      .references(() => places.id, { onDelete: "cascade" }),
    toPlaceId: text("to_place_id")
      .notNull()
      .references(() => places.id, { onDelete: "cascade" }),
    mode: travelMode("mode").notNull(),
    distanceM: integer("distance_m"),
    durationS: integer("duration_s"),
    polyline: text("polyline"),
    unavailable: boolean("unavailable").notNull().default(false),
    computedAt: timestamp("computed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("route_legs_key_idx").on(t.fromPlaceId, t.toPlaceId, t.mode)],
);

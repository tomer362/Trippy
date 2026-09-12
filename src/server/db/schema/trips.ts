import {
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { id, timestamps } from "./_shared";
import { user } from "./auth";
import { destinations, places } from "./geo";

export const tripKind = pgEnum("trip_kind", ["plan", "guide", "journal"]);
export const tripVisibility = pgEnum("trip_visibility", ["private", "link", "friends", "public"]);
export const memberRole = pgEnum("member_role", ["owner", "editor", "viewer"]);
export const travelMode = pgEnum("travel_mode", ["drive", "walk", "transit", "bicycle"]);

export const trips = pgTable(
  "trips",
  {
    id: id(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    kind: tripKind("kind").notNull().default("plan"),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    description: text("description"),
    coverUrl: text("cover_url"),
    coverCredit: text("cover_credit"),
    startDate: date("start_date"),
    endDate: date("end_date"),
    dayCount: integer("day_count").notNull().default(3),
    visibility: tripVisibility("visibility").notNull().default("private"),
    currency: text("currency").notNull().default("USD"),
    homeBasePlaceId: text("home_base_place_id").references(() => places.id, {
      onDelete: "set null",
    }),
    defaultTravelMode: travelMode("default_travel_mode").notNull().default("drive"),
    version: integer("version").notNull().default(1),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index("trips_owner_idx").on(t.ownerId),
    index("trips_visibility_idx").on(t.visibility),
    index("trips_start_date_idx").on(t.startDate),
  ],
);

export const tripDestinations = pgTable(
  "trip_destinations",
  {
    tripId: text("trip_id")
      .notNull()
      .references(() => trips.id, { onDelete: "cascade" }),
    destinationId: text("destination_id")
      .notNull()
      .references(() => destinations.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.tripId, t.destinationId] }),
    index("trip_destinations_destination_idx").on(t.destinationId),
  ],
);

export const tripMembers = pgTable(
  "trip_members",
  {
    tripId: text("trip_id")
      .notNull()
      .references(() => trips.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: memberRole("role").notNull().default("editor"),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
  },
  (t) => [
    primaryKey({ columns: [t.tripId, t.userId] }),
    index("trip_members_user_idx").on(t.userId),
  ],
);

export const tripInvites = pgTable(
  "trip_invites",
  {
    id: id(),
    token: text("token").notNull().unique(),
    tripId: text("trip_id")
      .notNull()
      .references(() => trips.id, { onDelete: "cascade" }),
    role: memberRole("role").notNull().default("editor"),
    email: text("email"),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    maxUses: integer("max_uses"),
    uses: integer("uses").notNull().default(0),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("trip_invites_trip_idx").on(t.tripId),
    uniqueIndex("trip_invites_token_idx").on(t.token),
  ],
);

export const sectionKind = pgEnum("section_kind", [
  "notes",
  "reservations",
  "places",
  "itinerary",
  "budget",
  "checklists",
  "journal",
  "explore",
  "custom",
]);

export const tripSections = pgTable(
  "trip_sections",
  {
    id: id(),
    tripId: text("trip_id")
      .notNull()
      .references(() => trips.id, { onDelete: "cascade" }),
    kind: sectionKind("kind").notNull(),
    title: text("title").notNull(),
    position: integer("position").notNull().default(0),
    collapsed: integer("collapsed").notNull().default(0),
  },
  (t) => [index("trip_sections_trip_idx").on(t.tripId)],
);

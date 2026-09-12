import { integer, jsonb, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";
import { id, timestamps } from "./_shared";
import { user } from "./auth";
import { trips } from "./trips";

export const guideStats = pgTable("guide_stats", {
  tripId: text("trip_id")
    .primaryKey()
    .references(() => trips.id, { onDelete: "cascade" }),
  views: integer("views").notNull().default(0),
  likes: integer("likes").notNull().default(0),
  copies: integer("copies").notNull().default(0),
});

export const guideLikes = pgTable(
  "guide_likes",
  {
    tripId: text("trip_id")
      .notNull()
      .references(() => trips.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.tripId, t.userId] })],
);

export const tripCopies = pgTable("trip_copies", {
  id: id(),
  sourceTripId: text("source_trip_id").references(() => trips.id, { onDelete: "set null" }),
  newTripId: text("new_trip_id")
    .notNull()
    .references(() => trips.id, { onDelete: "cascade" }),
  userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type TravelProfile = {
  tripsAnalyzed: number;
  avgStopsPerDay: number;
  avgDays: number;
  typicalStartTime: string | null;
  modeShare: Record<string, number>;
  categoryShare: Record<string, number>;
  cuisineShare: Record<string, number>;
  avgPriceLevel: number | null;
  countries: string[];
  destinationIds: string[];
  favoritePlaceIds: string[];
};

export const userTravelProfiles = pgTable("user_travel_profiles", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  data: jsonb("data").$type<TravelProfile>().notNull(),
  computedAt: timestamp("computed_at", { withTimezone: true }).notNull().defaultNow(),
});

export const pushSubscriptions = pgTable("push_subscriptions", {
  id: id(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  endpoint: text("endpoint").notNull().unique(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ListTemplateItem = { text: string };

export const listTemplates = pgTable("list_templates", {
  id: id(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  kind: text("kind").notNull().default("checklist"),
  items: jsonb("items").$type<ListTemplateItem[]>().notNull().default([]),
  ...timestamps,
});

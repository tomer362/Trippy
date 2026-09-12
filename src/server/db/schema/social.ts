import {
  boolean,
  index,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { timestamps } from "./_shared";
import { user } from "./auth";

export const friendshipStatus = pgEnum("friendship_status", ["pending", "accepted", "blocked"]);

export const userProfile = pgTable("user_profile", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  handle: text("handle").notNull().unique(),
  bio: text("bio"),
  homeCurrency: text("home_currency").notNull().default("USD"),
  homeDestinationId: text("home_destination_id"),
  isPublic: boolean("is_public").notNull().default(true),
  theme: text("theme").notNull().default("system"),
  notifyInvites: boolean("notify_invites").notNull().default(true),
  notifyComments: boolean("notify_comments").notNull().default(true),
  notifyTripReminders: boolean("notify_trip_reminders").notNull().default(true),
  ...timestamps,
});

export const friendship = pgTable(
  "friendship",
  {
    requesterId: text("requester_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    addresseeId: text("addressee_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    status: friendshipStatus("status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    respondedAt: timestamp("responded_at", { withTimezone: true }),
  },
  (t) => [
    primaryKey({ columns: [t.requesterId, t.addresseeId] }),
    index("friendship_addressee_idx").on(t.addresseeId),
  ],
);

export const follow = pgTable(
  "follow",
  {
    followerId: text("follower_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    followeeId: text("followee_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.followerId, t.followeeId] }),
    uniqueIndex("follow_followee_follower_idx").on(t.followeeId, t.followerId),
  ],
);

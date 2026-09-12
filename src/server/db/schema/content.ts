import {
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { id, timestamps } from "./_shared";
import { user } from "./auth";
import { trips } from "./trips";

export const tripNotes = pgTable("trip_notes", {
  tripId: text("trip_id")
    .primaryKey()
    .references(() => trips.id, { onDelete: "cascade" }),
  body: jsonb("body"),
  version: integer("version").notNull().default(1),
  ...timestamps,
});

export const checklistKind = pgEnum("checklist_kind", ["packing", "todo", "custom"]);

export const checklists = pgTable(
  "checklists",
  {
    id: id(),
    tripId: text("trip_id")
      .notNull()
      .references(() => trips.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    kind: checklistKind("kind").notNull().default("custom"),
    dayIndex: integer("day_index"),
    position: integer("position").notNull().default(0),
    version: integer("version").notNull().default(1),
    ...timestamps,
  },
  (t) => [index("checklists_trip_idx").on(t.tripId)],
);

export const checklistItems = pgTable(
  "checklist_items",
  {
    id: id(),
    checklistId: text("checklist_id")
      .notNull()
      .references(() => checklists.id, { onDelete: "cascade" }),
    text: text("text").notNull(),
    done: boolean("done").notNull().default(false),
    assignedTo: text("assigned_to").references(() => user.id, { onDelete: "set null" }),
    position: integer("position").notNull().default(0),
    ...timestamps,
  },
  (t) => [index("checklist_items_checklist_idx").on(t.checklistId)],
);

export const comments = pgTable(
  "comments",
  {
    id: id(),
    tripId: text("trip_id")
      .notNull()
      .references(() => trips.id, { onDelete: "cascade" }),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    ...timestamps,
  },
  (t) => [
    index("comments_entity_idx").on(t.entityType, t.entityId),
    index("comments_trip_idx").on(t.tripId),
  ],
);

export const reactions = pgTable(
  "reactions",
  {
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    emoji: text("emoji").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.entityType, t.entityId, t.userId, t.emoji] })],
);

export const journalEntries = pgTable(
  "journal_entries",
  {
    id: id(),
    tripId: text("trip_id")
      .notNull()
      .references(() => trips.id, { onDelete: "cascade" }),
    authorId: text("author_id").references(() => user.id, { onDelete: "set null" }),
    date: date("date"),
    dayIndex: integer("day_index"),
    tripPlaceId: text("trip_place_id"),
    title: text("title"),
    body: jsonb("body"),
    mood: text("mood"),
    lat: doublePrecision("lat"),
    lng: doublePrecision("lng"),
    version: integer("version").notNull().default(1),
    ...timestamps,
  },
  (t) => [index("journal_entries_trip_idx").on(t.tripId)],
);

export const journalPhotos = pgTable(
  "journal_photos",
  {
    id: id(),
    entryId: text("entry_id")
      .notNull()
      .references(() => journalEntries.id, { onDelete: "cascade" }),
    tripId: text("trip_id")
      .notNull()
      .references(() => trips.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    storageKey: text("storage_key").notNull(),
    width: integer("width"),
    height: integer("height"),
    takenAt: timestamp("taken_at", { withTimezone: true }),
    lat: doublePrecision("lat"),
    lng: doublePrecision("lng"),
    caption: text("caption"),
    position: integer("position").notNull().default(0),
    uploadedBy: text("uploaded_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("journal_photos_entry_idx").on(t.entryId),
    index("journal_photos_trip_idx").on(t.tripId),
  ],
);

export const activities = pgTable(
  "activities",
  {
    id: id(),
    tripId: text("trip_id")
      .notNull()
      .references(() => trips.id, { onDelete: "cascade" }),
    actorId: text("actor_id").references(() => user.id, { onDelete: "set null" }),
    type: text("type").notNull(),
    entityType: text("entity_type"),
    entityId: text("entity_id"),
    summary: text("summary").notNull(),
    payload: jsonb("payload"),
    undoneAt: timestamp("undone_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("activities_trip_created_idx").on(t.tripId, t.createdAt)],
);

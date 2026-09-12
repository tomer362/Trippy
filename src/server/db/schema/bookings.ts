import {
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { id, timestamps } from "./_shared";
import { user } from "./auth";
import { places } from "./geo";
import { trips } from "./trips";

export const lodgings = pgTable(
  "lodgings",
  {
    id: id(),
    tripId: text("trip_id")
      .notNull()
      .references(() => trips.id, { onDelete: "cascade" }),
    placeId: text("place_id").references(() => places.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    address: text("address"),
    lat: doublePrecision("lat"),
    lng: doublePrecision("lng"),
    checkIn: date("check_in").notNull(),
    checkOut: date("check_out").notNull(),
    checkInTime: text("check_in_time"),
    checkOutTime: text("check_out_time"),
    confirmationNo: text("confirmation_no"),
    price: numeric("price", { precision: 12, scale: 2 }),
    currency: text("currency"),
    bookingUrl: text("booking_url"),
    notes: text("notes"),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    version: integer("version").notNull().default(1),
    ...timestamps,
  },
  (t) => [index("lodgings_trip_idx").on(t.tripId)],
);

export const reservationKind = pgEnum("reservation_kind", [
  "flight",
  "train",
  "bus",
  "ferry",
  "car",
  "restaurant",
  "activity",
  "other",
]);

export type ReservationDetails = {
  // flight / train / bus / ferry
  carrier?: string;
  number?: string;
  fromCode?: string;
  fromName?: string;
  toCode?: string;
  toName?: string;
  seat?: string;
  terminal?: string;
  gate?: string;
  // car
  pickupLocation?: string;
  dropoffLocation?: string;
  vehicle?: string;
  // restaurant / activity
  partySize?: number;
  provider?: string;
  address?: string;
  url?: string;
  [key: string]: unknown;
};

export const reservations = pgTable(
  "reservations",
  {
    id: id(),
    tripId: text("trip_id")
      .notNull()
      .references(() => trips.id, { onDelete: "cascade" }),
    kind: reservationKind("kind").notNull(),
    title: text("title").notNull(),
    startAt: timestamp("start_at", { withTimezone: true }),
    endAt: timestamp("end_at", { withTimezone: true }),
    timezone: text("timezone"),
    placeId: text("place_id").references(() => places.id, { onDelete: "set null" }),
    details: jsonb("details").$type<ReservationDetails>().notNull().default({}),
    confirmationNo: text("confirmation_no"),
    price: numeric("price", { precision: 12, scale: 2 }),
    currency: text("currency"),
    notes: text("notes"),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    version: integer("version").notNull().default(1),
    ...timestamps,
  },
  (t) => [
    index("reservations_trip_idx").on(t.tripId),
    index("reservations_start_idx").on(t.startAt),
  ],
);

export const attachments = pgTable(
  "attachments",
  {
    id: id(),
    tripId: text("trip_id")
      .notNull()
      .references(() => trips.id, { onDelete: "cascade" }),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    storageKey: text("storage_key").notNull(),
    url: text("url").notNull(),
    filename: text("filename").notNull(),
    mime: text("mime").notNull(),
    size: integer("size").notNull(),
    isPrivate: integer("is_private").notNull().default(1),
    uploadedBy: text("uploaded_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("attachments_trip_idx").on(t.tripId),
    index("attachments_entity_idx").on(t.entityType, t.entityId),
  ],
);

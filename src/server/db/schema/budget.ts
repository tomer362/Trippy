import {
  date,
  doublePrecision,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { id, timestamps } from "./_shared";
import { user } from "./auth";
import { tripPlaces } from "./planning";
import { trips } from "./trips";

export const budgets = pgTable(
  "budgets",
  {
    id: id(),
    tripId: text("trip_id")
      .notNull()
      .references(() => trips.id, { onDelete: "cascade" }),
    userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    currency: text("currency").notNull(),
    ...timestamps,
  },
  (t) => [index("budgets_trip_idx").on(t.tripId)],
);

export const expenseCategory = pgEnum("expense_category", [
  "flights",
  "lodging",
  "transport",
  "food",
  "activities",
  "shopping",
  "fees",
  "other",
]);

export const splitMode = pgEnum("split_mode", ["equal", "exact", "shares", "percent", "none"]);

export const expenses = pgTable(
  "expenses",
  {
    id: id(),
    tripId: text("trip_id")
      .notNull()
      .references(() => trips.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    currency: text("currency").notNull(),
    amountHome: numeric("amount_home", { precision: 12, scale: 2 }),
    category: expenseCategory("category").notNull().default("other"),
    paidBy: text("paid_by").references(() => user.id, { onDelete: "set null" }),
    occurredOn: date("occurred_on"),
    dayIndex: integer("day_index"),
    tripPlaceId: text("trip_place_id").references(() => tripPlaces.id, { onDelete: "set null" }),
    refType: text("ref_type"),
    refId: text("ref_id"),
    splitMode: splitMode("split_mode").notNull().default("equal"),
    notes: text("notes"),
    receiptUrl: text("receipt_url"),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    version: integer("version").notNull().default(1),
    ...timestamps,
  },
  (t) => [index("expenses_trip_idx").on(t.tripId), index("expenses_occurred_idx").on(t.occurredOn)],
);

export const expenseShares = pgTable(
  "expense_shares",
  {
    expenseId: text("expense_id")
      .notNull()
      .references(() => expenses.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    weight: doublePrecision("weight"),
  },
  (t) => [primaryKey({ columns: [t.expenseId, t.userId] })],
);

export const settlements = pgTable(
  "settlements",
  {
    id: id(),
    tripId: text("trip_id")
      .notNull()
      .references(() => trips.id, { onDelete: "cascade" }),
    fromUserId: text("from_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    toUserId: text("to_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    currency: text("currency").notNull(),
    note: text("note"),
    settledAt: timestamp("settled_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("settlements_trip_idx").on(t.tripId)],
);

export const fxRates = pgTable(
  "fx_rates",
  {
    base: text("base").notNull(),
    quote: text("quote").notNull(),
    rate: doublePrecision("rate").notNull(),
    asOf: date("as_of").notNull(),
  },
  (t) => [primaryKey({ columns: [t.base, t.quote] })],
);

import { index, integer, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Fixed-window rate counters. One row per (bucket, subject) rather than one per window, so the
 * table stays bounded by active users rather than growing with traffic; the window start is
 * rolled forward in place by the same statement that increments the count.
 */
export const rateLimits = pgTable(
  "rate_limits",
  {
    bucket: text("bucket").notNull(),
    /** "u:<userId>" for a signed-in caller, "ip:<hash>" for an anonymous one. */
    subject: text("subject").notNull(),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull().defaultNow(),
    count: integer("count").notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.bucket, t.subject] }),
    index("rate_limits_window_idx").on(t.windowStart),
  ],
);

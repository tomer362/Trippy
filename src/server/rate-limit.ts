import "server-only";
import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { env } from "@/env";
import { db } from "@/server/db";

/**
 * Two layers, because neither alone is right for this deployment.
 *
 * A per-instance burst guard is free and stops the obvious runaway loop, but serverless
 * functions scale horizontally so it is a filter, never a boundary. The Postgres window is the
 * real limit, and it costs one round trip — which is why only the buckets that spend money on a
 * third-party API pay for it. Autocomplete and photos fire per keystroke and per card; a
 * database write on those would keep Neon awake and cost more than it saves.
 */

export type RateRule = {
  /** Durable fixed window. Omitted for buckets that are only burst-guarded. */
  window?: { limit: number; seconds: number };
  /** Per-instance burst guard. Always on, always free. */
  burst: { limit: number; ms: number };
};

export const RATE_RULES = {
  // Text Search: the priciest call here, and one tap of a category chip triggers it.
  "places.search": { window: { limit: 60, seconds: 600 }, burst: { limit: 8, ms: 10_000 } },
  // Place Details with the Enterprise mask.
  "places.details": { window: { limit: 150, seconds: 600 }, burst: { limit: 15, ms: 10_000 } },
  // Unauthenticated, and falls through to Google Autocomplete: the highest-priority bucket.
  "destinations.search": { window: { limit: 60, seconds: 600 }, burst: { limit: 10, ms: 10_000 } },
  "destinations.promote": { window: { limit: 20, seconds: 3600 }, burst: { limit: 3, ms: 10_000 } },
  // Fetches an arbitrary page for up to 12s; low volume, so a tight window is free.
  "import.url": { window: { limit: 10, seconds: 3600 }, burst: { limit: 2, ms: 10_000 } },
  // Charged per Routes call actually issued, not per request.
  "routes.legs": { window: { limit: 300, seconds: 3600 }, burst: { limit: 40, ms: 60_000 } },
  "places.autocomplete": { burst: { limit: 25, ms: 10_000 } },
  "places.photo": { burst: { limit: 60, ms: 10_000 } },
} as const satisfies Record<string, RateRule>;

export type RateBucket = keyof typeof RATE_RULES;

export type RateVerdict =
  | { ok: true; remaining: number }
  | { ok: false; retryAfterS: number; scope: "burst" | "window" };

type Slot = { n: number; resetAt: number };
const MAX_BURST_KEYS = 5_000;
// Pinned to globalThis so it survives dev hot reloads rather than silently resetting.
const store = globalThis as unknown as { __trippyBurst?: Map<string, Slot> };
if (!store.__trippyBurst) store.__trippyBurst = new Map<string, Slot>();
const burstCounts = store.__trippyBurst;

function chargeBurst(key: string, rule: RateRule["burst"], cost: number): boolean {
  const now = Date.now();
  const slot = burstCounts.get(key);
  if (!slot || slot.resetAt <= now) {
    // Cheap bound: a long-lived instance must not accumulate keys forever.
    if (burstCounts.size >= MAX_BURST_KEYS) burstCounts.clear();
    burstCounts.set(key, { n: cost, resetAt: now + rule.ms });
    return cost <= rule.limit;
  }
  slot.n += cost;
  return slot.n <= rule.limit;
}

/** Anonymous callers are keyed by IP, hashed so the table is not a log of who visited. */
export function subjectFromRequest(req: Request, userId: string | null): string {
  if (userId) return `u:${userId}`;
  // Vercel rewrites x-forwarded-for, so the first entry is the real client; never trust
  // x-real-ip, which a client can set.
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0]?.trim() || "unknown";
  const hash = createHash("sha256").update(`${ip}${env.BETTER_AUTH_SECRET}`).digest("hex");
  return `ip:${hash.slice(0, 16)}`;
}

/**
 * Charges `cost` units against a bucket. Fails open on any database error: a limiter that
 * takes the app down is worse than the abuse it prevents.
 */
export async function charge(bucket: RateBucket, subject: string, cost = 1): Promise<RateVerdict> {
  const rule: RateRule = RATE_RULES[bucket];
  if (!chargeBurst(`${bucket}:${subject}`, rule.burst, cost))
    return { ok: false, retryAfterS: Math.ceil(rule.burst.ms / 1000), scope: "burst" };
  if (!rule.window) return { ok: true, remaining: rule.burst.limit };

  const { limit, seconds } = rule.window;
  try {
    const rows = await db.execute<{ count: number }>(sql`
      INSERT INTO rate_limits (bucket, subject, window_start, count)
      VALUES (${bucket}, ${subject}, now(), ${cost})
      ON CONFLICT (bucket, subject) DO UPDATE SET
        count = CASE
          WHEN rate_limits.window_start < now() - make_interval(secs => ${seconds})
          THEN excluded.count ELSE rate_limits.count + excluded.count END,
        window_start = CASE
          WHEN rate_limits.window_start < now() - make_interval(secs => ${seconds})
          THEN now() ELSE rate_limits.window_start END
      RETURNING count
    `);
    const used = Number(rows.rows[0]?.count ?? 0);
    if (used > limit) return { ok: false, retryAfterS: seconds, scope: "window" };
    return { ok: true, remaining: Math.max(0, limit - used) };
  } catch (err) {
    console.error("rate limit check failed, allowing the request", bucket, err);
    return { ok: true, remaining: limit };
  }
}

/** Route-handler sugar: returns a ready 429, or null when the caller may proceed. */
export async function guard(
  req: Request,
  bucket: RateBucket,
  userId: string | null,
): Promise<Response | null> {
  const verdict = await charge(bucket, subjectFromRequest(req, userId));
  if (verdict.ok) return null;
  return Response.json(
    { error: "rate_limited", retryAfterS: verdict.retryAfterS },
    { status: 429, headers: { "Retry-After": String(verdict.retryAfterS) } },
  );
}

/** Test seam: the burst layer is process-global, so tests need to reset it. */
export function __resetBurstForTests() {
  burstCounts.clear();
}

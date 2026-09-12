import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { fxRates } from "@/server/db/schema";

/**
 * Exchange rates are cached in the database and refreshed once a day by a scheduled job.
 * Expenses always keep the currency they were paid in; the trip total is converted for
 * display, so a stale rate never corrupts stored data.
 */
const SOURCE = "https://api.frankfurter.dev/v1/latest";

export async function getRate(base: string, quote: string): Promise<number | null> {
  if (base === quote) return 1;
  const [row] = await db
    .select({ rate: fxRates.rate })
    .from(fxRates)
    .where(and(eq(fxRates.base, base), eq(fxRates.quote, quote)))
    .limit(1);
  if (row) return row.rate;
  // Try the inverse pair before giving up.
  const [inverse] = await db
    .select({ rate: fxRates.rate })
    .from(fxRates)
    .where(and(eq(fxRates.base, quote), eq(fxRates.quote, base)))
    .limit(1);
  return inverse && inverse.rate !== 0 ? 1 / inverse.rate : null;
}

export async function getRates(base: string): Promise<Map<string, number>> {
  const rows = await db.select().from(fxRates).where(eq(fxRates.base, base));
  const map = new Map<string, number>([[base, 1]]);
  for (const r of rows) map.set(r.quote, r.rate);
  return map;
}

/** Converts minor units between currencies, returning null when no rate is known. */
export async function convertCents(
  cents: number,
  from: string,
  to: string,
): Promise<number | null> {
  const rate = await getRate(from, to);
  return rate === null ? null : Math.round(cents * rate);
}

export const FX_BASES = [
  "USD",
  "EUR",
  "GBP",
  "ILS",
  "JPY",
  "AUD",
  "CAD",
  "CHF",
  "THB",
  "MXN",
  "INR",
  "BRL",
  "NZD",
  "SGD",
  "TRY",
];

/** Pulls fresh rates for the currencies our users pick between. Called by the daily job. */
export async function refreshRates(): Promise<{ pairs: number; bases: number; errors: string[] }> {
  const errors: string[] = [];
  const asOf = new Date().toISOString().slice(0, 10);
  let pairs = 0;
  let bases = 0;
  for (const base of FX_BASES) {
    try {
      const res = await fetch(`${SOURCE}?base=${base}`, { cache: "no-store" });
      if (!res.ok) {
        errors.push(`${base}: ${res.status}`);
        continue;
      }
      const data = (await res.json()) as { rates?: Record<string, number> };
      const entries = Object.entries(data.rates ?? {}).filter(([quote]) =>
        FX_BASES.includes(quote),
      );
      if (entries.length === 0) {
        errors.push(`${base}: no rates`);
        continue;
      }
      await db
        .insert(fxRates)
        .values(entries.map(([quote, rate]) => ({ base, quote, rate, asOf })))
        .onConflictDoUpdate({
          target: [fxRates.base, fxRates.quote],
          set: { rate: sql`excluded.rate`, asOf: sql`excluded.as_of` },
        });
      pairs += entries.length;
      bases += 1;
    } catch (err) {
      errors.push(`${base}: ${err instanceof Error ? err.message : "failed"}`);
    }
  }
  return { pairs, bases, errors };
}

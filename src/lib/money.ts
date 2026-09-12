/** Money is handled in minor units (cents) so splitting never loses or invents a penny. */
export function toCents(value: string | number | null | undefined): number {
  if (value === null || value === undefined || value === "") return 0;
  const n = typeof value === "number" ? value : Number.parseFloat(value.replace(/,/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

export function fromCents(cents: number): string {
  return (cents / 100).toFixed(2);
}

export function formatMoney(cents: number, currency: string, locale?: string): string {
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(cents / 100);
  } catch {
    return `${fromCents(cents)} ${currency}`;
  }
}

/**
 * Splits `total` across `weights` so the parts always add back up to `total`.
 * Leftover minor units go to the largest fractional remainders, ties broken by order.
 */
export function allocate(total: number, weights: number[]): number[] {
  const positive = weights.map((w) => (Number.isFinite(w) && w > 0 ? w : 0));
  const sum = positive.reduce((a, b) => a + b, 0);
  if (sum <= 0) {
    if (weights.length === 0) return [];
    // No usable weights: fall back to an even split.
    return allocate(
      total,
      weights.map(() => 1),
    );
  }
  const sign = total < 0 ? -1 : 1;
  const magnitude = Math.abs(total);
  const exact = positive.map((w) => (magnitude * w) / sum);
  const floors = exact.map((v) => Math.floor(v));
  let remainder = magnitude - floors.reduce((a, b) => a + b, 0);
  const order = exact
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  const out = [...floors];
  for (const { i } of order) {
    if (remainder <= 0) break;
    out[i] = (out[i] ?? 0) + 1;
    remainder -= 1;
  }
  return out.map((v) => v * sign);
}

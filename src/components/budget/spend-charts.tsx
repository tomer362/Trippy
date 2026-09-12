"use client";
import { Tooltip } from "@/components/ui/misc";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";

/**
 * Single-series magnitude charts drawn in plain HTML, so the marks follow the house
 * specs exactly: one hue, capped bar thickness, rounded data ends, a 2px surface gap
 * between neighbours, hairline gridlines, and values as text rather than colour alone.
 */

export type Slice = { key: string; label: string; cents: number };

function share(cents: number, total: number) {
  return total <= 0 ? 0 : Math.round((cents / total) * 100);
}

/** A single ratio against a limit: a meter, never a two-slice pie. */
export function BudgetMeter({
  spentCents,
  budgetCents,
  currency,
  label,
}: {
  spentCents: number;
  budgetCents: number | null;
  currency: string;
  label: string;
}) {
  const pct =
    budgetCents && budgetCents > 0
      ? Math.min(100, Math.round((spentCents / budgetCents) * 100))
      : null;
  const over = budgetCents !== null && spentCents > budgetCents;
  return (
    <div className="rounded-3xl border border-border bg-card p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="text-3xl font-extrabold tracking-tight">{formatMoney(spentCents, currency)}</p>
      {budgetCents !== null ? (
        <>
          <div
            className="mt-3 h-2 overflow-hidden rounded-full bg-chart-track"
            role="img"
            aria-label={`${pct}% of budget used`}
          >
            <div
              className="h-full rounded-full"
              style={{
                width: `${pct}%`,
                backgroundColor: over ? "var(--destructive)" : "var(--chart-mark)",
              }}
            />
          </div>
          <p
            className={cn(
              "mt-1.5 text-sm",
              over ? "font-semibold text-destructive" : "text-muted-foreground",
            )}
          >
            {over
              ? `${formatMoney(spentCents - budgetCents, currency)} over the ${formatMoney(budgetCents, currency)} budget`
              : `${pct}% of ${formatMoney(budgetCents, currency)}`}
          </p>
        </>
      ) : (
        <p className="mt-1.5 text-sm text-muted-foreground">No budget set</p>
      )}
    </div>
  );
}

/** Magnitude across named classes: horizontal bars, sorted, value at the tip. */
export function CategoryBars({
  slices,
  currency,
  title,
}: {
  slices: Slice[];
  currency: string;
  title: string;
}) {
  const total = slices.reduce((sum, s) => sum + s.cents, 0);
  const max = Math.max(1, ...slices.map((s) => s.cents));
  if (slices.length === 0) return null;
  return (
    <figure className="rounded-3xl border border-border bg-card p-4">
      <figcaption className="mb-3 font-bold">{title}</figcaption>
      <ul className="space-y-2">
        {slices.map((s) => (
          <li key={s.key}>
            <div className="mb-0.5 flex items-baseline justify-between gap-3 text-sm">
              <span className="truncate font-medium">{s.label}</span>
              <span className="shrink-0 tabular-nums text-muted-foreground">
                {formatMoney(s.cents, currency)}{" "}
                <span className="text-xs">({share(s.cents, total)}%)</span>
              </span>
            </div>
            <Tooltip
              content={`${s.label}: ${formatMoney(s.cents, currency)} · ${share(s.cents, total)}% of spend`}
            >
              <div className="h-2.5 w-full rounded-full bg-chart-track">
                <div
                  className="h-full rounded-full bg-chart-mark"
                  style={{ width: `${Math.max(2, (s.cents / max) * 100)}%` }}
                />
              </div>
            </Tooltip>
          </li>
        ))}
      </ul>
    </figure>
  );
}

/** Spend over the days of the trip: columns on a single baseline, extreme labelled. */
export function DayColumns({
  slices,
  currency,
  title,
}: {
  slices: Slice[];
  currency: string;
  title: string;
}) {
  if (slices.length === 0) return null;
  const max = Math.max(1, ...slices.map((s) => s.cents));
  const peak = slices.reduce((best, s) => (s.cents > best.cents ? s : best), slices[0]!);
  return (
    <figure className="rounded-3xl border border-border bg-card p-4">
      <figcaption className="mb-1 font-bold">{title}</figcaption>
      <p className="mb-3 text-xs text-muted-foreground">
        Biggest day: {peak.label} at {formatMoney(peak.cents, currency)}
      </p>
      <div className="flex h-36 items-end gap-[2px]">
        {slices.map((s) => (
          <Tooltip key={s.key} content={`${s.label}: ${formatMoney(s.cents, currency)}`}>
            <div className="flex h-full min-w-2 flex-1 flex-col justify-end">
              <div
                className="w-full rounded-t bg-chart-mark"
                style={{ height: `${Math.max(1, (s.cents / max) * 100)}%`, maxWidth: 24 }}
                aria-hidden
              />
            </div>
          </Tooltip>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-xs text-muted-foreground">
        <span>{slices[0]?.label}</span>
        {slices.length > 1 && <span>{slices.at(-1)?.label}</span>}
      </div>
      <details className="mt-3">
        <summary className="cursor-pointer text-xs text-muted-foreground">Show the numbers</summary>
        <table className="mt-2 w-full text-sm">
          <thead className="text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th scope="col" className="font-semibold">
                Day
              </th>
              <th scope="col" className="text-right font-semibold">
                Spend
              </th>
            </tr>
          </thead>
          <tbody>
            {slices.map((s) => (
              <tr key={s.key} className="border-t border-border">
                <td className="py-1">{s.label}</td>
                <td className="py-1 text-right tabular-nums">{formatMoney(s.cents, currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}

/** A handful of headline numbers is a row of stat tiles, not a chart. */
export function PersonTotals({
  people,
  currency,
}: {
  people: Array<{ userId: string; name: string; cents: number }>;
  currency: string;
}) {
  if (people.length === 0) return null;
  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {people.map((p) => (
        <div key={p.userId} className="rounded-2xl border border-border bg-card p-3">
          <p className="truncate text-sm text-muted-foreground">{p.name} paid</p>
          <p className="text-xl font-bold tabular-nums">{formatMoney(p.cents, currency)}</p>
        </div>
      ))}
    </div>
  );
}

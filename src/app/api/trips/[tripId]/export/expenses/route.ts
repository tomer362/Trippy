import { getSession } from "@/lib/auth";
import { fromCents } from "@/lib/money";
import { getTripAccess } from "@/server/authz";
import { getBudget } from "@/server/queries/budget";

export const dynamic = "force-dynamic";

function csvCell(value: string | number | null | undefined): string {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Expenses as CSV, for anyone who would rather finish the maths in a spreadsheet. */
export async function GET(_req: Request, ctx: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await ctx.params;
  const session = await getSession();
  const access = await getTripAccess(tripId, session?.user.id ?? null);
  if (!access?.isMember) return new Response("Forbidden", { status: 403 });

  const data = await getBudget(tripId, session?.user.id ?? null, access.trip.currency);
  const header = [
    "Date",
    "Title",
    "Category",
    "Amount",
    "Currency",
    `Amount (${data.currency})`,
    "Paid by",
    "Split",
    "Notes",
  ];
  const rows = data.expenses.map((e) => [
    e.occurredOn ?? "",
    e.title,
    e.category,
    fromCents(e.amountCents),
    e.currency,
    e.tripAmountCents === null ? "" : fromCents(e.tripAmountCents),
    e.paidByName ?? "",
    e.splitMode,
    e.notes ?? "",
  ]);
  const csv = [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
  const filename = `${access.trip.slug}-expenses.csv`;

  return new Response(`﻿${csv}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

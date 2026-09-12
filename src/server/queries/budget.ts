import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { toCents } from "@/lib/money";
import { computeBalances, type ExpenseForBalance, settleUp, type Transfer } from "@/lib/split";
import { db } from "@/server/db";
import { budgets, expenseShares, expenses, settlements, user } from "@/server/db/schema";
import { getRates } from "@/server/services/fx";

export type ExpenseDTO = {
  id: string;
  title: string;
  amountCents: number;
  currency: string;
  /** Converted into the trip currency for totals; null when no rate is known. */
  tripAmountCents: number | null;
  category: string;
  paidBy: string | null;
  paidByName: string | null;
  occurredOn: string | null;
  dayIndex: number | null;
  tripPlaceId: string | null;
  splitMode: "equal" | "exact" | "shares" | "percent" | "none";
  notes: string | null;
  receiptUrl: string | null;
  shares: Array<{ userId: string; amountCents: number; weight: number | null }>;
  version: number;
};

export type SettlementDTO = {
  id: string;
  fromUserId: string;
  toUserId: string;
  fromName: string | null;
  toName: string | null;
  amountCents: number;
  currency: string;
  note: string | null;
  settledAt: string;
};

export type BudgetData = {
  currency: string;
  groupBudgetCents: number | null;
  personalBudgetCents: number | null;
  expenses: ExpenseDTO[];
  settlements: SettlementDTO[];
  balances: Array<{ userId: string; name: string; cents: number }>;
  transfers: Array<Transfer & { fromName: string; toName: string }>;
  totalCents: number;
  unconvertedCurrencies: string[];
};

export async function getBudget(
  tripId: string,
  viewerId: string | null,
  tripCurrency: string,
): Promise<BudgetData> {
  const [budgetRows, expenseRows, shareRows, settlementRows, rates] = await Promise.all([
    db.select().from(budgets).where(eq(budgets.tripId, tripId)),
    db
      .select({ e: expenses, payerName: user.name })
      .from(expenses)
      .leftJoin(user, eq(user.id, expenses.paidBy))
      .where(eq(expenses.tripId, tripId))
      .orderBy(desc(expenses.occurredOn), desc(expenses.createdAt)),
    db
      .select({ s: expenseShares, e: expenses.id })
      .from(expenseShares)
      .innerJoin(expenses, eq(expenses.id, expenseShares.expenseId))
      .where(eq(expenses.tripId, tripId)),
    db
      .select()
      .from(settlements)
      .where(eq(settlements.tripId, tripId))
      .orderBy(desc(settlements.settledAt)),
    getRates(tripCurrency),
  ]);

  const sharesByExpense = new Map<string, ExpenseDTO["shares"]>();
  for (const row of shareRows) {
    const list = sharesByExpense.get(row.s.expenseId) ?? [];
    list.push({
      userId: row.s.userId,
      amountCents: toCents(row.s.amount),
      weight: row.s.weight ?? null,
    });
    sharesByExpense.set(row.s.expenseId, list);
  }

  const unconverted = new Set<string>();
  const toTrip = (cents: number, currency: string): number | null => {
    if (currency === tripCurrency) return cents;
    // Rates are stored as trip-currency -> other, so divide to come back.
    const rate = rates.get(currency);
    if (!rate || rate === 0) {
      unconverted.add(currency);
      return null;
    }
    return Math.round(cents / rate);
  };

  const expenseList: ExpenseDTO[] = expenseRows.map(({ e, payerName }) => {
    const amountCents = toCents(e.amount);
    return {
      id: e.id,
      title: e.title,
      amountCents,
      currency: e.currency,
      tripAmountCents: toTrip(amountCents, e.currency),
      category: e.category,
      paidBy: e.paidBy,
      paidByName: payerName ?? null,
      occurredOn: e.occurredOn,
      dayIndex: e.dayIndex,
      tripPlaceId: e.tripPlaceId,
      splitMode: e.splitMode,
      notes: e.notes,
      receiptUrl: e.receiptUrl,
      shares: sharesByExpense.get(e.id) ?? [],
      version: e.version,
    };
  });

  const names = new Map<string, string>();
  for (const row of expenseRows)
    if (row.e.paidBy && row.payerName) names.set(row.e.paidBy, row.payerName);
  const settlementList: SettlementDTO[] = [];
  for (const s of settlementRows) {
    settlementList.push({
      id: s.id,
      fromUserId: s.fromUserId,
      toUserId: s.toUserId,
      fromName: names.get(s.fromUserId) ?? null,
      toName: names.get(s.toUserId) ?? null,
      amountCents: toCents(s.amount),
      currency: s.currency,
      note: s.note,
      settledAt: s.settledAt.toISOString(),
    });
  }

  // Balances use trip-currency amounts, skipping expenses we cannot convert.
  const forBalance: ExpenseForBalance[] = expenseList
    .filter((e) => e.tripAmountCents !== null && e.splitMode !== "none")
    .map((e) => {
      const converted = e.tripAmountCents!;
      const factor = e.amountCents === 0 ? 1 : converted / e.amountCents;
      return {
        amountCents: converted,
        paidBy: e.paidBy,
        shares: e.shares.map((s) => ({
          userId: s.userId,
          amountCents: Math.round(s.amountCents * factor),
        })),
      };
    });
  const balanceMap = computeBalances(
    forBalance,
    settlementList.map((s) => ({
      fromUserId: s.fromUserId,
      toUserId: s.toUserId,
      amountCents: s.amountCents,
    })),
  );
  const transfers = settleUp(balanceMap);

  const groupBudget = budgetRows.find((b) => b.userId === null);
  const personalBudget = viewerId ? budgetRows.find((b) => b.userId === viewerId) : undefined;

  return {
    currency: tripCurrency,
    groupBudgetCents: groupBudget ? toCents(groupBudget.amount) : null,
    personalBudgetCents: personalBudget ? toCents(personalBudget.amount) : null,
    expenses: expenseList,
    settlements: settlementList,
    balances: [...balanceMap.entries()].map(([userId, cents]) => ({
      userId,
      name: names.get(userId) ?? "Trip mate",
      cents,
    })),
    transfers: transfers.map((t) => ({
      ...t,
      fromName: names.get(t.fromUserId) ?? "Trip mate",
      toName: names.get(t.toUserId) ?? "Trip mate",
    })),
    totalCents: expenseList.reduce((sum, e) => sum + (e.tripAmountCents ?? 0), 0),
    unconvertedCurrencies: [...unconverted],
  };
}

export async function getExpenseForEdit(tripId: string, id: string) {
  const [row] = await db
    .select()
    .from(expenses)
    .where(and(eq(expenses.id, id), eq(expenses.tripId, tripId)))
    .limit(1);
  return row ?? null;
}
